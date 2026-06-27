import { useTransactionsData } from '@/composables/useTransactionsData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { useLogsDataStore } from '@/stores/logsData'
import { useAuthUserStore } from '@/stores/authUser'
import type { PR } from '@/stores/transactionsData'
import { ref, computed } from 'vue'

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
  const supplierStore = useSuppliersDataStore()
  const logsStore = useLogsDataStore()
  const authStore = useAuthUserStore()

  const { 
    // state
    loading, filterStatus,
    // computed
    filteredPRs,
    // utilities
    totalQty, totalCost, itemSummary, statusConfig, statusOptions,
    // actions
    fetchPurchaseRequisition, approvePR, rejectPR,
  } =  useTransactionsData()

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
    let result = filteredPRs.value

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
  // total count of filtered results (used for mobile pagination)
  const totalItems = computed(() => sortedFilteredPRs.value.length)

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
    const { action, prId, prNumber } = confirmDialog.value

    // Get the current user for logging
    let userId: string | undefined
    const { user, error: authError } = await authStore.getCurrentUser()
    if (!authError && user) {
      userId = user.id
    }

    if (action === 'APPROVE') {
      await approvePR(prId)
      await logsStore.createLog({
        created_by: userId,
        action: 'approve_pr',
        description: `Purchase requisition ${prNumber} approved`,
        transaction_id: prId,
        module: 'purchase_requisition',
      })
    } else {
      await rejectPR(prId)
      await logsStore.createLog({
        created_by: userId,
        action: 'reject_pr',
        description: `Purchase requisition ${prNumber} rejected`,
        transaction_id: prId,
        module: 'purchase_requisition',
      })
    }
    closeConfirm()
  }

  async function openPurchaseOrder(pr: PR) {
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

  // ─── Mobile Pagination ────────────────────────────────────────────
  function prevPage() {
    if (page.value > 1) {
      page.value--
    }
  }

  function nextPage() {
    if (page.value * itemsPerPage.value < totalItems.value) {
      page.value++
    }
  }

  // slice of sortedFilteredPRs for the current mobile page
  const pagedPRs = computed(() => {
    const start = (page.value - 1) * itemsPerPage.value
    return sortedFilteredPRs.value.slice(start, start + itemsPerPage.value)
  })

  return {
    // store refs
    loading, filterStatus,
    // local state
    search, showModal, showPOModal,
    selectedPR, selectedPRForPO,
    confirmDialog, page, itemsPerPage,
    // computed
    sortedFilteredPRs,
    pagedPRs,
    totalItems,
    // store utils
    totalQty, totalCost, itemSummary, statusConfig, statusOptions,
    // actions
    openDetail, openConfirm, closeConfirm,
    handleConfirm, openPurchaseOrder,
    loadItems, init,
    // mobile pagination
    prevPage, nextPage,
  }
}