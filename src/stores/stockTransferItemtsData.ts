import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Matches `public.stock_transfer_items` schema with relationships
export type StockTransferItemType = {
  id: number
  created_at: string
  product_id: number | null
  quantity: number | null
  transfer_id: number | null
  // Related data via foreign keys
  product?: {
    id: number
    name: string | null
    brand: string | null
  } | null
  stock_transfer?: {
    id: number
    source_warehouse: string | null
    destination_warehouse: string | null
    transfare_date: string | null
    status: string | null
  } | null
}

export type CreateStockTransferItemData = {
  product_id?: number | null
  quantity?: number | null
  transfer_id?: number | null
}

export type UpdateStockTransferItemData = CreateStockTransferItemData

type FetchStockTransferItemsOptions = {
  transfer_id?: number | null
  product_id?: number | null
  search?: string
  orderBy?: keyof Pick<StockTransferItemType, 'created_at' | 'product_id' | 'quantity'>
  ascending?: boolean
  limit?: number
  offset?: number
  includeProduct?: boolean
  includeTransfer?: boolean
}

export const useStockTransferItemsDataStore = defineStore('stockTransferItemsData', () => {
  // State
  const stockTransferItems: Ref<StockTransferItemType[]> = ref([])
  const currentStockTransferItem: Ref<StockTransferItemType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // Realtime
  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // Computed
  const stockTransferItemsCount = computed(() => stockTransferItems.value.length)
  const hasStockTransferItems = computed(() => stockTransferItems.value.length > 0)
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
    // Avoid double subscriptions
    if (realtimeChannel.value) return realtimeChannel.value

    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel('custom-stock-transfer-items-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_transfer_items' },
        (payload) => {
          console.log('Change received!', payload)

          const eventType = payload.eventType

          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const row = payload.new as StockTransferItemType
            if (row?.id != null) upsertStockTransferItemLocal(row)
          }

          if (eventType === 'DELETE') {
            const row = payload.old as Partial<StockTransferItemType> | null
            const id = row?.id
            if (typeof id === 'number') removeStockTransferItemLocal(id)
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
  const fetchStockTransferItems = async (options: FetchStockTransferItemsOptions = {}) => {
    loading.value = true
    clearError()

    try {
      const {
        transfer_id,
        product_id,
        search,
        orderBy = 'created_at',
        ascending = false,
        limit,
        offset,
        includeProduct = true,
        includeTransfer = true,
      } = options

      // Build select query with relationships
      let selectQuery = '*'
      if (includeProduct) {
        selectQuery += ', product (id, name, brand)'
      }
      if (includeTransfer) {
        selectQuery +=
          ', stock_transfer (id, source_warehouse, destination_warehouse, transfare_date, status)'
      }

      let q = supabase.from('stock_transfer_items').select(selectQuery)

      if (typeof transfer_id === 'number') {
        q = q.eq('transfer_id', transfer_id)
      }
      if (typeof product_id === 'number') {
        q = q.eq('product_id', product_id)
      }

      if (search && search.trim()) {
        const s = search.trim().replace(/,/g, '')
        // Search in product name if included
        if (includeProduct) {
          q = q.or(`product.name.ilike.%${s}%`)
        }
      }

      q = q.order(orderBy as string, { ascending })

      if (typeof limit === 'number' && typeof offset === 'number') {
        q = q.range(offset, offset + limit - 1)
      } else if (typeof limit === 'number') {
        q = q.limit(limit)
      }

      const { data, error: fetchError } = await q

      if (fetchError) throw fetchError

      stockTransferItems.value = data ? (data as unknown as StockTransferItemType[]) : []
      return stockTransferItems.value
    } catch (err) {
      handleError(err, 'Failed to fetch stock transfer items')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchStockTransferItemById = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const selectQuery =
        '*, product (id, name, brand), stock_transfer (id, source_warehouse, destination_warehouse, transfare_date, status)'

      const { data, error: fetchError } = await supabase
        .from('stock_transfer_items')
        .select(selectQuery)
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      currentStockTransferItem.value = data as StockTransferItemType
      return currentStockTransferItem.value
    } catch (err) {
      handleError(err, `Failed to fetch stock transfer item with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const fetchStockTransferItemsByTransferId = async (transferId: number) => {
    loading.value = true
    clearError()

    try {
      const selectQuery = '*, product (id, name, brand)'

      const { data, error: fetchError } = await supabase
        .from('stock_transfer_items')
        .select(selectQuery)
        .eq('transfer_id', transferId)

      if (fetchError) throw fetchError

      stockTransferItems.value = data ? (data as unknown as StockTransferItemType[]) : []
      return stockTransferItems.value
    } catch (err) {
      handleError(err, `Failed to fetch stock transfer items for transfer ID ${transferId}`)
      return []
    } finally {
      loading.value = false
    }
  }

  const createStockTransferItem = async (stockTransferItemData: CreateStockTransferItemData) => {
    loading.value = true
    clearError()

    try {
      const selectQuery =
        '*, product (id, name, brand), stock_transfer (id, source_warehouse, destination_warehouse, transfare_date, status)'

      const { data, error: createError } = await supabase
        .from('stock_transfer_items')
        .insert([stockTransferItemData])
        .select(selectQuery)
        .single()

      if (createError) throw createError

      const created = data as StockTransferItemType
      stockTransferItems.value.unshift(created)
      currentStockTransferItem.value = created
      return created
    } catch (err) {
      handleError(err, 'Failed to create stock transfer item')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const updateStockTransferItem = async (id: number, updateData: UpdateStockTransferItemData) => {
    loading.value = true
    clearError()

    try {
      const selectQuery =
        '*, product (id, name, brand), stock_transfer (id, source_warehouse, destination_warehouse, transfare_date, status)'

      const { data, error: updateError } = await supabase
        .from('stock_transfer_items')
        .update(updateData)
        .eq('id', id)
        .select(selectQuery)
        .single()

      if (updateError) throw updateError

      const updated = data as StockTransferItemType
      const index = stockTransferItems.value.findIndex((sti) => sti.id === id)
      if (index !== -1) stockTransferItems.value[index] = updated
      if (currentStockTransferItem.value?.id === id) currentStockTransferItem.value = updated
      return updated
    } catch (err) {
      handleError(err, `Failed to update stock transfer item with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const deleteStockTransferItem = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { error: deleteError } = await supabase
        .from('stock_transfer_items')
        .delete()
        .eq('id', id)
      if (deleteError) throw deleteError

      stockTransferItems.value = stockTransferItems.value.filter((sti) => sti.id !== id)
      if (currentStockTransferItem.value?.id === id) currentStockTransferItem.value = undefined
      return true
    } catch (err) {
      handleError(err, `Failed to delete stock transfer item with ID ${id}`)
      return false
    } finally {
      loading.value = false
    }
  }

  const upsertStockTransferItemLocal = (stockTransferItem: StockTransferItemType) => {
    const idx = stockTransferItems.value.findIndex((sti) => sti.id === stockTransferItem.id)
    if (idx === -1) stockTransferItems.value.unshift(stockTransferItem)
    else stockTransferItems.value[idx] = stockTransferItem

    if (currentStockTransferItem.value?.id === stockTransferItem.id)
      currentStockTransferItem.value = stockTransferItem
  }

  const removeStockTransferItemLocal = (id: number) => {
    stockTransferItems.value = stockTransferItems.value.filter((sti) => sti.id !== id)
    if (currentStockTransferItem.value?.id === id) currentStockTransferItem.value = undefined
  }

  const resetStore = () => {
    stockTransferItems.value = []
    currentStockTransferItem.value = undefined
    loading.value = false
    error.value = ''
  }

  return {
    // State
    stockTransferItems,
    currentStockTransferItem,
    loading,
    error,

    // Computed
    stockTransferItemsCount,
    hasStockTransferItems,
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Actions
    fetchStockTransferItems,
    fetchStockTransferItemById,
    fetchStockTransferItemsByTransferId,
    createStockTransferItem,
    updateStockTransferItem,
    deleteStockTransferItem,
    clearError,
    resetStore,

    // Realtime
    startRealtime,
    stopRealtime,

    // Local helpers (optional)
    upsertStockTransferItemLocal,
    removeStockTransferItemLocal,
  }
})
