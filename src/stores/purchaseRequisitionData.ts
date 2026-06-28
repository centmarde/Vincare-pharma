import type { RealtimeChannel } from '@supabase/supabase-js'
import { useAuthUserStore } from './authUser'
import { useToast } from 'vue-toastification'
import { supabase } from '@/lib/supabase'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Ref } from 'vue'

const toast = useToast()

// ─── Types ────────────────────────────────────────────────────────────────────

// export type TransactionType = {
//   id:               number
//   created_at:       string
//   requisition_no:   string
//   po_no:            string | null
//   transaction_type: string | null
//   status:           string | null
//   warehouse_id:     number | null
//   remarks:          string | null
//   total_amount:     number | null
//   created_by:       string | null
//   approved_by:      string | null
//   updated_at:       string | null
//   supplier_id:      number | null
//   ship_via:         string | null
//   ship_method:      string | null
// }

export type PRItem = {
  id:               number
  no:               number
  unit:             string
  item_description: string
  qty:              number
  offer_per_unit:   number
  cost_per_unit:    number
  product_id?:      number
  sku?:             string | null
  supplier_name?:   string | null
  actual_count?:    number | null   // ← add this
}

export type RequisitionItemType = {
  no:               number
  unit:             string
  item_description: string
  qty:              number
  offer_per_unit:   number
  cost_per_unit:    number
  supplier_id:      string | null
  actual_count?:    number
}

export type PR = {
  id:              number
  requisition_no:  string
  po_no:           string | null
  status:          string
  remarks:         string | null
  total_amount:    number
  supplier_id:     string | null
  supplier_name?:  string | null
  created_at:      string
  created_by:      string
  approved_by:     string | null
  updated_at:      string | null
  requester_name?: string
  reviewer_name?:  string
  actual_count?:   number | null
  items:           PRItem[]
}

export type PurchaseRequisitionType = {
  remarks:      string | null
  status:       string
  requested_by: string | null
  supplier_id:  string | null
}

// type FetchTransactionsOptions = {
//   po_no_not_null?:  boolean
//   search?:           string
//   transaction_type?: string | null
//   status?:           string | null
//   orderBy?:          keyof Pick<TransactionType, 'created_at' | 'total_amount' | 'status'>
//   ascending?:        boolean
//   limit?:            number
//   offset?:           number
// }

