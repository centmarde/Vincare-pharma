import { ref, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useStockTransfersDataStore } from '@/stores/stockTransfersData'
import type { StockTransferType, StockTransferItemType } from '@/stores/stockTransfersData'
import { formatExpiryMonthYear } from '@/utils/helpers'

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
  }
}
