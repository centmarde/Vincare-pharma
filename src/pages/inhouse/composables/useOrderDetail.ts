import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useInhouseDataStore } from '@/stores/inhouseData'
import type { InhouseOrderType, Shortfall, NegotiationRound } from '@/stores/inhouseData'
import { useDeliveryReceiptsDataStore, type DeliveryReceiptType } from '@/stores/deliveryReceiptsData'
import { useProductsDataStore } from '@/stores/productsData'
import { useProcurementDataStore } from '@/stores/procurementData'
import { useAuthUserStore } from '@/stores/authUser'
import type { CollectionType } from '@/stores/ethicalData'

export function useOrderDetail(order: () => InhouseOrderType | null, onChanged: () => void) {
  const store = useInhouseDataStore()
  const drStore = useDeliveryReceiptsDataStore()
  const productsStore = useProductsDataStore()
  const procurementStore = useProcurementDataStore()
  const authStore = useAuthUserStore()
  const { products } = storeToRefs(productsStore)
  if (!products.value.length) void productsStore.fetchProducts()

  const loading = ref(false)
  const rounds = ref<NegotiationRound[]>([])
  const shortfall = ref<Shortfall[]>([])
  const payments = ref<CollectionType[]>([])
  // Purchasing hand-off: staff no longer canvass suppliers themselves — they
  // send a request and Purchasing does the sourcing (lead-dev directive).
  const requestedAt = ref<string | null>(null)
  const requestNote = ref('')

  // negotiate panel: editable per-line offer prices + a note
  const lineEdits = ref<Record<number, number>>({})
  // a counter-offer can swap a line's product (customer wants something else
  // for ~the same spend) — product_id + the new product's cost snapshot.
  const lineProductEdits = ref<Record<number, number | null>>({})
  const lineCostEdits = ref<Record<number, number>>({})
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

  const productOptions = computed(() =>
    products.value.map((p) => ({
      title: `${p.product_name ?? '—'}${p.sku ? ` (${p.sku})` : ''}`,
      value: p.id,
      cost: p.cost_price ?? 0,
      selling: p.selling_price ?? 0,
    })))

  const proposedTotal = computed(() =>
    items.value.reduce((s, i) => s + (lineEdits.value[i.id] ?? i.unit_price) * i.qty, 0))
  const proposedCost = computed(() =>
    items.value.reduce((s, i) => s + (lineCostEdits.value[i.id] ?? i.cost_price ?? 0) * i.qty, 0))
  const proposedProfit = computed(() => proposedTotal.value - proposedCost.value)
  const proposedMarginPct = computed(() =>
    proposedTotal.value === 0 ? 0 : Math.round((proposedProfit.value / proposedTotal.value) * 100))

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
    deliverQtys.value = {}
    receivedBy.value = ''
    issuedReceipt.value = null
    offerNote.value = ''
    payReference.value = ''
    payRemarks.value = ''
    payAmount.value = null
    requestedAt.value = null
    requestNote.value = ''
    if (!o) return
    for (const it of o.items ?? []) {
      lineEdits.value[it.id] = it.unit_price
      lineProductEdits.value[it.id] = it.product_id
      lineCostEdits.value[it.id] = it.cost_price ?? 0
      deliverQtys.value[it.id] = it.qty - (it.delivered_qty ?? 0)
    }
    // Default the next payment to the outstanding balance — staff can lower
    // it for a partial tranche.
    payAmount.value = (o.total_amount ?? 0) - (o.amount_paid ?? 0)
    void loadRounds(o.id)
    if (o.status === 'awaiting_stock') { void refreshShortfall(o.id); void loadRequestStatus(o.id) }
    if (o.status === 'delivered' || o.status === 'partial' || o.status === 'paid') void loadPayments(o.id)
  }, { immediate: true })

  async function loadRounds(id: number) { rounds.value = await store.fetchNegotiation(id) }
  async function refreshShortfall(id: number) { shortfall.value = await store.recheckStock(id) }
  async function loadPayments(id: number) { payments.value = await store.fetchPayments(id) }
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
  function onLineProductChange(itemId: number) {
    const p = productOptions.value.find((o) => o.value === lineProductEdits.value[itemId])
    if (p) lineCostEdits.value[itemId] = p.cost
  }

  async function recordCounter() {
    const o = order(); if (!o) return
    loading.value = true
    const result = await store.recordOffer({
      orderId: o.id,
      total: proposedTotal.value,
      party: 'company',
      note: offerNote.value,
      lineUpdates: items.value.map((i) => ({
        item_id:    i.id,
        unit_price: lineEdits.value[i.id] ?? i.unit_price,
        qty:        i.qty,
        product_id: lineProductEdits.value[i.id] ?? i.product_id ?? undefined,
        cost_price: lineCostEdits.value[i.id] ?? i.cost_price ?? undefined,
      })),
    })
    loading.value = false
    if (result.success) { offerNote.value = ''; onChanged() }
  }

  async function agree() {
    const o = order(); if (!o) return
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
    loading.value = true
    const result = await store.recordPayment({
      orderId:   o.id,
      amount:    payAmount.value,
      reference: payReference.value || undefined,
      remarks:   payRemarks.value || undefined,
    })
    loading.value = false
    if (result.success) {
      payReference.value = ''
      payRemarks.value = ''
      await loadPayments(o.id)
      onChanged()
    }
  }

  return {
    loading, rounds, shortfall, payments, lineEdits, lineProductEdits, lineCostEdits, productOptions, offerNote, deliverQtys,
    receivedBy, issuedReceipt,
    payAmount, payReference, payRemarks,
    requestedAt, requestNote,
    items, status, isNegotiating, isAwaitingStock, isReady, isDelivered, isPartiallyPaid, isPaid, canRecordPayment,
    proposedTotal, proposedCost, proposedProfit, proposedMarginPct, deliveredPct, remaining, balance, paidPct,
    onLineProductChange, recordCounter, agree, recheck, deliver, recordPayment, notifyPurchasing,
  }
}