export const usePurchaseRequisitionStore = defineStore('purchaseRequisitionData', () => {
   const authStore = useAuthUserStore() 
   const loading:            Ref<boolean>                          = ref(false)
   const error:              Ref<string>                           = ref('')
  //  const transactions:       Ref<TransactionType[]>               = ref([])
   const prs:                Ref<PR[]>                            = ref([])
   const selectedPR:         Ref<PR | null>                       = ref(null)
   const filterStatus:       Ref<string | null>                   = ref(null)
   const items:              Ref<RequisitionItemType[]>           = ref([])
   const subscriptionChannel: Ref<any>                            = ref(null)
   const currentPR: Ref<PurchaseRequisitionType> = ref({
       remarks:      null,
       status:       'pending_approval',
       requested_by: null,
       supplier_id:  null,
    })
   const handleError = (err: unknown, message: string) => {
    error.value = err instanceof Error ? err.message : message
   }
   const clearError = () => { error.value = '' }

  // ─── Computed ─────────────────────────────────────────────────────
  // const transactionsCount    = computed(() => transactions.value.length)
//   const hasTransactions      = computed(() => transactions.value.length > 0)
  const isLoading            = computed(() => loading.value)
  const hasError             = computed(() => error.value !== '')    


  function resetStore() {
    currentPR.value = { remarks: null, status: 'pending_approval', requested_by: null, supplier_id: null }
    items.value     = []
    error.value     = ''
  }

  // ─── Reference Number Generators ──────────────────────────────────
  async function getLatestReferenceNo(column: 'requisition_no' | 'po_no' | 'reference_no', prefix: string): Promise<number> {
    const { data } = await supabase
      .from('transactions')
      .select(column)
      .ilike(column, `${prefix}%`)
      .order(column, { ascending: false })
      .limit(1)

    const row    = (data as Record<string, string>[] | null)?.[0]
    const latest = row ? row[column] : null
    return latest ? parseInt(latest.split('-')[2], 10) : 0
  }

  async function generatePRNumber(): Promise<string> {
    const year   = new Date().getFullYear()
    const prefix = `PR-${year}-`
    const last   = await getLatestReferenceNo('requisition_no', prefix)
    return `${prefix}${String(last + 1).padStart(3, '0')}`
  }

  async function generatePONumber(): Promise<string> {
    const year   = new Date().getFullYear()
    const prefix = `PO-${year}-`
    const last   = await getLatestReferenceNo('po_no', prefix)
    return `${prefix}${String(last + 1).padStart(3, '0')}`
  }

  async function generateSINumber(): Promise<string> {
    const year   = new Date().getFullYear()
    const prefix = `SI-${year}-`
    const last   = await getLatestReferenceNo('reference_no', prefix)
    return `${prefix}${String(last + 1).padStart(3, '0')}`
  }

  // ─── Shared PR item mapper ────────────────────────────────────────
  function mapTransactionItems(transactionItems: any[]): PRItem[] {
    return transactionItems.map((ti: any, index: number) => ({
      id:               ti.id,
      no:               index + 1,
      unit:             ti.products?.unit          ?? '—',
      item_description: ti.products?.product_name  ?? '—',
      qty:              ti.products?.current_stock  ?? 0,
      offer_per_unit:   ti.products?.selling_price  ?? 0,
      cost_per_unit:    ti.products?.cost_price     ?? 0,
      product_id:       ti.product_id,
      sku:              ti.products?.sku            ?? null,
      supplier_name:    ti.products?.suppliers?.name ?? '—',
      actual_count:     ti.products?.actual_count  ?? 0,
    }))
  }
  
  function resolveUserNames(createdBy: string | null, approvedBy: string | null) {
    const authStore = useAuthUserStore()
    const findName = (id: string | null) => 
      authStore.users.find(u => u.id === id)?.full_name?.toUpperCase() ?? '—'

    return{
      requester_name: findName(createdBy),
      reviewer_name:  findName(approvedBy),
    }
  }

  function mapToPR(tx: any, prItems: PRItem[], names: { requester_name: string; reviewer_name: string }): PR {
    return {
      id:             tx.id,
      requisition_no: tx.requisition_no,
      po_no:          tx.po_no,
      status:         tx.status,
      remarks:        tx.remarks,
      total_amount:   tx.total_amount,
      supplier_id:    tx.supplier_id,
      created_at:     tx.created_at,
      created_by:     tx.created_by,
      approved_by:    tx.approved_by,
      updated_at:     tx.updated_at,
      requester_name: names.requester_name,
      reviewer_name:  names.reviewer_name,
      actual_count:   tx.actual_count,
      items:          prItems,
    }
  }  

  // ─── PR Actions ───────────────────────────────────────────────────
  async function savePurchaseRequisition() {
    loading.value = true
    error.value   = ''

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const prNumber = await generatePRNumber()
    const companyCostTotal = items.value.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)

    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .insert({
        requisition_no:   prNumber,
        po_no:            null,
        transaction_type: 'purchase_requisition',
        status:           'pending_approval',
        remarks:          currentPR.value.remarks ?? '',
        total_amount:     companyCostTotal,
        supplier_id:      null,
        created_by:   user.id,
      })
      .select('id, requisition_no')
      .single()

    if (txError || !txData) {
      handleError(txError, 'Failed to save purchase requisition.')
      toast.error('Failed to save Purchase Requisition. Please try again.')
      loading.value = false
      return { success: false }
    }

    const productInserts = items.value.map(item => ({
      product_name:  item.item_description,
      unit:          item.unit,
      cost_price:    item.cost_per_unit,
      selling_price: item.offer_per_unit,
      current_stock: item.qty,
      supplier_id:   item.supplier_id ? Number(item.supplier_id) : null,
      status:        'active',
    }))

    const { data: productData, error: productError } = await supabase
      .from('products').insert(productInserts).select('id')

    if (productError || !productData) {
      handleError(productError, 'Failed to save products.')
      toast.error('Failed to save products. Please try again.')
      loading.value = false
      return { success: false }
    }

    const { error: itemsError } = await supabase
      .from('transaction_items')
      .insert(items.value.map((_, index) => ({
        transaction_id: txData.id,
        product_id:     productData[index].id,
      })))

    if (itemsError) {
      handleError(itemsError, 'Failed to save transaction items.')
      toast.error('Failed to save transaction items. Please try again.')
      loading.value = false
      return { success: false }
    }

    toast.success('Purchase Requisition saved successfully.')
    resetStore()
    loading.value = false
    return {
      success: true,
      transactionId: txData.id,
      requisitionNo: prNumber,
    }
  }

  // ─── Fetch PRs ─────────────────────────────────────────────────────
  async function fetchPurchaseRequisition() {
      loading.value = true
      error.value   = ''
  
      if (!authStore.users.length) await authStore.getAllUsers()
  
      const { data, error: fetchError } = await supabase
        .from('transactions')
        .select(`
          *,
          transaction_items (
            id, product_id,
            products ( id, product_name, unit, cost_price, selling_price, current_stock, sku, supplier_id, actual_count, suppliers ( name ) )
          )
        `)
        .not('requisition_no', 'is', null)   // ← replaces .eq('transaction_type', 'purchase_requisition')
        .order('created_at', { ascending: false })
  
      if (fetchError) {
        toast.error('Failed to fetch Purchase Requisitions. Please try again.')
        loading.value = false
        return
      }
  
      prs.value =  (data || []).map((tx: any) => {
        const names = resolveUserNames(tx.created_by, tx.approved_by)
        return mapToPR(tx, mapTransactionItems(tx.transaction_items || []), names)
      })
  
      loading.value = false
  }

  async function approvePR(prId: number) {
        loading.value = true
    
        const { user, error: authError } = await authStore.getCurrentUser()
        if (authError || !user) {
          toast.error('User not authenticated.')
          loading.value = false
          return { success: false }
        }
    
        const { error: updateError } = await supabase
          .from('transactions')
          .update({ status: 'approved', approved_by: user.id, updated_at: new Date().toISOString() })
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

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'rejected', approved_by: user.id, updated_at: new Date().toISOString() })
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

  async function fetchPRByRequisitionId(requisitionId: number): Promise<PR | null> {
    
    if (!authStore.users.length) await authStore.getAllUsers()

    const { data } = await supabase
      .from('transactions')
      .select(`
        *,
        transaction_items (
          id, product_id,
          products ( id, product_name, unit, cost_price, selling_price, current_stock, sku, supplier_id, actual_count, suppliers ( name ) )
        )
      `)
      .eq('id', requisitionId)
      .single()

    if (!data) return null

    const names = resolveUserNames(data.created_by, data.approved_by)  // ← sync now
    return mapToPR(data, mapTransactionItems(data.transaction_items || []), names)
  }

  // ─── PO Actions ───────────────────────────────────────────────────
  async function issuePurchaseOrder(payload: {
    pr:          PR
    ship_via:    string
    ship_method: string
  }) {
    loading.value = true
    clearError()

    const poNumber = await generatePONumber()

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        transaction_type: 'purchase_order',
        status:           'issued',
        po_no:            poNumber,
        ship_via:         payload.ship_via,
        ship_method:      payload.ship_method,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', payload.pr.id)

    loading.value = false

    if (updateError) {
      handleError(updateError, 'Failed to issue purchase order.')
      toast.error('Failed to issue purchase order.')
      return { success: false }
    }

    toast.success('Purchase order issued successfully!')
    return { success: true }
  }

  async function markPOAsReceived(poId: number): Promise<boolean> {
    loading.value = true

    const siNumber = await generateSINumber()

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ reference_no: siNumber, transaction_type: 'stock_in', status: 'complete', updated_at: new Date().toISOString() })
      .eq('id', poId)

    loading.value = false

    if (updateError) {
      handleError(updateError, 'Failed to mark as received.')
      toast.error('Failed to mark purchase order as received.')
      return false
    }

    toast.success('Purchase order marked as received.')
    return true
  }  


  function subscribeToPurchaseRequisitions() {
    subscriptionChannel.value = supabase
      .channel('transactions_pr_changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'transactions',
        filter: 'transaction_type=eq.purchase_requisition',
      }, async () => { await fetchPurchaseRequisition() })
      .subscribe()
  }

  function unsubscribeFromPurchaseRequisitions() {
    if (subscriptionChannel.value) {
      supabase.removeChannel(subscriptionChannel.value)
      subscriptionChannel.value = null
    }
  }

  return {

    // Generic state
    // transactions, 
    loading, error,

    // Generic computed
    // transactionsCount,
    isLoading, hasError,

    // PR state
    prs, selectedPR, filterStatus, items, currentPR,
    
    // PR actions
    savePurchaseRequisition, resetStore,
    fetchPurchaseRequisition, approvePR, rejectPR,

    // PO actions
    issuePurchaseOrder, fetchPRByRequisitionId, markPOAsReceived,

    // Realtime
    subscribeToPurchaseRequisitions, unsubscribeFromPurchaseRequisitions,
  }
})