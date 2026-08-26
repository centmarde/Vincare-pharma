import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useProcurementDataStore, type ProcurementRequestType } from '@/stores/procurementData'
import { useInhouseDataStore } from '@/stores/inhouseData'
import { useEthicalDataStore } from '@/stores/ethicalData'
import type { CanvassCommitFn, CanvassableOrder } from '@/utils/canvassTypes'
import { useDraftPRDataStore, type DraftPRType } from '@/stores/draftPRData'

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
  const draftStore = useDraftPRDataStore()
  const { queue, loading } = storeToRefs(procurementStore)
  const { draftCountsByOrder: draftCounts } = storeToRefs(draftStore)

  const selected = ref<ProcurementRequestType | null>(null)
  const showDetail = ref(false)
  const showDraftEdit = ref(false)
  const showDraftReview = ref(false)
  const activeDraftId = ref<number | null>(null)

  const showOrderDrafts = ref(false)
  const orderDrafts = ref<DraftPRType[]>([])
  const draftsForOrder = ref<ProcurementRequestType | null>(null) // FIX — was missing

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
    await draftStore.fetchDraftCountsByOrder()
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
    const orderId = selected.value?.order_id
    await procurementStore.fetchQueue()
    selected.value = orderId != null ? queue.value.find((r) => r.order_id === orderId) ?? null : null
    if (!selected.value) showDetail.value = false
  }

  const moduleLabel = (t: ProcurementRequestType['order_type']) => (t === 'inhouse_order' ? 'In-House' : 'Ethical')

  async function startDraftPR(req: ProcurementRequestType) {
    const result = await draftStore.createDraft({
      sourceOrderId: req.order_id,
      sourceOrderType: req.order_type,
      remarks: `Draft from ${moduleLabel(req.order_type)} ${req.order_no ?? ''}`,
      lines: req.lines.map((l) => ({ product_id: l.product_id!, qty: l.needed })),
    })
    if (result.success) {
      activeDraftId.value = (result as any).draftId
      showDraftEdit.value = true
    }
  }

  function goToReview() {
    showDraftEdit.value = false
    showDraftReview.value = true
  }

  async function onDraftSubmitted() {
    activeDraftId.value = null
    await init()
  }

  function onDraftSaved(draftId: number) {
    activeDraftId.value = draftId
    showDraftEdit.value = true
    closeDetail()
    draftStore.fetchDraftCountsByOrder() // keep the badge count in sync right away
  }

  async function openOrderDrafts(req: ProcurementRequestType) {
    draftsForOrder.value = req
    orderDrafts.value = await draftStore.fetchDrafts('draft', req.order_id)
    showOrderDrafts.value = true
  }

  function resumeDraft(draftId: number) {
    showOrderDrafts.value = false
    activeDraftId.value = draftId
    showDraftEdit.value = true
  }

  return {
    queue, loading, selected, showDetail,
    showRFQ, rfqQuantities, openRFQ, onRFQQuantities,
    canvassOrder, canvassShortfall, commitFn,
    init, openDetail, closeDetail, onCanvassCreated, moduleLabel,
    showDraftEdit, showDraftReview, activeDraftId,
    startDraftPR, goToReview, onDraftSubmitted, onDraftSaved,
    draftCounts, showOrderDrafts, orderDrafts, draftsForOrder,
    openOrderDrafts, resumeDraft,
  }
}