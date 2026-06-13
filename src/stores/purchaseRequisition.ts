import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'

const toast = useToast()

export type PurchaseRequisitionType = {
  id?: number
  created_at?: string
  justification?: string | null
  status?: string
  requested_by: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  updated_at?: string
  supplier_id?: number | null
}

export type RequisitionItemType = {
  id?: number
  requisition_id?: string
  no: number
  unit: string
  item_description: string
  qty: number
  offer_per_unit: number
  cost_per_unit: number
  created_at?: string
}

export type PRItem = {
  id: number
  no: number
  unit: string
  item_description: string
  qty: number
  offer_per_unit: number
  cost_per_unit: number
  SKU: string | null
  cost_price: number | null
  sell_price: number | null
  val_cost: number | null
  val_sell: number | null
  total_sold: number | null
  transfered: number | null
  adjusted: number | null
  expiry_date: string | null
  reorder_pt: number | null
}

export type PR = {
  id: number
  pr_number: string
  status: string
  justification: string | null
  created_at: string
  requested_by: string
  reviewed_by: string
  reviewed_at: string
  requester_name?: string
  reviewer_name?: string
  items: PRItem[]
  supplier_id?: string | null  // add this
}

export const usePurchaseRequisitionStore = defineStore('purchaseRequisition', () => {
  const loading = ref(false)
  const error: Ref<string> = ref('')
  const prs = ref<PR[]>([])
  const selectedPR = ref<PR | null>(null)
  const filterStatus = ref<string | null>(null)
  const items = ref<RequisitionItemType[]>([])

  const currentPR = ref<PurchaseRequisitionType>({
    justification: null,
    status: 'pending_approval',
    requested_by: null,
    reviewed_by: null,
    reviewed_at: null,
    supplier_id: null,
  })

  // ─── Computed ─────────────────────────────────────────────────────
  const customerOfferTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.offer_per_unit, 0),
  )
  const companyCostTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0),
  )
  const profit = computed(() => customerOfferTotal.value - companyCostTotal.value)
  const isProfitable = computed(() => profit.value > 0)
  const offerCostRatio = computed(() =>
    companyCostTotal.value === 0
      ? '0.00'
      : (customerOfferTotal.value / companyCostTotal.value).toFixed(2),
  )
  const marginPercent = computed(() =>
    customerOfferTotal.value === 0
      ? '0'
      : Math.floor((profit.value / customerOfferTotal.value) * 100),
  )

  // Filtered PRs based on selected status
  const filteredPRs = computed(() =>
    filterStatus.value ? prs.value.filter((pr) => pr.status === filterStatus.value) : prs.value,
  )

  // ─── Constants ────────────────────────────────────────────────────
  const statusOptions = [
    { title: 'All', value: null },
    { title: 'Pending Approval', value: 'pending_approval' },
    { title: 'Approved', value: 'approved' },
    { title: 'Rejected', value: 'rejected' },
  ]

  // ─── Utilities ────────────────────────────────────────────────────
  const totalQty = (list: PRItem[]) => list.reduce((sum, i) => sum + i.qty, 0)
  const totalCost = (list: PRItem[]) => list.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)
  const itemSummary = (list: PRItem[]) => {
    if (!list?.length) return '—'
    const extra = list.length - 1
    return extra > 0 ? `${list[0].item_description} +${extra} more` : list[0].item_description
  }
  const statusConfig = (status: string) => {
    const map: Record<string, { label: string; color: string; bg: string; dot: string }> = {
      pending_approval: {
        label: 'Pending Approval',
        color: '#c2922e',
        bg: '#fff8ee',
        dot: '#c2922e',
      },
      approved: { label: 'Approved', color: '#2e7d32', bg: '#f0f9f0', dot: '#4caf50' },
      rejected: { label: 'Rejected', color: '#c62828', bg: '#fff0f0', dot: '#ef5350' },
    }
    return map[status] ?? { label: status, color: '#757575', bg: '#f5f5f5', dot: '#9e9e9e' }
  }

  // Functions
  function resetStore() {
    currentPR.value = {
      justification: null,
      status: 'pending_approval',
      requested_by: null,
      reviewed_by: null,
      reviewed_at: null,
      supplier_id: null,
    }
    items.value = []
    error.value = ''
  }

  async function savePurchaseRequisition() {
    loading.value = true
    error.value = ''

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const { data: prData, error: prError } = await supabase
      .from('purchase_requisition')
      .insert({
        justification: currentPR.value.justification || '',
        status: currentPR.value.status,
        requested_by: user.id,
        supplier_id: currentPR.value.supplier_id,
      })
      .select('id, pr_number')
      .single()

    if (prError || !prData) {
      error.value = 'Failed to save purchase requisition. Please try again.'
      toast.error('Failed to save Purchase Requisition. Please try again.')
      loading.value = false
      return { success: false, error: error.value }
    }

    if (items.value.length > 0) {
      const { error: itemsError } = await supabase.from('purchase_requisition_items').insert(
        items.value.map((item) => ({
          requisition_id: prData.id,
          no: item.no,
          unit: item.unit,
          item_description: item.item_description,
          qty: item.qty,
          offer_per_unit: item.offer_per_unit,
          cost_per_unit: item.cost_per_unit,
        })),
      )

      if (itemsError) {
        error.value = 'Failed to save purchase requisition. Please try again.'
        toast.error('Failed to save Purchase Requisition. Please try again.')
        loading.value = false
        return { success: false, error: error.value }
      }
    }

    toast.success('Purchase requisition saved successfully.')
    resetStore()
    loading.value = false
    return { success: true }
  }

  async function fetchPurchaseRequisition() {
    loading.value = true
    error.value = ''

    const { data, error: fetchError } = await supabase
      .from('purchase_requisition')
      .select(
        `
         *,
          purchase_requisition_items (
            id, no, unit, item_description, qty, offer_per_unit, cost_per_unit,
            cost_price, sell_price, val_cost, val_sell, total_sold, transfered,
            adjusted, expiry_date, reorder_pt, SKU
          )
        `,
      )
      .order('created_at', { ascending: false })

    if (fetchError) {
      toast.error('Failed to fetch Purchase Requisition. Please try again.')
      loading.value = false
      return
    }

    prs.value = await Promise.all(
      (data || []).map(async (pr: any) => {
        const [requesterRes, reviewerRes] = await Promise.all([
          pr.requested_by
            ? supabase.rpc('get_user_full_name', { user_id: pr.requested_by })
            : Promise.resolve({ data: null }),
          pr.reviewed_by
            ? supabase.rpc('get_user_full_name', { user_id: pr.reviewed_by })
            : Promise.resolve({ data: null }),
        ])
        return {
          ...pr,
          items: pr.purchase_requisition_items || [],
          requester_name: requesterRes.data?.toUpperCase() ?? '-',
          reviewer_name: reviewerRes.data?.toUpperCase() ?? '-',
          total_qty: (pr.purchase_requisition_items || []).reduce(
            (s: number, i: any) => s + i.qty,
            0,
          ),
          total_cost: (pr.purchase_requisition_items || []).reduce(
            (s: number, i: any) => s + i.qty * i.cost_per_unit,
            0,
          ),
        }
      }),
    )

    loading.value = false
  }

  async function approvePR(prId: number) {
    loading.value = true

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error('User not authenticated.')
      loading.value = false
      return
    }

    const { error: updateError } = await supabase
      .from('purchase_requisition')
      .update({
        status: 'approved',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', prId)

    if (updateError) {
      toast.error('Failed to approve Purchase Requisition. Please try again.')
      loading.value = false
      return
    }

    toast.success('Purchase Requisition approved successfully.')
    await fetchPurchaseRequisition()
    loading.value = false
  }

  async function rejectPR(prId: number) {
    loading.value = true

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error('User not authenticated.')
      loading.value = false
      return
    }

    const { error: updateError } = await supabase
      .from('purchase_requisition')
      .update({
        status: 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', prId)

    if (updateError) {
      toast.error('Failed to reject Purchase Requisition. Please try again.')
      loading.value = false
      return
    }

    toast.success('Purchase Requisition rejected successfully.')
    await fetchPurchaseRequisition()
    loading.value = false
  }

  // ─── Expose ───────────────────────────────────────────────────────
  return {
    // State
    currentPR,
    items,
    loading,
    error,
    selectedPR,
    filterStatus,
    prs,
    // Computed
    customerOfferTotal,
    companyCostTotal,
    profit,
    isProfitable,
    offerCostRatio,
    marginPercent,
    filteredPRs,
    // Constants
    statusOptions,
    // Utilities
    totalQty,
    totalCost,
    itemSummary,
    statusConfig,
    // Actions
    savePurchaseRequisition,
    resetStore,
    fetchPurchaseRequisition,
    approvePR,
    rejectPR,
  }
})
