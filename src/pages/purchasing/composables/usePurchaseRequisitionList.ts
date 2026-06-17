import { ref } from 'vue'
import { useToast } from 'vue-toastification'
import { useTransactionsDataStore } from '@/stores/transactionsData'
import { useTransactionItemsDataStore } from '@/stores/transactionsItemsData'
import { useAuthUserStore } from '@/stores/authUser'

export type PRItem = {
  id: number
  no: number | null
  unit: string
  item_description: string | null
  qty: number
  offer_per_unit: number
  cost_per_unit: number
  product_id: number
  SKU?: number | null
}

export type PR = {
  id: number
  created_at: string
  pr_number: string | null
  status: string | null
  supplier_id: number | null
  requester_name: string | null
  reviewer_name: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  justification: string | null
  total_amount: number | null
  items: PRItem[]
}

export const headers = [
  { title: 'PR #', key: 'pr_number', sortable: true, align: 'center' as const },
  { title: 'ITEMS', key: 'items', sortable: false, align: 'center' as const },
  { title: 'TOTAL QTY', key: 'total_qty', sortable: true, align: 'center' as const },
  { title: 'TOTAL COST', key: 'total_cost', sortable: true, align: 'center' as const },
  { title: 'REQUESTED BY', key: 'requester_name', sortable: true, align: 'center' as const },
  { title: 'DATE', key: 'created_at', sortable: true, align: 'center' as const },
  { title: 'STATUS', key: 'status', sortable: true, align: 'center' as const },
  { title: 'REVIEWED BY', key: 'reviewer_name', sortable: true, align: 'center' as const },
  { title: 'ACTIONS', key: 'actions', sortable: false, align: 'center' as const },
]

export function usePurchaseRequisitionList() {
  const toast = useToast()
  const transactionsStore = useTransactionsDataStore()
  const transactionItemsStore = useTransactionItemsDataStore()
  const authStore = useAuthUserStore()

  // ─── State ──────────────────────────────────────────────────────
  const loading = ref(false)
  const selectedPR = ref<PR | null>(null)
  const filterStatus = ref<string | null>(null)
  const filteredPRs = ref<PR[]>([])
  const prs = ref<PR[]>([])
  const search = ref('')
  const showModal = ref(false)
  const showPOModal = ref(false)
  const selectedPRForPO = ref<PR | null>(null)
  const page = ref(1)
  const itemsPerPage = ref(10)

  const confirmDialog = ref({
    show: false,
    action: '' as 'APPROVE' | 'REJECT',
    prId: 0 as number,
    prNumber: '' as string,
  })

  // ─── Helpers ────────────────────────────────────────────────────
  const totalQty = (items: PRItem[]) => items.reduce((sum, i) => sum + i.qty, 0)
  const totalCost = (items: PRItem[]) =>
    items.reduce((sum, i) => sum + i.qty * (i.cost_per_unit ?? 0), 0)
  const itemSummary = (items: PRItem[]) =>
    items
      .slice(0, 2)
      .map((i) => i.item_description)
      .filter(Boolean)
      .join(', ') + (items.length > 2 ? ` +${items.length - 2} more` : '')

  const statusConfig = (status: string | null | undefined) => {
    const s = status ?? ''
    const labels: Record<string, { label: string }> = {
      pending_approval: { label: 'Pending Approval' },
      approved: { label: 'Approved' },
      rejected: { label: 'Rejected' },
    }
    return labels[s] ?? { label: status }
  }

  const statusOptions = [
    { title: 'All', value: null },
    { title: 'Pending Approval', value: 'pending_approval' },
    { title: 'Approved', value: 'approved' },
    { title: 'Rejected', value: 'rejected' },
  ]

  // ─── Build PR from a transaction + its linked products ──────────
  async function buildPR(tx: any): Promise<PR> {
    // Fetch transaction_items to get products
    const itemsData = await transactionItemsStore.fetchTransactionItems({ transaction_id: tx.id })

    const items: PRItem[] = (itemsData || []).map((ti) => {
      const p = ti.product
      return {
        id: ti.id,
        no: p?.no ?? 0,
        unit: '',
        item_description: p?.product_name ?? p?.item_decription ?? '(no description)',
        qty: 0,
        offer_per_unit: p?.offer_per_unit ?? 0,
        cost_per_unit: p?.cost_per_unit ?? 0,
        product_id: p?.id ?? 0,
      }
    })

    // Extract justification from remarks (first line after "Justification: ")
    let justification: string | null = null
    if (tx.remarks) {
      const match = tx.remarks.match(/Justification:\s*(.+?)(?:\n|$)/)
      justification = match ? match[1].trim() : tx.remarks
    }

    return {
      id: tx.id,
      created_at: tx.created_at,
      pr_number: tx.reference_no,
      status: tx.status,
      supplier_id: tx.supplier_id,
      requester_name: tx.created_by,
      reviewer_name: tx.approved_by,
      reviewed_at: tx.updated_at,
      reviewed_by: tx.approved_by,
      justification,
      total_amount: tx.total_amount,
      items,
    }
  }

  // ─── Actions ────────────────────────────────────────────────────
  async function fetchPRs() {
    loading.value = true

    try {
      const data = await transactionsStore.fetchTransactions({ transaction_type: 'requisition' })
      console.log('fetchPRs — raw transactions:', data)

      const prPromises = (data || []).map((tx) => {
        console.log('fetchPRs — building PR from tx:', tx)
        return buildPR(tx)
      })
      prs.value = await Promise.all(prPromises)
      console.log('fetchPRs — built PRs:', prs.value)

      applyFilters()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch purchase requisitions')
    } finally {
      loading.value = false
    }
  }

  function applyFilters() {
    let result = prs.value

    if (search.value.trim()) {
      const s = search.value.trim().toLowerCase()
      result = result.filter(
        (pr) =>
          (pr.pr_number ?? '').toLowerCase().includes(s) ||
          (pr.requester_name ?? '').toLowerCase().includes(s),
      )
    }

    filteredPRs.value = result
  }

  function openDetail(pr: PR) {
    selectedPR.value = pr
    showModal.value = true
  }

  function openConfirm(action: 'APPROVE' | 'REJECT', pr: { id: number; pr_number: string | null }) {
    confirmDialog.value = { show: true, action, prId: pr.id, prNumber: pr.pr_number ?? '' }
  }

  function closeConfirm() {
    confirmDialog.value.show = false
  }

  async function handleConfirm() {
    const { action, prId } = confirmDialog.value
    loading.value = true

    try {
      const userId = authStore.userData?.id ?? null
      const updateData = {
        status: action === 'APPROVE' ? 'approved' : 'rejected',
        approved_by: userId,
        updated_at: new Date().toISOString(),
      }

      const updated = await transactionsStore.updateTransaction(prId, updateData)
      if (!updated) throw new Error('Failed to update requisition')

      toast.success(
        `Purchase requisition ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully!`,
      )
      closeConfirm()
      await fetchPRs()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update purchase requisition')
    } finally {
      loading.value = false
    }
  }

  function openPurchaseOrder(pr: PR) {
    selectedPRForPO.value = pr
    showPOModal.value = true
  }

  async function init() {
    await fetchPRs()
  }

  return {
    loading,
    selectedPR,
    filterStatus,
    filteredPRs,
    prs,
    totalQty,
    totalCost,
    itemSummary,
    statusConfig,
    statusOptions,
    page,
    itemsPerPage,
    search,
    showModal,
    showPOModal,
    selectedPRForPO,
    confirmDialog,
    openDetail,
    openConfirm,
    closeConfirm,
    handleConfirm,
    openPurchaseOrder,
    init,
  }
}
