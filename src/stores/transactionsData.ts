import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { generateReferenceNumber } from '@/utils/helpers'


const toast = useToast()

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransactionType = {
  id:               number
  created_at:       string
  reference_no:     string | null
  transaction_type: string | null
  status:           string | null
  warehouse_id:     number | null
  remarks:          string | null
  total_amount:     number | null
  created_by:       string | null
  approved_by:      string | null
  updated_at:       string | null
  supplier_id:      number | null
}

export type CreateTransactionData = {
  reference_no?: string | null
  transaction_type?: string | null
  status?: string | null
  warehouse_id?: number | null
  remarks?: string | null
  total_amount?: number | null
  created_by?: string | null
  approved_by?: string | null
  updated_at?: string | null
  supplier_id?: number | null
}

export type UpdateTransactionData = Partial<CreateTransactionData>

type FetchTransactionsOptions = {
  search?:           string
  transaction_type?: string | null
  status?:           string | null
  orderBy?:          keyof Pick<TransactionType, 'created_at' | 'reference_no' | 'total_amount' | 'status'>
  ascending?:        boolean
  limit?:            number
  offset?:           number
}
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
}

export type RequisitionItemType = {
  no:               number
  unit:             string
  item_description: string
  qty:              number
  offer_per_unit:   number
  cost_per_unit:    number
}

export type PR = {
  id:             number
  reference_no:   string
  status:         string
  remarks:        string | null
  total_amount:   number
  supplier_id:    string | null
  created_at:     string
  created_by:     string
  approved_by:    string | null
  updated_at:     string | null
  requester_name?: string
  reviewer_name?:  string
  items:           PRItem[]
}

