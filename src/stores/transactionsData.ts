import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Matches `public.transactions` schema (with FK joins)
export type TransactionType = {
  id: number
  created_at: string
  reference_no: string | null
  transaction_type: string | null
  status: string | null
  warehouse_id: number | null
  remarks: string | null
  total_amount: number | null
  created_by: string | null
  approved_by: string | null
  updated_at: string | null
  supplier_id: string | null
  // Joined FK data
  created_by_user?: { id: string; email?: string } | null
  approved_by_user?: { id: string; email?: string } | null
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
  supplier_id?: string | null
}

export type UpdateTransactionData = Partial<CreateTransactionData>

type FetchTransactionsOptions = {
  search?: string
  transaction_type?: string | null
  status?: string | null
  orderBy?: keyof Pick<TransactionType, 'created_at' | 'reference_no' | 'total_amount' | 'status'>
  ascending?: boolean
  limit?: number
  offset?: number
}

export const useTransactionsDataStore = defineStore('transactionsData', () => {
  // State
  const transactions: Ref<TransactionType[]> = ref([])
  const currentTransaction: Ref<TransactionType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // Realtime
  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // Computed
  const transactionsCount = computed(() => transactions.value.length)
  const hasTransactions = computed(() => transactions.value.length > 0)
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')

  // Helpers
  const handleError = (err: unknown, defaultMessage: string) => {
    const errorMessage = err instanceof Error ? err.message : defaultMessage
    error.value = errorMessage
  }

  const clearError = () => {
    error.value = ''
  }

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value

    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel('transactions-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
        console.log('Transaction change received!', payload)

        const eventType = payload.eventType

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          const row = payload.new as TransactionType
          if (row?.id != null) upsertTransactionLocal(row)
        }

        if (eventType === 'DELETE') {
          const row = payload.old as Partial<TransactionType> | null
          const id = row?.id
          if (typeof id === 'number') removeTransactionLocal(id)
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') realtimeStatus.value = 'subscribed'
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          realtimeStatus.value = 'error'
        }
      })

    realtimeChannel.value = channel
    return channel
  }

  const stopRealtime = async () => {
    const channel = realtimeChannel.value
    if (!channel) return

    realtimeChannel.value = null
    realtimeStatus.value = 'idle'
    await supabase.removeChannel(channel)
  }

  // Actions
  const fetchTransactions = async (options: FetchTransactionsOptions = {}) => {
    loading.value = true
    clearError()

    try {
      const {
        search,
        transaction_type,
        status,
        orderBy = 'created_at',
        ascending = false,
        limit,
        offset,
      } = options

      let q = supabase
        .from('transactions')
        .select('*, created_by_user:created_by(id, email), approved_by_user:approved_by(id, email)')

      if (transaction_type) {
        q = q.eq('transaction_type', transaction_type)
      }
      if (status) {
        q = q.eq('status', status)
      }
      if (search && search.trim()) {
        const s = search.trim().replace(/,/g, '')
        q = q.or(
          `reference_no.ilike.%${s}%,remarks.ilike.%${s}%,status.ilike.%${s}%`,
        )
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
        .from('transactions')
        .select('*, created_by_user:created_by(id, email), approved_by_user:approved_by(id, email)')
        .eq('id', id)
        .single()

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
        .from('transactions')
        .insert([transactionData])
        .select('*, created_by_user:created_by(id, email), approved_by_user:approved_by(id, email)')
        .single()

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
        .from('transactions')
        .update(updateData)
        .eq('id', id)
        .select('*, created_by_user:created_by(id, email), approved_by_user:approved_by(id, email)')
        .single()

      if (updateError) throw updateError

      const updated = data as TransactionType
      const index = transactions.value.findIndex((t) => t.id === id)
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

      transactions.value = transactions.value.filter((t) => t.id !== id)
      if (currentTransaction.value?.id === id) currentTransaction.value = undefined
      return true
    } catch (err) {
      handleError(err, `Failed to delete transaction with ID ${id}`)
      return false
    } finally {
      loading.value = false
    }
  }

  const upsertTransactionLocal = (transaction: TransactionType) => {
    const idx = transactions.value.findIndex((t) => t.id === transaction.id)
    if (idx === -1) transactions.value.unshift(transaction)
    else transactions.value[idx] = transaction

    if (currentTransaction.value?.id === transaction.id) currentTransaction.value = transaction
  }

  const removeTransactionLocal = (id: number) => {
    transactions.value = transactions.value.filter((t) => t.id !== id)
    if (currentTransaction.value?.id === id) currentTransaction.value = undefined
  }

  const resetStore = () => {
    transactions.value = []
    currentTransaction.value = undefined
    loading.value = false
    error.value = ''
  }

  return {
    // State
    transactions,
    currentTransaction,
    loading,
    error,

    // Computed
    transactionsCount,
    hasTransactions,
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Actions
    fetchTransactions,
    fetchTransactionById,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    clearError,
    resetStore,

    // Realtime
    startRealtime,
    stopRealtime,

    // Local helpers
    upsertTransactionLocal,
    removeTransactionLocal,
  }
})