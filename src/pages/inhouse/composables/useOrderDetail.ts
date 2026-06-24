import { ref, computed, watch } from 'vue'
import { useInhouseDataStore } from '@/stores/inhouseData'
import type { InhouseOrderType, Shortfall, NegotiationRound } from '@/stores/inhouseData'

export function useOrderDetail(order: () => InhouseOrderType | null, onChanged: () => void) {
  const store = useInhouseDataStore()

  const loading = ref(false)
  const rounds = ref<NegotiationRound[]>([])
  const shortfall = ref<Shortfall[]>([])

  // negotiate panel: editable per-line offer prices + a note
  const lineEdits = ref<Record<number, number>>({})
  const offerNote = ref('')
  // fulfillment panel: qty to deliver now, per line
  const deliverQtys = ref<Record<number, number>>({})
  const payAmount = ref<number | null>(null)

  const items = computed(() => order()?.items ?? [])
  const status = computed(() => order()?.status ?? '')
  const isNegotiating = computed(() => status.value === 'negotiating')
  const isAwaitingStock = computed(() => status.value === 'awaiting_stock')
  const isReady = computed(() => status.value === 'ready')
  const isDelivered = computed(() => status.value === 'delivered')
  const isPaid = computed(() => status.value === 'paid')

  const proposedTotal = computed(() =>
    items.value.reduce((s, i) => s + (lineEdits.value[i.id] ?? i.unit_price) * i.qty, 0))

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
    lineEdits.value = {}
    deliverQtys.value = {}
    offerNote.value = ''
    payAmount.value = o?.total_amount ?? null
    if (!o) return
    for (const it of o.items ?? []) {
      lineEdits.value[it.id] = it.unit_price
      deliverQtys.value[it.id] = it.qty - (it.delivered_qty ?? 0)
    }
    void loadRounds(o.id)
    if (o.status === 'awaiting_stock') void refreshShortfall(o.id)
  }, { immediate: true })

  async function loadRounds(id: number) { rounds.value = await store.fetchNegotiation(id) }
  async function refreshShortfall(id: number) { shortfall.value = await store.recheckStock(id) }

  async function recordCounter() {
    const o = order(); if (!o) return
    loading.value = true
    const result = await store.recordOffer({
      orderId: o.id,
      total: proposedTotal.value,
      party: 'company',
      note: offerNote.value,
      lineUpdates: items.value.map((i) => ({ item_id: i.id, unit_price: lineEdits.value[i.id] ?? i.unit_price, qty: i.qty })),
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
    const result = await store.deliver(o.id, lines)
    loading.value = false
    if (result.success) onChanged()
  }

  async function markPaid() {
    const o = order(); if (!o || payAmount.value == null) return
    loading.value = true
    const result = await store.markPaid(o.id, payAmount.value)
    loading.value = false
    if (result.success) onChanged()
  }

  return {
    loading, rounds, shortfall, lineEdits, offerNote, deliverQtys, payAmount,
    items, status, isNegotiating, isAwaitingStock, isReady, isDelivered, isPaid,
    proposedTotal, deliveredPct, remaining,
    recordCounter, agree, recheck, deliver, markPaid,
  }
}
