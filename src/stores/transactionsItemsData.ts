import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ProductType } from '@/stores/productsData'
import type { TransactionType } from '@/stores/transactionsData'

// Matches `public.transaction_items` schema (with FK joins)
export type TransactionItemType = {
  id: number
  created_at: string
  transaction_id: number | null
  product_id: number | null
  // Joined FK data
  transaction?: TransactionType | null
  product?: ProductType | null
}

export type CreateTransactionItemData = {
  transaction_id?: number | null
  product_id?: number | null
}

export type UpdateTransactionItemData = Partial<CreateTransactionItemData>

type FetchTransactionItemsOptions = {
  transaction_id?: number | null
  product_id?: number | null
  orderBy?: keyof Pick<TransactionItemType, 'created_at' | 'id'>
  ascending?: boolean
  limit?: number
  offset?: number
}

export const useTransactionItemsDataStore = defineStore('transactionItemsData', () => {
  // State
  const transactionItems: Ref<TransactionItemType[]> = ref([])
  const currentTransactionItem: Ref<TransactionItemType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // Realtime
  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // Computed
  const transactionItemsCount = computed(() => transactionItems.value.length)
  const hasTransactionItems = computed(() => transactionItems.value.length > 0)
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
      .channel('transaction-items-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transaction_items' }, (payload) => {
        console.log('Transaction item change received!', payload)

        const eventType = payload.eventType

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          const row = payload.new as TransactionItemType
          if (row?.id != null) upsertTransactionItemLocal(row)
        }

        if (eventType === 'DELETE') {
          const row = payload.old as Partial<TransactionItemType> | null
          const id = row?.id
          if (typeof id === 'number') removeTransactionItemLocal(id)
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
  const fetchTransactionItems = async (options: FetchTransactionItemsOptions = {}) => {
    loading.value = true
    clearError()

    try {
      const {
        transaction_id,
        product_id,
        orderBy = 'created_at',
        ascending = false,
        limit,
        offset,
      } = options

      let q = supabase
        .from('transaction_items')
        .select('*, transaction:transaction_id(*), product:product_id(*)')

      if (typeof transaction_id === 'number') {
        q = q.eq('transaction_id', transaction_id)
      }
      if (typeof product_id === 'number') {
        q = q.eq('product_id', product_id)
      }

      q = q.order(orderBy as string, { ascending })

      if (typeof limit === 'number' && typeof offset === 'number') {
        q = q.range(offset, offset + limit - 1)
      } else if (typeof limit === 'number') {
        q = q.limit(limit)
      }

      const { data, error: fetchError } = await q

      if (fetchError) throw fetchError

      transactionItems.value = (data || []) as TransactionItemType[]
      return transactionItems.value
    } catch (err) {
      handleError(err, 'Failed to fetch transaction items')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchTransactionItemById = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('transaction_items')
        .select('*, transaction:transaction_id(*), product:product_id(*)')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      currentTransactionItem.value = data as TransactionItemType
      return currentTransactionItem.value
    } catch (err) {
      handleError(err, `Failed to fetch transaction item with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const createTransactionItem = async (itemData: CreateTransactionItemData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: createError } = await supabase
        .from('transaction_items')
        .insert([itemData])
        .select('*, transaction:transaction_id(*), product:product_id(*)')
        .single()

      if (createError) throw createError

      const created = data as TransactionItemType
      transactionItems.value.unshift(created)
      currentTransactionItem.value = created
      return created
    } catch (err) {
      handleError(err, 'Failed to create transaction item')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const updateTransactionItem = async (id: number, updateData: UpdateTransactionItemData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: updateError } = await supabase
        .from('transaction_items')
        .update(updateData)
        .eq('id', id)
        .select('*, transaction:transaction_id(*), product:product_id(*)')
        .single()

      if (updateError) throw updateError

      const updated = data as TransactionItemType
      const index = transactionItems.value.findIndex((ti) => ti.id === id)
      if (index !== -1) transactionItems.value[index] = updated
      if (currentTransactionItem.value?.id === id) currentTransactionItem.value = updated
      return updated
    } catch (err) {
      handleError(err, `Failed to update transaction item with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const deleteTransactionItem = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { error: deleteError } = await supabase.from('transaction_items').delete().eq('id', id)
      if (deleteError) throw deleteError

      transactionItems.value = transactionItems.value.filter((ti) => ti.id !== id)
      if (currentTransactionItem.value?.id === id) currentTransactionItem.value = undefined
      return true
    } catch (err) {
      handleError(err, `Failed to delete transaction item with ID ${id}`)
      return false
    } finally {
      loading.value = false
    }
  }

  const upsertTransactionItemLocal = (item: TransactionItemType) => {
    const idx = transactionItems.value.findIndex((ti) => ti.id === item.id)
    if (idx === -1) transactionItems.value.unshift(item)
    else transactionItems.value[idx] = item

    if (currentTransactionItem.value?.id === item.id) currentTransactionItem.value = item
  }

  const removeTransactionItemLocal = (id: number) => {
    transactionItems.value = transactionItems.value.filter((ti) => ti.id !== id)
    if (currentTransactionItem.value?.id === id) currentTransactionItem.value = undefined
  }

  const resetStore = () => {
    transactionItems.value = []
    currentTransactionItem.value = undefined
    loading.value = false
    error.value = ''
  }

  return {
    // State
    transactionItems,
    currentTransactionItem,
    loading,
    error,

    // Computed
    transactionItemsCount,
    hasTransactionItems,
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Actions
    fetchTransactionItems,
    fetchTransactionItemById,
    createTransactionItem,
    updateTransactionItem,
    deleteTransactionItem,
    clearError,
    resetStore,

    // Realtime
    startRealtime,
    stopRealtime,

    // Local helpers
    upsertTransactionItemLocal,
    removeTransactionItemLocal,
  }
})