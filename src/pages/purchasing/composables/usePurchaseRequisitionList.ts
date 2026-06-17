import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'

export type PRItem = {
  id: number
  no: number
  unit: string
  item_description: string
  qty: number
  offer_per_unit: number
  cost_per_unit: number
  pr_id: number | null
}

export type PR = {
  id: number
  created_at: string
  pr_number: string
  status: string
  supplier_id: number | null
  requester_name: string | null
  reviewer_name: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  justification: string | null
  items: PRItem[]
}

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
  const toast = useToast()

  // ─── State ──────────────────────────────────────────────────────
  const loading        = ref(false)
  const selectedPR     = ref<PR | null>(null)
  const filterStatus   = ref<string | null>(null)
  const filteredPRs    = ref<PR[]>([])
  const prs            = ref<PR[]>([])
  const search         = ref('')
  const showModal      = ref(false)
  const showPOModal    = ref(false)
  const selectedPRForPO = ref<PR | null>(null)
  const page           = ref(1)
  const itemsPerPage   = ref(10)

  const confirmDialog = ref({
    show:     false,
    action:   '' as 'APPROVE' | 'REJECT',
    prId:     0 as number,
    prNumber: '' as string,
  })

  // ─── Helpers ────────────────────────────────────────────────────
  const totalQty = (items: PRItem[]) => items.reduce((sum, i) => sum + i.qty, 0)
  const totalCost = (items: PRItem[]) => items.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)
  const itemSummary = (items: PRItem[]) =>
    items.slice(0, 2).map(i => i.item_description).filter(Boolean).join(', ') +
    (items.length > 2 ? ` +${items.length - 2} more` : '')

  const statusConfig = (status: string) => {
    const labels: Record<string, { label: string }> = {
      pending_approval: { label: 'Pending Approval' },
      approved: { label: 'Approved' },
      rejected: { label: 'Rejected' },
    }
    return labels[status] ?? { label: status }
  }

  const statusOptions = [
    { title: 'All', value: null },
    { title: 'Pending Approval', value: 'pending_approval' },
    { title: 'Approved', value: 'approved' },
    { title: 'Rejected', value: 'rejected' },
  ]

  // ─── Actions ────────────────────────────────────────────────────
  async function fetchPRs() {
    loading.value = true

    try {
      let q = supabase
        .from('purchase_requisitions')
        .select('*, purchase_requisition_items(*)')
        .order('created_at', { ascending: false })

      if (filterStatus.value) {
        q = q.eq('status', filterStatus.value)
      }

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      prs.value = (data || []) as PR[]
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
        pr =>
          pr.pr_number.toLowerCase().includes(s) ||
          (pr.requester_name ?? '').toLowerCase().includes(s)
      )
    }

    filteredPRs.value = result
  }

  function openDetail(pr: PR) {
    selectedPR.value = pr
    showModal.value = true
  }

  function openConfirm(action: 'APPROVE' | 'REJECT', pr: { id: number; pr_number: string }) {
    confirmDialog.value = { show: true, action, prId: pr.id, prNumber: pr.pr_number }
  }

  function closeConfirm() {
    confirmDialog.value.show = false
  }

  async function handleConfirm() {
    const { action, prId } = confirmDialog.value
    loading.value = true

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const updateData = {
        status: action === 'APPROVE' ? 'approved' : 'rejected',
        reviewer_name: user?.email ?? 'System',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id ?? null,
      }

      const { error: updateError } = await supabase
        .from('purchase_requisitions')
        .update(updateData)
        .eq('id', prId)

      if (updateError) throw updateError

      toast.success(`Purchase requisition ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully!`)
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