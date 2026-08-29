import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useProcurementDataStore, type ProcurementRequestType } from '@/stores/procurementData'
import { useInhouseDataStore } from '@/stores/inhouseData'
import { useEthicalDataStore } from '@/stores/ethicalData'
import type { CanvassCommitFn, CanvassableOrder } from '@/utils/canvassTypes'
import { useDraftPRDataStore } from '@/stores/draftPRData'

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
  const { draftByOrder } = storeToRefs(draftStore)

  type CanvassExposed = { autoSaveDraft: () => Promise<{ success: boolean }>; hasSelections: boolean }

  const selected = ref<ProcurementRequestType | null>(null)
  const showDetail = ref(false)
  const canvassRef = ref<CanvassExposed | null>(null)
  const dismissing = ref(false)
  const showDraftEdit = ref(false)
  const showDraftReview = ref(false)
  const activeDraftId = ref<number | null>(null)
  const draftReadonly = ref(false)

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
    await draftStore.fetchDraftIdsByOrder()
  }

  // Canvassing a request that a live PR already covers would raise a duplicate
  // PR for the same shortfall. The button is disabled for this; the guard is
  // here so a stale row can't slip past it either.
  function openDetail(req: ProcurementRequestType) {
    if (req.already_canvassed) return
    selected.value = req
    showDetail.value = true
  }

  function closeDetail() {
    showDetail.value = false
    showRFQ.value = false
    selected.value = null
    rfqQuantities.value = {}
  }

  async function dismissDetail() {
    if (dismissing.value) return
    dismissing.value = true
    try {
      await canvassRef.value?.autoSaveDraft()
      await draftStore.fetchDraftIdsByOrder() // light up "Resume Draft" on the row
    } finally {
      dismissing.value = false
      closeDetail()
    }
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
    const result = await draftStore.getOrCreateDraft({
      sourceOrderId: req.order_id,
      sourceOrderType: req.order_type,
      remarks: `Draft from ${moduleLabel(req.order_type)} ${req.order_no ?? ''}`,
      lines: req.lines.map((l) => ({ product_id: l.product_id!, qty: l.needed, shortfall_qty: l.needed })),
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

  function backToEdit() {
    showDraftReview.value = false
    showDraftEdit.value = true
  }

  async function onDraftSubmitted() {
    activeDraftId.value = null
    draftReadonly.value = false
    await init()
  }

  function onDraftSaved(draftId: number) {
    activeDraftId.value = draftId
    draftReadonly.value = false
    showDraftEdit.value = true
    closeDetail()
    draftStore.fetchDraftIdsByOrder() // keep the badge in sync right away
  }

  function resumeDraft(draftId: number, readonly = false) {
    activeDraftId.value = draftId
    draftReadonly.value = readonly
    showDraftEdit.value = true
  }

  // Once a PR covers the order the draft is a record, not a work item — it opens
  // read-only. A rejected PR lifts that, so the purchaser can fix it and resubmit.
  function openDraft(req: ProcurementRequestType) {
    const draft = draftByOrder.value[req.order_id]
    if (draft) resumeDraft(draft.id, req.already_canvassed)
  }

  return {
    queue, loading, selected, showDetail,
    showRFQ, rfqQuantities, openRFQ, onRFQQuantities,
    canvassOrder, canvassShortfall, commitFn, canvassRef, dismissing,
    init, openDetail, closeDetail, dismissDetail, onCanvassCreated, moduleLabel,
    showDraftEdit, showDraftReview, activeDraftId, draftReadonly,
    startDraftPR, goToReview, backToEdit, onDraftSubmitted, onDraftSaved,
    draftByOrder, resumeDraft, openDraft,
  }
}