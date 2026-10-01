import { ref, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useInhouseDataStore } from '@/stores/inhouseData'
import type { InhouseOrderType, Shortfall, NegotiationRound } from '@/stores/inhouseData'
import { useDeliveryReceiptsDataStore, type DeliveryReceiptType } from '@/stores/deliveryReceiptsData'
import type { ProductPickerResult } from '@/stores/productsData'
import { useProcurementDataStore } from '@/stores/procurementData'
import { useShortDatedApprovalStore } from '@/pages/inhouse/stores/shortDatedApproval'
import type { ShortDatedBatch, ShortDatedRequest } from '@/pages/inhouse/stores/shortDatedApproval'
import { govtShelfLife } from '@/utils/qualification'
import { useFinanceDataStore } from '@/stores/financeData'
import { useAuthUserStore } from '@/stores/authUser'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { formatCurrency } from '@/utils/helpers'
import type { CollectionType } from '@/stores/ethicalData'

const { confirmDialog } = useConfirmDialog()

export type NewNegotiationLine = {
  product_id: number | null
  product_name: string
  unit: string
  qty: number
  offer_unit: number
  cost_unit: number
}

export function useOrderDetail(order: () => InhouseOrderType | null, onChanged: () => void) {
  const store = useInhouseDataStore()
  const drStore = useDeliveryReceiptsDataStore()
  const procurementStore = useProcurementDataStore()
  const shortDatedStore = useShortDatedApprovalStore()
  const authStore = useAuthUserStore()
  const financeStore = useFinanceDataStore()
  // Inside the composable body, not at module scope — a factory called on
  // import can run before the app is set up.
  const toast = useToast()

  // Deposit-account options for the payment form. Investment placements are
  // excluded: a customer payment is received into an operating account or the
  // cash box, never into a time deposit.
  const cashAccountOptions = computed(() =>
    financeStore.cashAccounts
      .filter((a) => a.is_active && a.classification !== 'TIME_INVESTMENT')
      .map((a) => ({ value: a.id, title: `${a.name} — ${formatCurrency(a.balance ?? 0)}` })),
  )

  const cashAccountName = (id: number | null): string =>
    financeStore.cashAccounts.find((a) => a.id === id)?.name ?? '—'

  const loading = ref(false)
  const rounds = ref<NegotiationRound[]>([])
  const shortfall = ref<Shortfall[]>([])
  const payments = ref<CollectionType[]>([])
  // Purchasing hand-off: staff no longer canvass suppliers themselves — they
  // send a request and Purchasing does the sourcing (lead-dev directive).
  const requestedAt = ref<string | null>(null)
  const requestNote = ref('')

  // Short-dated executive approval. Government contracts reject stock with
  // under 18 months left, so deliver() blocks it — an executive may waive that
  // for a given order, and this is how it gets asked for and shown.
  const shortDatedBatches = ref<ShortDatedBatch[]>([])
  const shortDatedRequest = ref<ShortDatedRequest | null>(null)
  const shortDatedNote = ref('')

  // negotiate panel: editable per-line offer prices + a note
  const lineEdits = ref<Record<number, number>>({})
  // a counter-offer can swap a line's product (customer wants something else
  // for ~the same spend) — product_id + the new product's cost snapshot.
  const lineProductEdits = ref<Record<number, number | null>>({})
  const lineCostEdits = ref<Record<number, number>>({})
  // The display name for each line's currently-selected product. Held here
  // rather than resolved from the products store, which only holds the first
  // page of a 2.4k-row file — a product swapped in via the search dialog is
  // usually not in it.
  const lineProductNames = ref<Record<number, string>>({})
  // Lines stay editable until terms are agreed: qty changes, lines the
  // customer dropped, and lines they asked to add.
  const lineQtyEdits = ref<Record<number, number>>({})
  const removedItemIds = ref<number[]>([])
  const newLines = ref<NewNegotiationLine[]>([])
  const offerNote = ref('')
  // fulfillment panel: qty to deliver now, per line + the consignee's printed name
  const deliverQtys = ref<Record<number, number>>({})
  const receivedBy = ref('')
  // set after a successful delivery so the parent can pop the printable DR
  const issuedReceipt = ref<DeliveryReceiptType | null>(null)
  // payment panel: government POs are often paid in tranches, not lump-sum
  const payAmount = ref<number | null>(null)
  const payReference = ref('')
  const payRemarks = ref('')
  // Where the money is deposited. Without it nothing ever credited
  // cash_accounts.balance, which only ever decreased.
  const payCashAccountId = ref<number | null>(null)

  const items = computed(() => order()?.items ?? [])
  const status = computed(() => order()?.status ?? '')
  const isNegotiating = computed(() => status.value === 'negotiating')
  const isAwaitingStock = computed(() => status.value === 'awaiting_stock')
  const isReady = computed(() => status.value === 'ready')
  const isDelivered = computed(() => status.value === 'delivered')
  const isPartiallyPaid = computed(() => status.value === 'partial')
  const isPaid = computed(() => status.value === 'paid')
  // Payment can be recorded once delivery is complete, and again for each
  // further tranche while a balance remains.
  const canRecordPayment = computed(() => isDelivered.value || isPartiallyPaid.value)
  const balance = computed(() => (order()?.total_amount ?? 0) - (order()?.amount_paid ?? 0))
  const paidPct = computed(() => {
    const total = order()?.total_amount ?? 0
    if (!total) return 0
    return Math.round(((order()?.amount_paid ?? 0) / total) * 100)
  })

  const keptItems = computed(() => items.value.filter((i) => !removedItemIds.value.includes(i.id)))
  const qtyFor = (i: { id: number; qty: number }) => Number(lineQtyEdits.value[i.id] ?? i.qty)
  const validNewLines = computed(() => newLines.value.filter((l) => l.product_id && l.qty > 0))

  const proposedTotal = computed(() =>
    keptItems.value.reduce((s, i) => s + (lineEdits.value[i.id] ?? i.unit_price) * qtyFor(i), 0)
    + validNewLines.value.reduce((s, l) => s + l.offer_unit * l.qty, 0))
  const proposedCost = computed(() =>
    keptItems.value.reduce((s, i) => s + (lineCostEdits.value[i.id] ?? i.cost_price ?? 0) * qtyFor(i), 0)
    + validNewLines.value.reduce((s, l) => s + l.cost_unit * l.qty, 0))

  // Agree locks terms against the SAVED lines, so unrecorded edits would be
  // silently dropped — agree() refuses while this is true.
  const hasUnsavedLineChanges = computed(() =>
    removedItemIds.value.length > 0
    || newLines.value.some((l) => l.product_id)
    || items.value.some((i) =>
      qtyFor(i) !== i.qty
      || (lineEdits.value[i.id] ?? i.unit_price) !== i.unit_price
      || (lineProductEdits.value[i.id] ?? i.product_id) !== i.product_id))
  // Ratio = Company Cost / Customer Offer — see useRaiseOrder for why a missing
  // side renders '—' instead of 0.00.
  const proposedRatio = computed(() =>
    proposedTotal.value > 0 && proposedCost.value > 0 ? proposedCost.value / proposedTotal.value : null)

  // Rounded once, everything derives from it — see useRaiseOrder.
  const ratioValue = computed(() => proposedRatio.value === null ? null : Number(proposedRatio.value.toFixed(2)))
  const ratioLabel = computed(() => ratioValue.value === null ? '—' : ratioValue.value.toFixed(2))
  const ratioClass = computed(() =>
    ratioValue.value === null ? 'text-medium-emphasis' : ratioValue.value < 1 ? 'text-success' : 'text-error')

  const proposedProfit = computed(() =>
    proposedRatio.value === null ? null : proposedTotal.value - proposedCost.value)
  const profitLabel = computed(() => proposedProfit.value === null ? '—' : formatCurrency(proposedProfit.value))
  const marginLabel = computed(() =>
    ratioValue.value === null ? '—' : `${Math.round((1 - ratioValue.value) * 100)}%`)

  const deliveredPct = computed(() => {
    const ordered = items.value.reduce((s, i) => s + i.qty, 0)
    if (!ordered) return 0
    const del = items.value.reduce((s, i) => s + (i.delivered_qty ?? 0), 0)
    return Math.round((del / ordered) * 100)
  })

  function remaining(itemId: number): number {
    const it = items.value.find((i) => i.id === itemId)
    return it ? it.qty - (it.delivered_qty ?? 0) : 0
  }

  // (Re)seed local inputs whenever the order changes.
  watch(order, (o) => {
    rounds.value = []
    shortfall.value = []
    payments.value = []
    lineEdits.value = {}
    lineProductEdits.value = {}
    lineCostEdits.value = {}
    lineProductNames.value = {}
    lineQtyEdits.value = {}
    removedItemIds.value = []
    newLines.value = []
    deliverQtys.value = {}
    receivedBy.value = ''
    issuedReceipt.value = null
    offerNote.value = ''
    payReference.value = ''
    payRemarks.value = ''
    payAmount.value = null
    payCashAccountId.value = null
    requestedAt.value = null
    shortDatedBatches.value = []
    shortDatedRequest.value = null
    shortDatedNote.value = ''
    requestNote.value = ''
    if (!o) return
    for (const it of o.items ?? []) {
      lineEdits.value[it.id] = it.unit_price
      lineProductEdits.value[it.id] = it.product_id
      lineCostEdits.value[it.id] = it.cost_price ?? 0
      lineProductNames.value[it.id] = it.product?.product_name ?? ''
      lineQtyEdits.value[it.id] = it.qty
      deliverQtys.value[it.id] = it.qty - (it.delivered_qty ?? 0)
    }
    // Default the next payment to the outstanding balance — staff can lower
    // it for a partial tranche.
    payAmount.value = (o.total_amount ?? 0) - (o.amount_paid ?? 0)
    void loadRounds(o.id)
    if (o.status === 'awaiting_stock') { void refreshShortfall(o.id); void loadRequestStatus(o.id) }
    // Only matters once the order can actually ship: a short-dated batch is
    // not a problem while the order is still being negotiated.
    if (o.status === 'ready' || o.status === 'delivered') void loadShortDated(o.id)
    if (o.status === 'delivered' || o.status === 'partial' || o.status === 'paid') {
      void loadPayments(o.id)
      // Deposit accounts are only needed once the order can take a payment.
      void financeStore.fetchCashAccounts()
    }
  }, { immediate: true })

  async function loadRounds(id: number) { rounds.value = await store.fetchNegotiation(id) }
  // Passive: opening an awaiting_stock order only READS the shortfall for display.
  // Advancing the order + minting the PO is the explicit "Re-check stock" button
  // (recheck() → store.recheckStock), never a side effect of viewing.
  async function refreshShortfall(id: number) { shortfall.value = await store.computeShortfall(id) }
  async function loadPayments(id: number) { payments.value = await store.fetchPayments(id) }

  /**
   * Which of this order’s lines are short-dated, and whether an approval
   * already exists for them.
   *
   * Read-only — EXPIRED lines are excluded because no approval can make
   * expired goods deliverable, so offering to request one would be a lie.
   */
  async function loadShortDated(id: number) {
    const o = order()
    const lines = o?.items ?? []
    shortDatedBatches.value = lines
      .filter((li: any) => {
        const shelf = govtShelfLife(li.product?.expiry_date ?? null)
        return !shelf.ok && shelf.reason === 'short_dated'
      })
      .map((li: any) => ({
        product_id: li.product_id,
        product_name: li.product?.product_name ?? `Product #${li.product_id}`,
        batch_no: li.product?.batch_no ?? null,
        expiry_date: li.product?.expiry_date ?? null,
      }))
    shortDatedRequest.value = await shortDatedStore.requestFor(id)
  }

  async function requestShortDatedApproval() {
    const o = order(); if (!o) return
    loading.value = true
    const result = await shortDatedStore.requestApproval({
      orderId: o.id,
      orderNo: o.order_no ?? null,
      batches: shortDatedBatches.value,
      reason: shortDatedNote.value || null,
    })
    loading.value = false
    if (result.success) { shortDatedNote.value = ''; await loadShortDated(o.id) }
  }
  async function loadRequestStatus(id: number) {
    const latest = await procurementStore.fetchLatestRequest(id)
    requestedAt.value = latest?.created_at ?? null
  }

  // Send the "we need these items, can you buy some?" ping to Purchasing.
  // Staff never see supplier info — canvassing now happens only on the
  // Purchasing side (Procurement Requests queue).
  async function notifyPurchasing() {
    const o = order(); if (!o) return
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) return
    loading.value = true
    const ok = await procurementStore.notifyPurchasing('inhouse_order', o.id, requestNote.value || undefined, user.id)
    loading.value = false
    if (ok) { requestNote.value = ''; await loadRequestStatus(o.id) }
  }

  // Customer wants a different product on this line — snapshot the new
  // product's cost so profitability stays accurate; offer price is left for
  // the staff to adjust (a swap rarely lands on the exact same price).
  function applyPickedProduct(itemId: number, product: ProductPickerResult) {
    lineProductEdits.value[itemId] = product.id
    lineProductNames.value[itemId] = product.product_name ?? ''
    // Always overwrite, never conditionally. Switching from a product costing
    // 100 to one with no recorded cost used to leave 100 behind, so the offer
    // and the saved cost_price carried the PREVIOUS product's figure.
    lineCostEdits.value[itemId] = product.cost_price ?? 0
  }

  function applyPickedProductToNewLine(index: number, product: ProductPickerResult) {
    const line = newLines.value[index]
    if (!line) return
    line.product_id = product.id
    line.product_name = product.product_name ?? ''
    line.unit = product.unit ?? ''
    line.cost_unit = product.cost_price ?? 0
    if (!line.offer_unit && product.selling_price != null) line.offer_unit = product.selling_price
  }

  function addNewLine() {
    newLines.value.push({ product_id: null, product_name: '', unit: '', qty: 1, offer_unit: 0, cost_unit: 0 })
  }
  function removeNewLine(index: number) { newLines.value.splice(index, 1) }

  function removeItem(itemId: number) {
    if (!removedItemIds.value.includes(itemId)) removedItemIds.value.push(itemId)
  }
  function restoreItem(itemId: number) {
    removedItemIds.value = removedItemIds.value.filter((id) => id !== itemId)
  }
  const isRemoved = (itemId: number) => removedItemIds.value.includes(itemId)

  async function recordCounter() {
    const o = order(); if (!o) return
    if (keptItems.value.length + validNewLines.value.length === 0) {
      toast.warning('An order needs at least one line item.'); return
    }
    if (keptItems.value.some((i) => !(qtyFor(i) > 0))) {
      toast.warning('Quantity must be at least 1 — remove the line instead.'); return
    }
    if (newLines.value.some((l) => l.product_id && !(l.qty > 0))) {
      toast.warning('New lines need a quantity of at least 1.'); return
    }
    loading.value = true
    const result = await store.recordOffer({
      orderId: o.id,
      total: proposedTotal.value,
      party: 'company',
      note: offerNote.value,
      removeItemIds: removedItemIds.value,
      addLines: validNewLines.value.map((l) => ({
        product_id: l.product_id!, qty: l.qty, unit_price: l.offer_unit, cost_price: l.cost_unit,
      })),
      lineUpdates: keptItems.value.map((i) => ({
        item_id:    i.id,
        unit_price: lineEdits.value[i.id] ?? i.unit_price,
        qty:        qtyFor(i),
        product_id: lineProductEdits.value[i.id] ?? i.product_id ?? undefined,
        cost_price: lineCostEdits.value[i.id] ?? i.cost_price ?? undefined,
      })),
    })
    loading.value = false
    if (result.success) { offerNote.value = ''; onChanged() }
  }

  async function agree() {
    const o = order(); if (!o) return
    if (hasUnsavedLineChanges.value) {
      toast.warning('Record the counter-offer first — agreeing locks the saved lines, not unsaved edits.')
      return
    }
    loading.value = true
    const result = await store.agreeOrder(o.id)
    loading.value = false
    if (result.success) { shortfall.value = result.shortfall ?? []; onChanged() }
  }

  async function recheck() {
    const o = order(); if (!o) return
    shortfall.value = await store.recheckStock(o.id)
    onChanged()
  }

  async function deliver() {
    const o = order(); if (!o) return
    const lines = items.value
      .map((i) => ({ item_id: i.id, qty: Number(deliverQtys.value[i.id] ?? 0) }))
      .filter((l) => l.qty > 0)
    if (!lines.length) return
    loading.value = true
    const result = await store.deliver(o.id, lines, { receivedBy: receivedBy.value || undefined })
    if (result.success && result.drId) {
      // Pull the freshly-issued DR so the parent dialog can print it.
      issuedReceipt.value = await drStore.fetchDeliveryReceiptById(result.drId)
    }
    loading.value = false
    if (result.success) onChanged()
  }

  async function recordPayment() {
    const o = order(); if (!o || payAmount.value == null || payAmount.value <= 0) return
    if (payCashAccountId.value === null) { toast.warning('Choose which cash account received this payment'); return }

    const willFullyPay = payAmount.value >= balance.value
    const summary = [
      `Amount: ${formatCurrency(payAmount.value)}`,
      `Reference / OR #: ${payReference.value || '—'}`,
      `Deposited to: ${cashAccountName(payCashAccountId.value)}`,
      `Remarks: ${payRemarks.value || '—'}`,
      `Remaining balance after this: ${formatCurrency(Math.max(0, balance.value - payAmount.value))}`,
      willFullyPay ? 'This will mark the order as PAID IN FULL.' : '',
    ].filter(Boolean).join('\n')
    const ok = await confirmDialog(summary, { title: 'Confirm Payment', confirmText: 'Record Payment' })
    if (!ok) return

    loading.value = true
    const result = await store.recordPayment({
      orderId:   o.id,
      amount:    payAmount.value,
      reference: payReference.value || undefined,
      remarks:   payRemarks.value || undefined,
      cashAccountId: payCashAccountId.value,
    })
    loading.value = false
    if (result.success) {
      payReference.value = ''
      payRemarks.value = ''
      payCashAccountId.value = null
      await loadPayments(o.id)
      onChanged()
    }
  }

  return {
    loading, rounds, shortfall, payments, lineEdits, lineProductEdits, lineCostEdits, lineProductNames, offerNote, deliverQtys,
    lineQtyEdits, newLines, hasUnsavedLineChanges, isRemoved, removeItem, restoreItem, addNewLine, removeNewLine, applyPickedProductToNewLine,
    receivedBy, issuedReceipt,
    payAmount, payReference, payRemarks, payCashAccountId, cashAccountOptions,
    requestedAt, requestNote,
    shortDatedBatches, shortDatedRequest, shortDatedNote,
    loadShortDated, requestShortDatedApproval,
    items, status, isNegotiating, isAwaitingStock, isReady, isDelivered, isPartiallyPaid, isPaid, canRecordPayment,
    proposedTotal, proposedCost, proposedRatio, ratioLabel, ratioClass, profitLabel, marginLabel, deliveredPct, remaining, balance, paidPct,
    applyPickedProduct, recordCounter, agree, recheck, deliver, recordPayment, notifyPurchasing,
  }
}
