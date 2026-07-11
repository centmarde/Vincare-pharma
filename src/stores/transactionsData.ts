import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Ref } from 'vue'

// ─── Types ────────────────────────────────────────────────────────────────────

export const TRANSACTION_CLASSES = [
  'purchase_requisition',
  'purchase_order',
  'stock_in',
  'stock_out',
  'sale',
  'transfer',
  'expense',
  'purchase_return',
  'sales_return',
] as const

export type TransactionClass = typeof TRANSACTION_CLASSES[number]

export type TransactionType = {
  id:                  number
  created_at:          string
  reference_no:        string | null
  reorder_no:          string | null
  transaction_type:    TransactionClass | null
  status:              string | null
  warehouse_id:        number | null
  remarks:             string | null
  total_amount:        number | null
  created_by:          string | null
  approved_by:         string | null
  updated_at:          string | null
  supplier_id:         number | null
  ship_via:            string | null
  ship_method:         string | null
  requisition_no:      string | null
  po_no:               string | null
  remittance_id:       number | null
  customer_id:         number | null
  agent_id:            number | null
  sale_no:             string | null
  transfer_no:         string | null
  expense_no:          string | null
  purchase_return_no:  string | null
  sales_return_no:     string | null
  outlet:              string | null
  received_by:         string | null
  approved_at:         string | null
  received_at:         string | null
  payment_method:      string | null
  actual_amount:       number | null
  amount_paid:         number | null
  paid_at:             string | null
  liquidation_report:  Record<string, unknown> | null
  outlet_id:           number | null
  subtotal:            number | null
  cash_account_id:     number | null
  funding_account_id:  number | null
}

export type CreateTransactionData = Partial<Omit<TransactionType, 'id' | 'created_at'>>
export type UpdateTransactionData = Partial<CreateTransactionData>

export type FetchTransactionsOptions = {
  po_no_not_null?:   boolean
  requisition_no_not_null?:  boolean
  search?:           string
  transaction_type?: string | null
  status?:           string | string[] | null
  orderBy?:          keyof Pick<TransactionType, 'created_at' | 'total_amount' | 'status'>
  ascending?:        boolean
  limit?:            number
  offset?:           number
}

export type TransactionItemJoined = {
  id:                    number
  product_id:            number
  qty_stock_in:          number
  actual_count_stock_in: number | null
  product_name:          string | null
  unit:                  string | null
  cost_price:            number | null
  selling_price:         number | null
  sku:                   string | null
  supplier_id:           number | null
  supplier_name:         string | null
}

export type TransactionRPCRow = TransactionType & {
  items:       TransactionItemJoined[]
  total_count: number
}


// ─── Store ────────────────────────────────────────────────────────────────────

