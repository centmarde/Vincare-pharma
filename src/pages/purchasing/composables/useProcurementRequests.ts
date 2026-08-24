import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useProcurementDataStore, type ProcurementRequestType } from '@/stores/procurementData'
import { useInhouseDataStore } from '@/stores/inhouseData'
import { useEthicalDataStore } from '@/stores/ethicalData'
import type { CanvassCommitFn, CanvassableOrder } from '@/utils/canvassTypes'

export const headers = [
  { title: 'MODULE',      key: 'order_type',    sortable: false, align: 'center' as const },
  { title: 'ORDER #',     key: 'order_no',       sortable: true,  align: 'center' as const },
  { title: 'CUSTOMER',    key: 'customer_name',  sortable: true,  align: 'center' as const },
  { title: 'REQUESTED',   key: 'requested_at',   sortable: true,  align: 'center' as const },
  { title: 'ITEMS SHORT', key: 'lines',          sortable: false, align: 'center' as const },
  { title: 'STATUS',      key: 'already_canvassed', sortable: false, align: 'center' as const },
  { title: 'ACTIONS',     key: 'actions',        sortable: false, align: 'center' as const },
]

export function useProcurementRequests() {
  const procurementStore = useProcurementDataStore()
  const inhouseStore = useInhouseDataStore()
  const ethicalStore = useEthicalDataStore()
  const { queue, loading } = storeToRefs(procurementStore)

  const selected = ref<ProcurementRequestType | null>(null)
  const showDetail = ref(false)

  // RFQ (costing sheet) for the selected request. The quantities it was printed
  // with flow into the canvass so quotes are entered against what was asked.
  const showRFQ = ref(false)
  const rfqQuantities = ref<Record<number, number>>({})

  function openRFQ() {
    if (selected.value) showRFQ.value = true
  }

  function onRFQQuantities(q: Record<number, number>) {
    rfqQuantities.value = q
  }

  async function init() {
    await procurementStore.fetchQueue()
  }

  function openDetail(req: ProcurementRequestType) {
    selected.value = req
    showDetail.value = true
  }

  function closeDetail() {
    showDetail.value = false
    showRFQ.value = false
    selected.value = null
    rfqQuantities.value = {}
  }

  // SupplierCanvass needs a stable CanvassableOrder + a commitFn matching the
  // selected request's module — reuse the existing, unchanged in-house/ethical
  // canvassToPRs (they already wrap canvassData.commitToPRs correctly).
  const canvassOrder = computed<CanvassableOrder | null>(() => {
    const req = selected.value
    if (!req) return null
    return { id: req.order_id, items: req.items }
  })

  const canvassShortfall = computed(() => selected.value ? procurementStore.shortfallFor(selected.value) : [])

  const commitFn: CanvassCommitFn = async (orderId, selections) => {
    const req = selected.value
    if (!req) return { success: false }
    return req.order_type === 'inhouse_order'
      ? inhouseStore.canvassToPRs(orderId, selections)
      : ethicalStore.canvassToPRs(orderId, selections)
  }

  async function onCanvassCreated() {
    // A commit doesn't resolve the shortfall (stock hasn't arrived yet) — it
    // just flags the order as canvassed, so refresh the queue and keep the
    // dialog open on the same request if it's still there.
    const orderId = selected.value?.order_id
    await procurementStore.fetchQueue()
    selected.value = orderId != null ? queue.value.find((r) => r.order_id === orderId) ?? null : null
    if (!selected.value) showDetail.value = false
  }

  const moduleLabel = (t: ProcurementRequestType['order_type']) => (t === 'inhouse_order' ? 'In-House' : 'Ethical')

  return {
    queue, loading, selected, showDetail,
    showRFQ, rfqQuantities, openRFQ, onRFQQuantities,
    canvassOrder, canvassShortfall, commitFn,
    init, openDetail, closeDetail, onCanvassCreated, moduleLabel,
  }
}
