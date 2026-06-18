import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'

const toast = useToast()

// ─── Types ────────────────────────────────────────────────────────────────────

export type PRItem = {
  id: number
  no: number
  unit: string
  item_description: string
  qty: number
  offer_per_unit: number
  cost_per_unit: number
  sku?: string | null
}

export type RequisitionItemType = {
  no: number
  unit: string
  item_description: string
  qty: number
  offer_per_unit: number
  cost_per_unit: number
}

export type PR = {
  id: number
  reference_no: string
  status: string
  remarks: string | null
  total_amount: number
  supplier_id: string | null
  created_at: string
  created_by: string
  approved_by: string | null
  updated_at: string | null
  requester_name?: string
  reviewer_name?: string
  items: PRItem[]
}

export type PurchaseRequisitionType = {
  remarks: string | null
  status: string
  requested_by: string | null
  supplier_id: string | null
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePurchaseRequisitionStore = defineStore('purchaseRequisition', () => {

  // ─── State ────────────────────────────────────────────────────────
  const loading   = ref(false)
  const error: Ref<string> = ref('')
  const prs       = ref<PR[]>([])
  const selectedPR = ref<PR | null>(null)
  const filterStatus = ref<string | null>(null)
  const subscriptionChannel = ref<any>(null)

  const items = ref<RequisitionItemType[]>([])

  const currentPR = ref<PurchaseRequisitionType>({
    remarks:      null,
    status:       'pending_approval',
    requested_by: null,
    supplier_id:  null,
  })

  async function generatePRNumber(): Promise<string> {
    const year = new Date().getFullYear()
    const prefix = `PR-${year}-`

    const { data } = await supabase
        .from('transactions')
        .select('reference_no')
        .ilike('reference_no', `${prefix}%`)  // ✅ no transaction_type filter
        .order('reference_no', { ascending: false })
        .limit(1)

    const latest = data?.[0]?.reference_no
    const lastNum = latest ? parseInt(latest.split('-')[2], 10) : 0
    const next = String(lastNum + 1).padStart(3, '0')

    return `${prefix}${next}`
  }



  // ─── Computed ─────────────────────────────────────────────────────
  const customerOfferTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.offer_per_unit, 0)
  )
  const companyCostTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)
  )
  const profit       = computed(() => customerOfferTotal.value - companyCostTotal.value)
  const isProfitable = computed(() => profit.value > 0)
  const offerCostRatio = computed(() =>
    companyCostTotal.value === 0
      ? '0.00'
      : (customerOfferTotal.value / companyCostTotal.value).toFixed(2)
  )
  const marginPercent = computed(() =>
    customerOfferTotal.value === 0
      ? '0'
      : Math.floor((profit.value / customerOfferTotal.value) * 100)
  )

  const filteredPRs = computed(() =>
    filterStatus.value
      ? prs.value.filter(pr => pr.status === filterStatus.value)
      : prs.value
  )

  // ─── Constants ────────────────────────────────────────────────────
  const statusOptions = [
    { title: 'All',              value: null },
    { title: 'Pending Approval', value: 'pending_approval' },
    { title: 'Approved',         value: 'approved' },
    { title: 'Rejected',         value: 'rejected' },
  ]

  // ─── Utilities ────────────────────────────────────────────────────
  const totalQty  = (list: PRItem[]) => list.reduce((sum, i) => sum + i.qty, 0)
  const totalCost = (list: PRItem[]) => list.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)

  const itemSummary = (list: PRItem[]) => {
    if (!list?.length) return '—'
    const extra = list.length - 1
    return extra > 0 ? `${list[0].item_description} +${extra} more` : list[0].item_description
  }

  const statusConfig = (status: string) => {
    const map: Record<string, { label: string; color: string; bg: string; dot: string }> = {
      pending_approval: { label: 'Pending Approval', color: '#c2922e', bg: '#fff8ee', dot: '#c2922e' },
      approved:         { label: 'Approved',         color: '#2e7d32', bg: '#f0f9f0', dot: '#4caf50' },
      rejected:         { label: 'Rejected',         color: '#c62828', bg: '#fff0f0', dot: '#ef5350' },
    }
    return map[status] ?? { label: status, color: '#757575', bg: '#f5f5f5', dot: '#9e9e9e' }
  }

  // ─── Helpers ──────────────────────────────────────────────────────
  const handleError = (err: unknown, message: string) => {
    error.value = err instanceof Error ? err.message : message
  }

  function resetStore() {
    currentPR.value = {
      remarks:      null,
      status:       'pending_approval',
      requested_by: null,
      supplier_id:  null,
    }
    items.value  = []
    error.value  = ''
  }

  // ─── Actions ──────────────────────────────────────────────────────

  async function savePurchaseRequisition() {
    loading.value = true
    error.value   = ''

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const reference_no = await generatePRNumber()

    // 1. Insert into transactions
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .insert({
        reference_no:     reference_no,
        transaction_type: 'purchase_requisition',
        status:           'pending_approval',
        remarks:          currentPR.value.remarks ?? '',
        total_amount:     companyCostTotal.value,
        supplier_id:      currentPR.value.supplier_id,
        created_by:       user.id,
      })
      .select('id, reference_no')
      .single()

    if (txError || !txData) {
        console.error('Full error:', JSON.stringify(txError, null, 2))
        console.log('Attempted insert data:', {
            reference_no:     reference_no,
            transaction_type: 'purchase_requisition',
            status:           'pending_approval',
            remarks:          currentPR.value.remarks ?? '',
            total_amount:     companyCostTotal.value,
            supplier_id:      currentPR.value.supplier_id,
            created_by:       user.id,
        })
      handleError(txError, 'Failed to save purchase requisition.')
      toast.error('Failed to save Purchase Requisition. Please try again.')
      loading.value = false
      return { success: false }
    }

    // 2. Insert into products + collect product ids
    const productInserts = items.value.map(item => ({
      product_name:  item.item_description,
      unit:          item.unit,
      cost_price:    item.cost_per_unit,
      selling_price: item.offer_per_unit,
      current_stock: item.qty,
      supplier_id:   currentPR.value.supplier_id ? Number(currentPR.value.supplier_id) : null,
      status:        'active',
    }))

    const { data: productData, error: productError } = await supabase
      .from('products')
      .insert(productInserts)
      .select('id')

    if (productError || !productData) {
      handleError(productError, 'Failed to save products.')
      toast.error('Failed to save products. Please try again.')
      loading.value = false
      return { success: false }
    }

    // 3. Insert into transaction_items linking to products
    const transactionItems = items.value.map((item, index) => ({
      transaction_id: txData.id,
      product_id:     productData[index].id,
    }))

    const { error: itemsError } = await supabase
      .from('transaction_items')
      .insert(transactionItems)

    if (itemsError) {
      handleError(itemsError, 'Failed to save transaction items.')
      toast.error('Failed to save transaction items. Please try again.')
      loading.value = false
      return { success: false }
    }

    toast.success('Purchase Requisition saved successfully.')
    resetStore()
    loading.value = false
    return { success: true }
  }


  async function fetchPurchaseRequisition() {
    loading.value = true
    error.value   = ''

    const { data, error: fetchError } = await supabase
      .from('transactions')
      .select(`
        *,
        transaction_items (
          id,
          product_id,
          products (
            id,
            product_name,
            unit,
            cost_price,
            selling_price,
            current_stock
          )
        )
      `)
      .eq('transaction_type', 'purchase_requisition')
      .order('created_at', { ascending: false })

    if (fetchError) {
      toast.error('Failed to fetch Purchase Requisitions. Please try again.')
      loading.value = false
      return
    }

    prs.value = await Promise.all(
      (data || []).map(async (tx: any) => {
        const [requesterRes, reviewerRes] = await Promise.all([
          tx.created_by
            ? supabase.rpc('get_user_full_name', { user_id: tx.created_by })
            : Promise.resolve({ data: null }),
          tx.approved_by
            ? supabase.rpc('get_user_full_name', { user_id: tx.approved_by })
            : Promise.resolve({ data: null }),
        ])

        // Map transaction_items → PRItem shape
        const items: PRItem[] = (tx.transaction_items || []).map((ti: any, index: number) => ({
          id:               ti.id,
          no:               index + 1,
          unit:             ti.products?.unit             ?? '—',
          item_description: ti.products?.product_name    ?? '—',
          qty:              ti.products?.current_stock    ?? 0,
          offer_per_unit:   ti.products?.selling_price   ?? 0,
          cost_per_unit:    ti.products?.cost_price      ?? 0,
        }))

        return {
          id:             tx.id,
          reference_no:   tx.reference_no,
          status:         tx.status,
          remarks:        tx.remarks,
          total_amount:   tx.total_amount,
          supplier_id:    tx.supplier_id,
          created_at:     tx.created_at,
          created_by:     tx.created_by,
          approved_by:    tx.approved_by,
          updated_at:     tx.updated_at,
          requester_name: requesterRes.data?.toUpperCase() ?? '—',
          reviewer_name:  reviewerRes.data?.toUpperCase()  ?? '—',
          items,
        }
      })
    )

    loading.value = false
  }


  async function approvePR(prId: number) {
    loading.value = true

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('User not authenticated.')
      loading.value = false
      return
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        status:      'approved',
        approved_by: user.id,
        updated_at:  new Date().toISOString(),
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('User not authenticated.')
      loading.value = false
      return
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        status:      'rejected',
        approved_by: user.id,
        updated_at:  new Date().toISOString(),
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

  // ─── Realtime ─────────────────────────────────────────────────────
  function subscribeToPurchaseRequisitions() {
    subscriptionChannel.value = supabase
      .channel('transactions_pr_changes')
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'transactions',
        filter: 'transaction_type=eq.purchase_requisition',
      }, async () => {
        await fetchPurchaseRequisition()
      })
      .subscribe()
  }

  function unsubscribeFromPurchaseRequisitions() {
    if (subscriptionChannel.value) {
      supabase.removeChannel(subscriptionChannel.value)
      subscriptionChannel.value = null
    }
  }

  // ─── Expose ───────────────────────────────────────────────────────
  return {
    // State
    currentPR, items, loading, error,
    selectedPR, filterStatus, prs,
    // Computed
    customerOfferTotal, companyCostTotal,
    profit, isProfitable, offerCostRatio, marginPercent,
    filteredPRs,
    // Constants
    statusOptions,
    // Utilities
    totalQty, totalCost, itemSummary, statusConfig,
    // Actions
    generatePRNumber, savePurchaseRequisition, resetStore,
    fetchPurchaseRequisition, approvePR, rejectPR,
    // Realtime
    subscribeToPurchaseRequisitions,
    unsubscribeFromPurchaseRequisitions,
  }
})