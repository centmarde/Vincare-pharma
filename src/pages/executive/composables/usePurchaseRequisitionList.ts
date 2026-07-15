import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import { useTransactionsData } from '@/composables/useTransactionsData'
import { useTransactionsDataStore } from '@/stores/transactionsData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { useProductsDataStore } from '@/stores/productsData'
import type { PR } from '@/stores/purchaseRequisitionData'
import { useExecutiveStore } from '@/stores/executiveData'
import { useLogsDataStore } from '@/stores/logsData'
import { useAuthUserStore } from '@/stores/authUser'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
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
  const txStore       = useTransactionsDataStore()
  const prStore       = usePurchaseRequisitionStore()
  const supplierStore = useSuppliersDataStore()
  const logsStore     = useLogsDataStore()
  const authStore     = useAuthUserStore()
  const productsStore = useProductsDataStore()
  const executiveStore = useExecutiveStore()
  const { loading }   = storeToRefs(txStore)
  const { totalQty, totalCost, itemSummary, itemNames, statusConfig, statusOptions } = useTransactionsData()
  const { reorderRequests, reorderCount } = storeToRefs(productsStore)

  const search        = ref('')
  const filterStatus  = ref<string | null>(null)
  const showModal     = ref(false)
  const showPOModal   = ref(false)
  const selectedPR    = ref<PR | null>(null)
  const selectedPRForPO = ref<PR | null>(null)
  const serverItems   = ref<PR[]>([])
  const totalItems    = ref(0)
  const page          = ref(1)
  const itemsPerPage  = ref(10)
  const searchInput      = ref(search.value)
  const stats = ref({ total: 0, pending: 0, approved: 0, rejected: 0 , complete: 0 })
  const showReorderDialog = ref(false)

  const confirmDialog = ref({ show: false, action: '' as 'APPROVE' | 'REJECT', prId: 0, prNumber: '' })
  const confirmLoading = ref(false)

  async function loadItems({ page: p, itemsPerPage: ipp, sortBy }: {
    page: number
    itemsPerPage: number
    sortBy: { key: string; order: 'asc' | 'desc' }[]
  }) {
    const sort = sortBy[0]

    if (!authStore.users.length) await authStore.getAllUsers()

    const { rows, totalCount } = await txStore.fetchPurchaseRequisitionsRPC({
      search:    search.value.trim() || undefined,
      status:    filterStatus.value ?? undefined,
      orderBy:   (sort?.key as any) ?? 'created_at',
      ascending: sort ? sort.order === 'asc' : false,
      limit:     ipp,
      offset:    (p - 1) * ipp,
    })

    serverItems.value = rows.map(row => {
      const names = prStore.resolveUserNames(row.created_by, row.approved_by)
      return prStore.mapRPCRowToPR(row, names)
    })
    totalItems.value = totalCount
    page.value = p
  }

  async function loadStats() {
    const { rows } = await txStore.fetchPurchaseRequisitionsRPC({
      orderBy: 'created_at',
      ascending: false,
      limit: 1000, // adjust upward if you expect more PRs than this
      offset: 0,
    })

    const mapped = rows.map(row => {
      const names = prStore.resolveUserNames(row.created_by, row.approved_by)
      return prStore.mapRPCRowToPR(row, names)
    })

    stats.value = {
      total: mapped.length,
      pending: mapped.filter(p => p.status === 'pending_approval').length,
      approved: mapped.filter(p => p.status === 'approved').length,
      rejected: mapped.filter(p => p.status === 'rejected').length,
      complete: mapped.filter(p => p.status === 'complete').length,
    }
    executiveStore.setPendingPrApprovalCount(stats.value.pending)
  }

  async function openReorderDialog() {
    await productsStore.fetchReorderRequests()
    showReorderDialog.value = true
  }


  watch([search, filterStatus], () =>
    loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
  )

  async function init() {
    await productsStore.fetchReorderCount()
    await supplierStore.fetchSuppliers()
    await loadStats()
  }

  function openDetail(pr: PR) {
    selectedPR.value = pr
    showModal.value  = true
  }

  function openConfirm(action: 'APPROVE' | 'REJECT', pr: { id: number; requisition_no: string }) {
    confirmDialog.value = { show: true, action, prId: pr.id, prNumber: pr.requisition_no }
  }

  function closeConfirm() { confirmDialog.value.show = false }

  async function handleConfirm() {
    if (!confirmDialog.value.show || confirmLoading.value) return
    confirmLoading.value = true

    const { action, prId, prNumber } = confirmDialog.value
    const { user, error: authError } = await authStore.getCurrentUser()
    const userId = !authError && user ? user.id : undefined

    if (action === 'APPROVE') {
      await prStore.approvePR(prId)
      await logsStore.createLog({
        created_by: userId, action: 'approve_pr',
        description: `Purchase requisition ${prNumber} approved`,
        transaction_id: prId, module: 'purchase_requisition',
      })
    } else {
      await prStore.rejectPR(prId)
      await logsStore.createLog({
        created_by: userId, action: 'reject_pr',
        description: `Purchase requisition ${prNumber} rejected`,
        transaction_id: prId, module: 'purchase_requisition',
      })
    }
    closeConfirm()
    await Promise.all([
      loadItems({ page: page.value, itemsPerPage: itemsPerPage.value, sortBy: [] }),
      loadStats(),
      ])
      confirmLoading.value = false
    }
  async function openPurchaseOrder(pr: PR) {
    selectedPRForPO.value = pr
    showPOModal.value     = true
  }

  function commitSearch(){
    search.value = searchInput.value
  }
  
  function clearSearch(){
    searchInput.value = ''
    search.value = ''
  }

  return {
    loading, filterStatus, search, showModal, showPOModal,
    selectedPR, selectedPRForPO, confirmDialog, confirmLoading,
    page, itemsPerPage, serverItems, totalItems,
    searchInput, commitSearch, clearSearch,
    openReorderDialog, reorderRequests, showReorderDialog, reorderCount,
    totalQty, totalCost, itemSummary, itemNames, statusConfig, statusOptions,
    openDetail, openConfirm, closeConfirm,
    handleConfirm, openPurchaseOrder,
    loadItems, init,
    stats,

  }
}