export type PurchaseRequisitionType = {
  remarks:      string | null
  status:       string
  requested_by: string | null
  supplier_id:  string | null
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTransactionsDataStore = defineStore('transactionsData', () => {

  // ─── State ────────────────────────────────────────────────────────
  const loading            = ref(false)
  const error: Ref<string> = ref('')

  // Transactions (generic)
  const transactions: Ref<TransactionType[]> = ref([])
  const currentTransaction: Ref<TransactionType | undefined> = ref(undefined)

  // Purchase Requisition
  const prs: Ref<PR[]> = ref([])
  const selectedPR: Ref<PR | null> = ref(null)
  const filterStatus: Ref<string | null> = ref(null)
  const items: Ref<RequisitionItemType[]> = ref([])
  const currentPR: Ref<PurchaseRequisitionType> = ref({
    remarks:      null,
    status:       'pending_approval',
    requested_by: null,
    supplier_id:  null,
  })

  // Realtime
  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')
  const subscriptionChannel: Ref<any> = ref(null)

  // ─── Computed ─────────────────────────────────────────────────────

  // Generic transactions
  const transactionsCount      = computed(() => transactions.value.length)
  const hasTransactions        = computed(() => transactions.value.length > 0)
  const isLoading              = computed(() => loading.value)
  const hasError               = computed(() => error.value !== '')
  const isRealtimeSubscribed   = computed(() => realtimeStatus.value === 'subscribed')

  // PR form totals
  const customerOfferTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.offer_per_unit, 0)
  )
  const companyCostTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)
  )
  const profit         = computed(() => customerOfferTotal.value - companyCostTotal.value)
  const isProfitable   = computed(() => profit.value > 0)
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

  const clearError = () => { error.value = '' }

  function resetStore() {
    currentPR.value = { remarks: null, status: 'pending_approval', requested_by: null, supplier_id: null }
    items.value = []
    error.value = ''
  }

  // ─── Local helpers ────────────────────────────────────────────────
  const upsertTransactionLocal = (tx: TransactionType) => {
    const idx = transactions.value.findIndex(t => t.id === tx.id)
    if (idx === -1) transactions.value.unshift(tx)
    else transactions.value[idx] = tx
    if (currentTransaction.value?.id === tx.id) currentTransaction.value = tx
  }

  const removeTransactionLocal = (id: number) => {
    transactions.value = transactions.value.filter(t => t.id !== id)
    if (currentTransaction.value?.id === id) currentTransaction.value = undefined
  }

  // ─── Generic Transaction Actions ──────────────────────────────────
  const fetchTransactions = async (options: FetchTransactionsOptions = {}) => {
    loading.value = true
    clearError()
    try {
      const { search, transaction_type, status, orderBy = 'created_at', ascending = false, limit, offset } = options

      let q = supabase.from('transactions').select('*')

      if (transaction_type) q = q.eq('transaction_type', transaction_type)
      if (status)           q = q.eq('status', status)
      if (search?.trim()) {
        const s = search.trim().replace(/,/g, '')
        q = q.or(`reference_no.ilike.%${s}%,remarks.ilike.%${s}%,status.ilike.%${s}%`)
      }

      q = q.order(orderBy as string, { ascending })

      if (typeof limit === 'number' && typeof offset === 'number') {
        q = q.range(offset, offset + limit - 1)
      } else if (typeof limit === 'number') {
        q = q.limit(limit)
      }

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      transactions.value = (data || []) as TransactionType[]
      return transactions.value
    } catch (err) {
      handleError(err, 'Failed to fetch transactions')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchTransactionById = async (id: number) => {
    loading.value = true
    clearError()
    try {
      const { data, error: fetchError } = await supabase
        .from('transactions').select('*').eq('id', id).single()
      if (fetchError) throw fetchError
      currentTransaction.value = data as TransactionType
      return currentTransaction.value
    } catch (err) {
      handleError(err, `Failed to fetch transaction with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const createTransaction = async (transactionData: CreateTransactionData) => {
    loading.value = true
    clearError()
    try {
      const { data, error: createError } = await supabase
        .from('transactions').insert([transactionData]).select('*').single()
      if (createError) throw createError
      const created = data as TransactionType
      transactions.value.unshift(created)
      currentTransaction.value = created
      return created
    } catch (err) {
      handleError(err, 'Failed to create transaction')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const updateTransaction = async (id: number, updateData: UpdateTransactionData) => {
    loading.value = true
    clearError()
    try {
      const { data, error: updateError } = await supabase
        .from('transactions').update(updateData).eq('id', id).select('*').single()
      if (updateError) throw updateError
      const updated = data as TransactionType
      const index = transactions.value.findIndex(t => t.id === id)
      if (index !== -1) transactions.value[index] = updated
      if (currentTransaction.value?.id === id) currentTransaction.value = updated
      return updated
    } catch (err) {
      handleError(err, `Failed to update transaction with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const deleteTransaction = async (id: number) => {
    loading.value = true
    clearError()
    try {
      const { error: deleteError } = await supabase.from('transactions').delete().eq('id', id)
      if (deleteError) throw deleteError
      removeTransactionLocal(id)
      return true
    } catch (err) {
      handleError(err, `Failed to delete transaction with ID ${id}`)
      return false
    } finally {
      loading.value = false
    }
  }

  // ─── PR Number Generator ──────────────────────────────────────────
  async function generatePRNumber(): Promise<string> {
    const year   = new Date().getFullYear()
    const prefix = `PR-${year}-`

    const { data } = await supabase
      .from('transactions')
      .select('reference_no')
      .ilike('reference_no', `${prefix}%`)
      .order('reference_no', { ascending: false })
      .limit(1)

    const latest  = data?.[0]?.reference_no
    const lastNum = latest ? parseInt(latest.split('-')[2], 10) : 0
    return `${prefix}${String(lastNum + 1).padStart(3, '0')}`
  }

  // ─── PR Actions ───────────────────────────────────────────────────
  async function savePurchaseRequisition() {
    loading.value = true
    error.value   = ''

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const reference_no = await generateReferenceNumber('PR')

    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .insert({
        reference_no,
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
      supplier_id:   currentPR.value.supplier_id ? Number(currentPR.value.supplier_id) : null,
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
          id, product_id,
          products ( id, product_name, unit, cost_price, selling_price, current_stock )
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
          tx.created_by  ? supabase.rpc('get_user_full_name', { user_id: tx.created_by })  : Promise.resolve({ data: null }),
          tx.approved_by ? supabase.rpc('get_user_full_name', { user_id: tx.approved_by }) : Promise.resolve({ data: null }),
        ])

        const prItems: PRItem[] = (tx.transaction_items || []).map((ti: any, index: number) => ({
          id:               ti.id,
          no:               index + 1,
          unit:             ti.products?.unit          ?? '—',
          item_description: ti.products?.product_name  ?? '—',
          qty:              ti.products?.current_stock  ?? 0,
          offer_per_unit:   ti.products?.selling_price  ?? 0,
          cost_per_unit:    ti.products?.cost_price     ?? 0,
          product_id:       ti.product_id,
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
          items:          prItems,
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('User not authenticated.')
      loading.value = false
      return
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

  async function issuePurchaseOrder(payload: {
    pr:          PR
    ship_via:    string
    ship_method: string
    userId:      string
    }) {
    loading.value = true
    clearError()

    try {
        const poNumber = await generateReferenceNumber('PO')

        const { error: createError } = await supabase
        .from('transactions')
        .insert({
            reference_no:     poNumber,
            transaction_type: 'purchase_order',
            status:           'issued',
            supplier_id:      payload.pr.supplier_id,
            total_amount:     payload.pr.items.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0),
            remarks:          payload.pr.remarks ?? '',
            created_by:       payload.userId,
            ship_via:         payload.ship_via,
            ship_method:      payload.ship_method,
            requisition_id:   payload.pr.id,
        })

        if (createError) throw createError

        toast.success('Purchase order issued successfully!')
        return { success: true }

    } catch (err) {
        handleError(err, 'Failed to issue purchase order.')
        toast.error('Failed to issue purchase order.')
        return { success: false }
    } finally {
        loading.value = false
    }
  }

  async function fetchPRByRequisitionId(requisitionId: number): Promise<PR | null> {
    const { data } = await supabase
      .from('transactions')
      .select(`
        *,
        transaction_items (
          id, product_id,
          products ( id, product_name, unit, cost_price, selling_price, current_stock )
        )
      `)
      .eq('transaction_type', 'purchase_requisition')
      .eq('id', requisitionId)
      .single()

      if (!data) return null

      const [requesterRes, reviewerRes] = await Promise.all([
            data.created_by
            ? supabase.rpc('get_user_full_name', { user_id: data.created_by })
            : Promise.resolve({ data: null }),
            data.approved_by
            ? supabase.rpc('get_user_full_name', { user_id: data.approved_by })
            : Promise.resolve({ data: null }),
        ])
      const prItems: PRItem[] = (data.transaction_items || []).map((ti: any, index: number) => ({
            id:               ti.id,
            no:               index + 1,
            unit:             ti.products?.unit          ?? '—',
            item_description: ti.products?.product_name  ?? '—',
            qty:              ti.products?.current_stock  ?? 0,
            offer_per_unit:   ti.products?.selling_price  ?? 0,
            cost_per_unit:    ti.products?.cost_price     ?? 0,
            product_id:       ti.product_id,
            sku:              ti.products?.sku ?? null,
        }))  
      return {
            id:             data.id,
            reference_no:   data.reference_no,
            status:         data.status,
            remarks:        data.remarks,
            total_amount:   data.total_amount,
            supplier_id:    data.supplier_id,
            created_at:     data.created_at,
            created_by:     data.created_by,
            approved_by:    data.approved_by,
            updated_at:     data.updated_at,
            requester_name: requesterRes.data?.toUpperCase() ?? '—',
            reviewer_name:  reviewerRes.data?.toUpperCase()  ?? '—',
            items:          prItems,
        }  
  }

  async function markPOAsReceived(poId: number) {
    loading.value = true
    try {
      // ── 1. Fetch the PO ───────────────────────────────────────────
      const { data: poData, error: poFetchError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', poId)
        .single()

      if (poFetchError || !poData) throw poFetchError ?? new Error('PO not found')

      // ── 2. Fetch the PR's transaction_items using requisition_id ──
      // CHANGED: was .eq('transaction_id', poId) — PO has no items linked
      // NOW: reads from the PR's items via poData.requisition_id instead
      const { data: prItems, error: prItemsError } = await supabase
        .from('transaction_items')
        .select('product_id')
        .eq('transaction_id', poData.requisition_id)

      if (prItemsError) throw prItemsError

      // ── 3. Mark the PO as complete ────────────────────────────────
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ status: 'complete', updated_at: new Date().toISOString() })
        .eq('id', poId)

      if (updateError) throw updateError

      // ── 4. Insert the stock_in transaction ────────────────────────
      const stockInReference = await generateReferenceNumber('SI')

      const { data: stockInData, error: stockInError } = await supabase
        .from('transactions')
        .insert({
          reference_no:     stockInReference,
          transaction_type: 'stock_in',
          status:           'complete',
          supplier_id:      poData.supplier_id,
          total_amount:     poData.total_amount,
          remarks:          poData.remarks ?? '',
          created_by:       poData.created_by,
          warehouse_id:     poData.warehouse_id ?? null,
          requisition_id:   poData.requisition_id, // ← PR id inherited from PO
        })
        .select('id')
        .single()

      if (stockInError || !stockInData) throw stockInError ?? new Error('Failed to retrieve stock_in id')

      // ── 5. Insert transaction_items linked to stock_in ────────────
      // CHANGED: was using poItems (PO's items) — PO has no items
      // NOW: uses prItems (PR's items) mapped to the new stock_in id
      if (prItems && prItems.length > 0) {
        const stockInItems = prItems.map(item => ({
          transaction_id: stockInData.id, // ← stock_in transaction id (e.g. SI-2026-005)
          product_id:     item.product_id, // ← same product_ids from the PR
        }))

        const { error: itemsError } = await supabase
          .from('transaction_items')
          .insert(stockInItems)

        if (itemsError) throw itemsError
      }

      toast.success('Purchase order marked as received')
      return true

    } catch (err) {
      handleError(err, 'Failed to mark as received.')
      toast.error('Failed to mark purchase order as received.')
      return false
    } finally {
      loading.value = false
    }
  }

  // ─── Realtime ─────────────────────────────────────────────────────
  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value
    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel('transactions-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          upsertTransactionLocal(payload.new as TransactionType)
        }
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as Partial<TransactionType>)?.id
          if (typeof id === 'number') removeTransactionLocal(id)
        }
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') realtimeStatus.value = 'subscribed'
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') realtimeStatus.value = 'error'
      })

    realtimeChannel.value = channel
    return channel
  }

  const stopRealtime = async () => {
    if (!realtimeChannel.value) return
    realtimeChannel.value = null
    realtimeStatus.value  = 'idle'
    await supabase.removeChannel(realtimeChannel.value!)
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

  // ─── Expose ───────────────────────────────────────────────────────
  return {
    // Generic transaction state
    transactions, currentTransaction,
    loading, error,

    // Generic transaction computed
    transactionsCount, hasTransactions,
    isLoading, hasError, isRealtimeSubscribed,

    // Generic transaction actions
    fetchTransactions, fetchTransactionById,
    createTransaction, updateTransaction, deleteTransaction,
    clearError, upsertTransactionLocal, removeTransactionLocal,

    // PR state
    prs, selectedPR, filterStatus, items, currentPR,

    // PR computed
    customerOfferTotal, companyCostTotal,
    profit, isProfitable, offerCostRatio, marginPercent,
    filteredPRs,

    // PR constants
    statusOptions,

    // PR utilities
    totalQty, totalCost, itemSummary, statusConfig,

    // PR actions
    generatePRNumber, savePurchaseRequisition, resetStore,
    fetchPurchaseRequisition, approvePR, rejectPR,

    // Realtime
    startRealtime, stopRealtime,
    subscribeToPurchaseRequisitions, unsubscribeFromPurchaseRequisitions, issuePurchaseOrder,
    fetchPRByRequisitionId,
    markPOAsReceived,
  }
})