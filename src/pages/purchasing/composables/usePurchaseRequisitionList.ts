import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisition'
import { useSuppliersDataStore } from '@/stores/suppliersDataStore'
import type { PR } from '@/stores/purchaseRequisition'

export const headers = [
  { title: 'PR #',         key: 'pr_number',     sortable: true,  align: 'center' as const },
  { title: 'ITEMS',        key: 'items',          sortable: false, align: 'center' as const },
  { title: 'TOTAL QTY',    key: 'total_qty',      sortable: true,  align: 'center' as const },
  { title: 'TOTAL COST',   key: 'total_cost',     sortable: true,  align: 'center' as const },
  { title: 'REQUESTED BY', key: 'requester_name', sortable: true,  align: 'center' as const },
  { title: 'DATE',         key: 'created_at',     sortable: true,  align: 'center' as const },
  { title: 'STATUS',       key: 'status',         sortable: true,  align: 'center' as const },
  { title: 'REVIEWED BY',  key: 'reviewer_name',  sortable: true,  align: 'center' as const },
  { title: 'DATE',         key: 'reviewed_at',    sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',      key: 'actions',        sortable: false, align: 'center' as const },
]

export function usePurchaseRequisitionList() {
  const supplierStore = useSuppliersDataStore()
  const store = usePurchaseRequisitionStore()

  const {
    loading,
    selectedPR,
    filterStatus,
    filteredPRs,
  } = storeToRefs(store)

  const {
    fetchPurchaseRequisition,
    approvePR,
    rejectPR,
    totalQty,
    totalCost,
    itemSummary,
    statusConfig,
    statusOptions,
  } = store

  // ─── Local UI State ─────────────────────────────────────────────
  const showModal        = ref(false)
  const search           = ref('')
  const showPOModal      = ref(false)
  const selectedPRForPO  = ref<PR | null>(null)

  const confirmDialog = ref({
    show: false,
    action: '' as 'APPROVE' | 'REJECT',
    prId: 0 as number,
    prNumber: '' as string,
  })

  // ─── Actions ────────────────────────────────────────────────────
  function openDetail(pr: typeof selectedPR.value) {
    selectedPR.value = pr
    showModal.value = true
  }

  function openConfirm(action: 'APPROVE' | 'REJECT', pr: { id: number; pr_number: string }) {
    confirmDialog.value = {
      show: true,
      action,
      prId: pr.id,
      prNumber: pr.pr_number,
    }
  }

  function closeConfirm() {
    confirmDialog.value.show = false
  }

  async function handleConfirm() {
    const { action, prId } = confirmDialog.value
    if (action === 'APPROVE') {
      await approvePR(prId)
    } else {
      await rejectPR(prId)
    }
    closeConfirm()
  }

  function openPurchaseOrder(pr: PR) {
    selectedPRForPO.value = pr
    showPOModal.value = true
  }

  onMounted(async () => {
    await fetchPurchaseRequisition()
    await supplierStore.fetchSuppliers()
  })

  return {
    // store refs
    loading,
    selectedPR,
    filterStatus,
    filteredPRs,
    // store methods
    totalQty,
    totalCost,
    itemSummary,
    statusConfig,
    statusOptions,
    // local state
    showModal,
    search,
    showPOModal,
    selectedPRForPO,
    confirmDialog,
    // actions
    openDetail,
    openConfirm,
    closeConfirm,
    handleConfirm,
    openPurchaseOrder,
  }
}