import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ProductType } from '@/stores/productsData'
import type { TransactionType } from '@/stores/transactionsData'

// Matches `public.transaction_items` schema. Line values live here again after
// transaction_item_details was merged back in: inbound qty is qty_stock_in,
// outbound qty is qty_stock_out, and the actual counted quantity is
// actual_count_stock_in (PO receipts) / actual_count_stock_out (transfer
// received, inhouse/ethical delivered).
export type TransactionItemType = {
  id: number
  created_at: string
  transaction_id: number | null
  product_id: number | null
  qty_stock_in: number | null
  qty_stock_out: number | null
  actual_count_stock_in: number | null
  actual_count_stock_out: number | null
  unit_price: number | null
  line_total: number | null
  cost_price: number | null
  stock_sources: Record<string, number> | null
  supplier_quotes: Record<string, unknown> | null
  // Joined FK data
  transaction?: TransactionType | null
  product?: ProductType | null
}

export type CreateTransactionItemData = {
  transaction_id?: number | null
  product_id?: number | null
  qty_stock_in?: number | null
  qty_stock_out?: number | null
  actual_count_stock_in?: number | null
  actual_count_stock_out?: number | null
  unit_price?: number | null
  line_total?: number | null
  cost_price?: number | null
  stock_sources?: Record<string, number> | null
  supplier_quotes?: Record<string, unknown> | null
}

export type UpdateTransactionItemData = Partial<CreateTransactionItemData>

// ─── Product IN/OUT movement history (get_product_transaction_movements RPC) ─
// Usa ra ka row per movement: gi-classify na sa SQL kung 'IN' ba o 'OUT' base
// sa transaction_type + status (ug pos_sale_details.voided_at sa mga sale).
export type ProductMovementType = {
  id: number
  transaction_id: number
  transaction_type: string | null
  status: string | null
  document_no: string | null
  movement: 'IN' | 'OUT'
  qty: number | null
  unit_price: number | null
  line_total: number | null
  movement_at: string | null
  created_at: string | null
  warehouse_id: number | null
  outlet: string | null
  remarks: string | null
  reason: string | null
  total_count: number
}

export type FetchProductMovementsOptions = {
  productId: number
  limit?: number
  offset?: number
}

export type ProductMovementsResult = {
  rows: ProductMovementType[]
  totalCount: number
}

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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transaction_items' },
        (payload) => {
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
        },
      )
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

      const selectQuery = '*, transaction:transaction_id(*), product:product_id(*)'

      let q = supabase.from('transaction_items').select(selectQuery)

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
      const selectQuery = '*, transaction:transaction_id(*), product:product_id(*)'
      const { data, error: fetchError } = await supabase
        .from('transaction_items')
        .select(selectQuery)
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

  /**
   * Quick IN/OUT movement history para sa usa ka product — usa ra ka round-trip
   * kay ang get_product_transaction_movements RPC na ang mo-join sa
   * transaction_items -> transactions (ug pos_sale_details para sa voided
   * sales) ug mo-return na dayon sa classified IN/OUT rows. Wala gi-wrap sa
   * try/catch — mo-rely lang sa destructured { data, error }.
   */
  const fetchProductMovements = async (
    options: FetchProductMovementsOptions,
  ): Promise<ProductMovementsResult> => {
    loading.value = true
    clearError()

    const { data, error: rpcError } = await supabase.rpc('get_product_transaction_movements', {
      p_product_id: options.productId,
      p_limit: options.limit ?? 500,
      p_offset: options.offset ?? 0,
    })

    loading.value = false

    if (rpcError) {
      handleError(rpcError, 'Failed to fetch product movements')
      return { rows: [] as ProductMovementType[], totalCount: 0 }
    }

    const rows = (data || []) as ProductMovementType[]
    return { rows, totalCount: rows[0]?.total_count ?? rows.length }
  }

  const createTransactionItem = async (itemData: CreateTransactionItemData) => {
    loading.value = true
    clearError()

    try {
      const selectQuery = '*, transaction:transaction_id(*), product:product_id(*)'
      const { data, error: createError } = await supabase
        .from('transaction_items')
        .insert([itemData])
        .select(selectQuery)
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
      const selectQuery = '*, transaction:transaction_id(*), product:product_id(*)'
      const { data, error: updateError } = await supabase
        .from('transaction_items')
        .update(updateData)
        .eq('id', id)
        .select(selectQuery)
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
    fetchProductMovements,
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
