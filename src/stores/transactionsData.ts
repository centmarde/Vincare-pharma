import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Ref } from 'vue'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransactionType = {
  id:               number
  created_at:       string
  requisition_no:   string
  po_no:            string | null
  transaction_type: string | null
  status:           string | null
  warehouse_id:     number | null
  remarks:          string | null
  total_amount:     number | null
  created_by:       string | null
  approved_by:      string | null
  updated_at:       string | null
  supplier_id:      number | null
  ship_via:         string | null
  ship_method:      string | null
}

export type CreateTransactionData = Partial<Omit<TransactionType, 'id' | 'created_at'>>
export type UpdateTransactionData = Partial<CreateTransactionData>

export type FetchTransactionsOptions = {
  po_no_not_null?:   boolean
  search?:           string
  transaction_type?: string | null
  status?:           string | null
  orderBy?:          keyof Pick<TransactionType, 'created_at' | 'total_amount' | 'status'>
  ascending?:        boolean
  limit?:            number
  offset?:           number
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
      search, transaction_type, status, po_no_not_null,
      orderBy = 'created_at', ascending = false, limit, offset,
    } = options

    let q = supabase.from('transactions').select('*')

    if (transaction_type) q = q.eq('transaction_type', transaction_type)
    if (status)           q = q.eq('status', status)
    if (po_no_not_null)   q = q.not('po_no', 'is', null)
    if (search?.trim()) {
      const s = search.trim().replace(/,/g, '')
      q = q.or(`requisition_no.ilike.%${s}%,remarks.ilike.%${s}%,status.ilike.%${s}%`)
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
    const { po_no_not_null, status, search } = options

    let q = supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })

    if (po_no_not_null) q = q.not('po_no', 'is', null)
    if (status)         q = q.eq('status', status)
    if (search?.trim()) {
      const s = search.trim().replace(/,/g, '')
      q = q.or(`requisition_no.ilike.%${s}%,remarks.ilike.%${s}%,status.ilike.%${s}%`)
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
    fetchTransactionById, createTransaction,
    updateTransaction, deleteTransaction,

    // Realtime
    startRealtime, stopRealtime,
  }
})