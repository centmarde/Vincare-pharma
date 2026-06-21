import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useTransactionsDataStore } from '@/stores/transactionsData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import type { PR } from '@/stores/transactionsData'

export const headers = [
  { title: 'PR #',         key: 'requisition_no',  sortable: true,  align: 'center' as const },
  { title: 'ITEMS',        key: 'items',          sortable: false, align: 'center' as const },
  { title: 'TOTAL QTY',    key: 'total_qty',      sortable: false, align: 'center' as const },
  { title: 'TOTAL COST',   key: 'total_amount',   sortable: true,  align: 'center' as const },
  { title: 'REQUESTED BY', key: 'requester_name', sortable: true,  align: 'center' as const },
  { title: 'DATE',         key: 'created_at',     sortable: true,  align: 'center' as const },
  { title: 'STATUS',       key: 'status',         sortable: true,  align: 'center' as const },
  { title: 'REVIEWED BY',  key: 'reviewer_name',  sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',      key: 'actions',        sortable: false, align: 'center' as const },
]

export function usePurchaseRequisitionList() {
  const store         = useTransactionsDataStore()
  const supplierStore = useSuppliersDataStore()

  const { loading, prs, filterStatus } = storeToRefs(store)
  const { fetchPurchaseRequisition, approvePR, rejectPR, totalQty, totalCost, itemSummary, statusConfig, statusOptions } = store

  // ─── Local State ──────────────────────────────────────────────────
  const search          = ref('')
  const showModal       = ref(false)
  const showPOModal     = ref(false)
  const selectedPR      = ref<PR | null>(null)
  const selectedPRForPO = ref<PR | null>(null)
  const sortKey         = ref('')
  const sortOrder       = ref<'asc' | 'desc'>('asc')
  const page            = ref(1)
  const itemsPerPage    = ref(10)

  const confirmDialog = ref({
    show:     false,
    action:   '' as 'APPROVE' | 'REJECT',
    prId:     0,
    prNumber: '',
  })

  // ─── Computed ─────────────────────────────────────────────────────
  const sortedFilteredPRs = computed(() => {
    let result = filterStatus.value
      ? prs.value.filter(pr => pr.status === filterStatus.value)
      : prs.value

    if (search.value.trim()) {
      const q = search.value.toLowerCase()
      result = result.filter(pr =>
        pr.requisition_no?.toLowerCase().includes(q) ||
        pr.requester_name?.toLowerCase().includes(q)
      )
    }

    if (!sortKey.value) return result

    return [...result].sort((a: any, b: any) => {
      const valA = a[sortKey.value] ?? ''
      const valB = b[sortKey.value] ?? ''
      const cmp  = String(valA).localeCompare(String(valB))
      return sortOrder.value === 'asc' ? cmp : -cmp
    })
  })

  // ─── Actions ──────────────────────────────────────────────────────
  function openDetail(pr: PR) {
    selectedPR.value = pr
    showModal.value  = true
  }

  function openConfirm(action: 'APPROVE' | 'REJECT', pr: { id: number; requisition_no: string }) {
    confirmDialog.value = { show: true, action, prId: pr.id, prNumber: pr.requisition_no }
  }

  function closeConfirm() {
    confirmDialog.value.show = false
  }

  async function handleConfirm() {
    const { action, prId } = confirmDialog.value
    action === 'APPROVE' ? await approvePR(prId) : await rejectPR(prId)
    closeConfirm()
  }

  function openPurchaseOrder(pr: PR) {
    selectedPRForPO.value = pr
    showPOModal.value     = true
  }

  async function loadItems({ sortBy }: {
    page: number
    itemsPerPage: number
    sortBy: { key: string; order: 'asc' | 'desc' }[]
  }) {
    await Promise.all([
      fetchPurchaseRequisition(),
      supplierStore.fetchSuppliers(),
    ])

    if (sortBy.length) {
      sortKey.value   = sortBy[0].key
      sortOrder.value = sortBy[0].order
    } else {
      sortKey.value = ''
    }
  }

  async function init() {
    await Promise.all([
      fetchPurchaseRequisition(),
      supplierStore.fetchSuppliers(),
    ])
  }

  return {
    // store refs
    loading, filterStatus,
    // local state
    search, showModal, showPOModal,
    selectedPR, selectedPRForPO,
    confirmDialog, page, itemsPerPage,
    // computed
    sortedFilteredPRs,
    // store utils
    totalQty, totalCost, itemSummary, statusConfig, statusOptions,
    // actions
    openDetail, openConfirm, closeConfirm,
    handleConfirm, openPurchaseOrder,
    loadItems, init,
  }
}