export const useTransactionsDataStore = defineStore('transactionsData', () => {

  // ─── State ──────────────────────────────────────────────────────
  const loading:            Ref<boolean>                                          = ref(false)
  const error:              Ref<string>                                           = ref('')
  const transactions:       Ref<TransactionType[]>                               = ref([])
  const currentTransaction: Ref<TransactionType | undefined>                     = ref(undefined)
  const realtimeChannel:    Ref<RealtimeChannel | null>                          = ref(null)
  const realtimeStatus:     Ref<'idle'|'subscribing'|'subscribed'|'error'>       = ref('idle')

  // ─── Computed ───────────────────────────────────────────────────
  const transactionsCount    = computed(() => transactions.value.length)
  const hasTransactions      = computed(() => transactions.value.length > 0)
  const isLoading            = computed(() => loading.value)
  const hasError             = computed(() => error.value !== '')
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')

  // ─── Helpers ────────────────────────────────────────────────────
  const handleError = (err: unknown, message: string) => {
    error.value = err instanceof Error ? err.message : message
  }
  const clearError = () => { error.value = '' }

  // ─── Local cache helpers ─────────────────────────────────────────
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


  // ─── Generic CRUD ───────────────────────────────────────────────
  const fetchTransactions = async (options: FetchTransactionsOptions = {}) => {
    loading.value = true
    clearError()

    const {
      search, transaction_type, status, po_no_not_null, requisition_no_not_null,
      orderBy = 'created_at', ascending = false, limit, offset,
    } = options

    let q = supabase.from('transactions').select('*')

    if (transaction_type)  q = q.eq('transaction_type', transaction_type)
    if (status) {
      if (Array.isArray(status)) q = q.in('status', status)
      else                       q = q.eq('status', status)
    }
    // Same transaction_type guard as fetchTransactionsCount below — po_no is
    // overloaded (In-House also writes PO-YYYY-### into it), so filtering on
    // the prefix alone leaks inhouse_order rows in as fake POs.
    if (po_no_not_null) {
      // PO number lives in reference_no while issued (pre-receipt), and moves to
      // po_no once received — OR both to cover the full PO lifecycle. Still
      // scoped to purchase_order/stock_in so In-House's reuse of po_no doesn't leak in.
      q = q.or('reference_no.ilike.PO%,po_no.ilike.PO%').in('transaction_type', ['purchase_order', 'stock_in'])
    }
    if (requisition_no_not_null) {
      // Same idea: PR number lives in reference_no until issued, then archives
      // into requisition_no for the rest of the lifecycle.
      q = q.or('reference_no.ilike.PR%,requisition_no.ilike.PR%')
    }
    if (search?.trim()) {
      const s = search.trim().replace(/,/g, '')
      q = q.or(`requisition_no.ilike.%${s}%,po_no.ilike.%${s}%,remarks.ilike.%${s}%,status.ilike.%${s}%`)
    }

    q = q.order(orderBy as string, { ascending })

    if (typeof limit === 'number' && typeof offset === 'number') {
      q = q.range(offset, offset + limit - 1)
    } else if (typeof limit === 'number') {
      q = q.limit(limit)
    }

    const { data, error: fetchError } = await q
    loading.value = false

    if (fetchError) {
      handleError(fetchError, 'Failed to fetch transactions')
      return []
    }

    transactions.value = (data || []) as TransactionType[]
    return transactions.value
  }

  async function fetchTransactionsCount(options: FetchTransactionsOptions = {}): Promise<number> {
    const { po_no_not_null, requisition_no_not_null, status, search } = options

    let q = supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })

    // Same transaction_type guard as fetchTransactions — see note there.
    if (po_no_not_null)          q = q.ilike('po_no', 'PO%').in('transaction_type', ['purchase_order', 'stock_in'])
    if (requisition_no_not_null) q = q.ilike('requisition_no', 'PR%')
    if (status) {
      if (Array.isArray(status)) q = q.in('status', status)
      else                       q = q.eq('status', status)
    }
    if (search?.trim()) {
      const s = search.trim().replace(/,/g, '')
      q = q.or(`requisition_no.ilike.%${s}%,po_no.ilike.%${s}%,remarks.ilike.%${s}%,status.ilike.%${s}%`)
    }

    const { count } = await q
    return count ?? 0
  }

  const fetchTransactionById = async (id: number) => {
    loading.value = true
    clearError()

    const { data, error: fetchError } = await supabase
      .from('transactions').select('*').eq('id', id).single()

    loading.value = false

    if (fetchError) {
      handleError(fetchError, `Failed to fetch transaction with ID ${id}`)
      return undefined
    }

    currentTransaction.value = data as TransactionType
    return currentTransaction.value
  }

  function normalizeStatus(status: FetchTransactionsOptions['status']): string[] | null {
    if (!status) return null
    return Array.isArray(status) ? status : [status]
  }

  async function fetchPurchaseRequisitionsRPC(options: FetchTransactionsOptions = {}) {
    loading.value = true
    clearError()

    const { data, error: rpcError } = await supabase.rpc('new_fetch_purchase_requisitions', {
      p_search:    options.search?.trim() || null,
      p_status:    normalizeStatus(options.status),
      p_order_by:  options.orderBy ?? 'created_at',
      p_ascending: options.ascending ?? false,
      p_limit:     options.limit ?? 10,
      p_offset:    options.offset ?? 0,
    })

    loading.value = false

    if (rpcError) {
      handleError(rpcError, 'Failed to fetch purchase requisitions')
      return { rows: [] as TransactionRPCRow[], totalCount: 0 }
    }

    const rows = (data || []) as TransactionRPCRow[]
    return { rows, totalCount: rows[0]?.total_count ?? 0 }
  }

  async function fetchPurchaseOrdersRPC(options: FetchTransactionsOptions = {}) {
    loading.value = true
    clearError()

    const { data, error: rpcError } = await supabase.rpc('new_fetch_purchase_orders', {
      p_search:    options.search?.trim() || null,
      p_status:    normalizeStatus(options.status),
      p_order_by:  options.orderBy ?? 'created_at',
      p_ascending: options.ascending ?? false,
      p_limit:     options.limit ?? 10,
      p_offset:    options.offset ?? 0,
    })

    loading.value = false

    if (rpcError) {
      handleError(rpcError, 'Failed to fetch purchase orders')
      return { rows: [] as TransactionRPCRow[], totalCount: 0 }
    }

    const rows = (data || []) as TransactionRPCRow[]
    return { rows, totalCount: rows[0]?.total_count ?? 0 }
  }

  const createTransaction = async (transactionData: CreateTransactionData) => {
    loading.value = true
    clearError()

    const { data, error: createError } = await supabase
      .from('transactions').insert([transactionData]).select('*').single()

    loading.value = false

    if (createError) {
      handleError(createError, 'Failed to create transaction')
      return undefined
    }

    const created = data as TransactionType
    upsertTransactionLocal(created)
    currentTransaction.value = created
    return created
  }

  const updateTransaction = async (id: number, updateData: UpdateTransactionData) => {
    loading.value = true
    clearError()

    const { data, error: updateError } = await supabase
      .from('transactions').update(updateData).eq('id', id).select('*').single()

    loading.value = false

    if (updateError) {
      handleError(updateError, `Failed to update transaction with ID ${id}`)
      return undefined
    }

    const updated = data as TransactionType
    upsertTransactionLocal(updated)
    return updated
  }

  const deleteTransaction = async (id: number) => {
    loading.value = true
    clearError()

    const { error: deleteError } = await supabase.from('transactions').delete().eq('id', id)

    loading.value = false

    if (deleteError) {
      handleError(deleteError, `Failed to delete transaction with ID ${id}`)
      return false
    }

    removeTransactionLocal(id)
    return true
  }

  // ─── Realtime ───────────────────────────────────────────────────
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
        if (status === 'SUBSCRIBED')                                   realtimeStatus.value = 'subscribed'
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') realtimeStatus.value = 'error'
      })

    realtimeChannel.value = channel
    return channel
  }

  const stopRealtime = async () => {
    const channel = realtimeChannel.value
    if (!channel) return
    realtimeChannel.value = null
    realtimeStatus.value  = 'idle'
    await supabase.removeChannel(channel)
  }

  // ─── Expose ─────────────────────────────────────────────────────
  return {
    // State
    transactions, currentTransaction, loading, error,

    // Computed
    transactionsCount, hasTransactions, isLoading, hasError, isRealtimeSubscribed,

    // Helpers (exposed for cross-store use)
    clearError, handleError,
    upsertTransactionLocal, removeTransactionLocal,

    // CRUD
    fetchTransactions, fetchTransactionsCount,
    fetchPurchaseRequisitionsRPC, fetchPurchaseOrdersRPC,
    fetchTransactionById, createTransaction,
    updateTransaction, deleteTransaction,

    // Realtime
    startRealtime, stopRealtime,
  }
})
