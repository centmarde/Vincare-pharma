import { ref, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useStockTransfersDataStore } from '@/stores/stockTransfersData'
import type { StockTransferType, StockTransferItemType, TransferSubstitute, TransferSubstitutionNote } from '@/stores/stockTransfersData'
import { formatCurrency, formatExpiryMonthYear } from '@/utils/helpers'
import { useConfirmDialog } from '@/composables/useConfirmDialog'

const toast = useToast()

export function useStockTransferDetail(
  transfer: () => StockTransferType | null,
  onReceived: () => void,
  // True while a warehouse approver has the dialog open — the only time the
  // on-hand figures are read and shown.
  checkStock: () => boolean = () => false,
) {
  const transfersStore = useStockTransfersDataStore()

  // ─── State ────────────────────────────────────────────────────────
  const loading = ref(false)
  const receivedQtys = ref<Record<number, number>>({})

  // ─── Computed ─────────────────────────────────────────────────────
  const items = computed(() => transfer()?.stock_transfer_items ?? [])
  const isPendingApproval = computed(() => transfer()?.status === 'pending_approval')
  const isApproved = computed(() => transfer()?.status === 'approved')

  // ─── Warehouse stock (approver view of a pending transfer) ────────
  // Read fresh on open, so a shortage shows on its line before Approve is
  // pressed — not as one long error after it.
  const onHand = ref<Map<number, number> | null>(null)
  const stockLoading = ref(false)
  let stockRequest = 0

  async function loadStock() {
    const request = ++stockRequest
    const t = transfer()
    if (!t || t.status !== 'pending_approval' || !checkStock()) {
      onHand.value = null
      stockLoading.value = false
      return
    }
    const ids = [...new Set(items.value.map((i) => i.product_id).filter((id): id is number => id != null))]
    stockLoading.value = true
    const stock = await transfersStore.fetchMainStock(ids)
    // A newer open (another transfer, or closed) has taken over.
    if (request !== stockRequest) return
    onHand.value = stock
    stockLoading.value = false
  }

  watch(() => [transfer()?.id, transfer()?.status, checkStock()], loadStock, { immediate: true })

  // Totalled per product, the way approveTransfer checks it: two lines of one
  // product can each fit while the pair does not.
  const neededByProduct = computed(() => {
    const needed = new Map<number, number>()
    for (const i of items.value) {
      if (i.product_id == null) continue
      needed.set(i.product_id, (needed.get(i.product_id) ?? 0) + (i.requested_qty ?? 0))
    }
    return needed
  })

  /** Units the warehouse is missing for this line's product; 0 when it is covered or stock is unknown. */
  function shortBy(item: StockTransferItemType): number {
    if (!onHand.value || item.product_id == null) return 0
    const needed = neededByProduct.value.get(item.product_id) ?? 0
    return Math.max(0, needed - (onHand.value.get(item.product_id) ?? 0))
  }

  function onHandFor(item: StockTransferItemType): number | null {
    if (!onHand.value || item.product_id == null) return null
    return onHand.value.get(item.product_id) ?? 0
  }

  const shortProductCount = computed(() =>
    [...neededByProduct.value.keys()].filter((id) =>
      onHand.value != null && (neededByProduct.value.get(id) ?? 0) > (onHand.value.get(id) ?? 0),
    ).length,
  )

  // Short lines first, so the approver doesn't scroll a long transfer for them.
  const displayItems = computed(() => {
    if (!onHand.value || !shortProductCount.value) return items.value
    return [...items.value].sort((a, b) => Number(shortBy(b) > 0) - Number(shortBy(a) > 0))
  })

  /** "Batch X · Exp MM/YYYY" — several products rows share a name, one per batch. */
  function batchLabel(item: StockTransferItemType): string {
    const p = item.product
    return [
      p?.batch_no ? `Batch ${p.batch_no}` : null,
      p?.expiry_date ? `Exp ${formatExpiryMonthYear(p.expiry_date)}` : null,
    ].filter(Boolean).join(' · ')
  }

  const missingReceivedQty = computed(() =>
    items.value.filter(i => !receivedQtys.value[i.id] || receivedQtys.value[i.id] <= 0).length
  )

  // Pre-fill received qty inputs with the requested qty as a sane default
  watch(items, (newItems) => {
    for (const item of newItems) {
      if (receivedQtys.value[item.id] == null) {
        receivedQtys.value[item.id] = item.requested_qty
      }
    }
  }, { immediate: true })

  // ─── Send another batch / brand (approver, pending transfers) ─────
  // When the warehouse does not have the requested batch or brand but holds
  // another batch of the same product, the approver swaps the line before
  // approving. Approve then checks and deducts the batch actually sent.
  const swapItem = ref<StockTransferItemType | null>(null)
  const swapOptions = ref<TransferSubstitute[]>([])
  const swapLoading = ref(false)
  const swapFailed = ref(false)
  /** The option being saved, so only its button spins. */
  const swapSavingId = ref<number | null>(null)

  async function openSwap(item: StockTransferItemType) {
    if (item.product_id == null) return
    swapItem.value = item
    swapOptions.value = []
    swapFailed.value = false
    swapLoading.value = true
    // Options that cannot cover this line's quantity come back marked. What the
    // other lines already ask for counts too: Approve totals per product.
    const found = await transfersStore.fetchTransferSubstitutes(
      item.product_id, item.requested_qty ?? 0, neededByProduct.value,
    )
    if (swapItem.value?.id !== item.id) return
    swapLoading.value = false
    if (found === null) { swapFailed.value = true; return }
    swapOptions.value = found
  }

  function closeSwap() {
    swapItem.value = null
  }

  /** "Box" and "box " are the same unit. */
  function normUnit(unit: string | null | undefined): string {
    return (unit ?? '').trim().toLowerCase()
  }

  function differentUnit(option: TransferSubstitute): boolean {
    const requested = swapItem.value?.product?.unit
    return !!normUnit(option.unit) && !!normUnit(requested) && normUnit(option.unit) !== normUnit(requested)
  }

  /** Whole months until expiry; null when there is no expiry date. */
  function monthsLeft(expiry: string | null): number | null {
    if (!expiry) return null
    const [y, m, d] = expiry.slice(0, 10).split('-').map(Number)
    const now = new Date()
    let months = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth())
    if (d < now.getDate()) months -= 1
    return Math.max(0, months)
  }

  /** Under this many months the branch may not sell it in time — say so. */
  const shortShelfLifeMonths = 3

  // ─── Lines the warehouse changed (both sides see them) ────────────
  const substitutionNotes = ref<TransferSubstitutionNote[]>([])
  let notesRequest = 0

  async function loadSubstitutionNotes() {
    const request = ++notesRequest
    const t = transfer()
    if (!t) { substitutionNotes.value = []; return }
    const notes = await transfersStore.fetchSubstitutionNotes(t.id)
    if (request !== notesRequest) return
    substitutionNotes.value = notes
  }

  watch(() => [transfer()?.id, transfer()?.updated_at], loadSubstitutionNotes, { immediate: true })

  const { confirmDialog } = useConfirmDialog()

  /**
   * Swap the line; true when it changed, so the dialog refreshes. A different
   * unit (103 boxes is not 103 bottles) or selling price is asked about first:
   * units are labelled inconsistently in the data, so it is not refused
   * outright, but it must be a deliberate choice.
   */
  async function chooseSwap(productId: number): Promise<boolean> {
    const t = transfer()
    const item = swapItem.value
    if (!t || !item) return false
    const option = swapOptions.value.find((o) => o.id === productId)
    const requested = item.product
    const warnings: string[] = []
    if (option && differentUnit(option)) {
      warnings.push(`The unit is different: requested ${item.requested_qty} ${requested?.unit ?? ''}, this batch is counted in ${option.unit}. ${item.requested_qty} ${option.unit} will be sent.`)
    }
    if (option?.selling_price && requested?.selling_price && Number(option.selling_price) !== Number(requested.selling_price)) {
      warnings.push(`The selling price is different: ${formatCurrency(Number(option.selling_price))} instead of ${formatCurrency(Number(requested.selling_price))}. The branch will sell it at ${formatCurrency(Number(option.selling_price))}.`)
    }
    if (warnings.length) {
      const ok = await confirmDialog(warnings.join('\n\n'), { title: 'Send this batch instead?', confirmText: 'Yes, send it' })
      if (!ok) return false
    }
    swapSavingId.value = productId
    const result = await transfersStore.substituteTransferLine(t.id, item.id, productId, item.product_id)
    swapSavingId.value = null
    if (!result.success) return false
    swapItem.value = null
    await loadSubstitutionNotes()
    return true
  }

  // ─── Actions ──────────────────────────────────────────────────────
  async function handleApprove() {
    const t = transfer()
    if (!t) return
    loading.value = true
    const approved = await transfersStore.approveTransfer(t.id)
    loading.value = false
    // Stock may have moved since the dialog opened — show what blocked it.
    if (!approved) await loadStock()
  }

  async function handleReject() {
    const t = transfer()
    if (!t) return
    loading.value = true
    await transfersStore.rejectTransfer(t.id)
    loading.value = false
  }

  async function handleMarkReceived() {
    const t = transfer()
    if (!t || !t.warehouse_id) return

    if (missingReceivedQty.value > 0) {
      toast.warning('Please enter a received quantity for every item.')
      return
    }

    loading.value = true

    const receivedItems = items.value.map(item => ({
      item_id:      item.id,
      received_qty: receivedQtys.value[item.id],
    }))

    const success = await transfersStore.receiveTransfer(t.id, receivedItems)

    loading.value = false

    if (success) onReceived()
  }

  return {
    loading, receivedQtys, items, displayItems,
    isPendingApproval, isApproved, missingReceivedQty,
    onHand, stockLoading, shortProductCount, shortBy, onHandFor, batchLabel,
    handleApprove, handleReject, handleMarkReceived, loadStock,
    swapItem, swapOptions, swapLoading, swapFailed, swapSavingId, openSwap, closeSwap, chooseSwap,
    differentUnit, monthsLeft, shortShelfLifeMonths, substitutionNotes,
  }
}
