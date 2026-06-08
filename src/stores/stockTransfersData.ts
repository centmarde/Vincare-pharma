import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Matches `public.stock_transfers` schema
export type StockTransferType = {
  id: number
  created_at: string
  source_warehouse: string | null
  destination_warehouse: string | null
  transfare_date: string | null
  status: string | null
}

export type CreateStockTransferData = {
  source_warehouse?: string | null
  destination_warehouse?: string | null
  transfare_date?: string | null
  status?: string | null
}

export type UpdateStockTransferData = CreateStockTransferData

type FetchStockTransfersOptions = {
  search?: string
  status?: string | null
  source_warehouse?: string | null
  destination_warehouse?: string | null
  orderBy?: keyof Pick<StockTransferType, 'created_at' | 'transfare_date' | 'status'>
  ascending?: boolean
  limit?: number
  offset?: number
}

export const useStockTransfersDataStore = defineStore('stockTransfersData', () => {
  // State
  const stockTransfers: Ref<StockTransferType[]> = ref([])
  const currentStockTransfer: Ref<StockTransferType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // Realtime
  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // Computed
  const stockTransfersCount = computed(() => stockTransfers.value.length)
  const hasStockTransfers = computed(() => stockTransfers.value.length > 0)
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
      .channel('custom-stock-transfers-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_transfers' },
        (payload) => {
          console.log('Change received!', payload)

          const eventType = payload.eventType

          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const row = payload.new as StockTransferType
            if (row?.id != null) upsertStockTransferLocal(row)
          }

          if (eventType === 'DELETE') {
            const row = payload.old as Partial<StockTransferType> | null
            const id = row?.id
            if (typeof id === 'number') removeStockTransferLocal(id)
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
  const fetchStockTransfers = async (options: FetchStockTransfersOptions = {}) => {
    loading.value = true
    clearError()

    try {
      const {
        search,
        status,
        source_warehouse,
        destination_warehouse,
        orderBy = 'created_at',
        ascending = false,
        limit,
        offset,
      } = options

      let q = supabase.from('stock_transfers').select('*')

      if (status && status.trim()) {
        q = q.eq('status', status.trim())
      }
      if (source_warehouse && source_warehouse.trim()) {
        q = q.eq('source_warehouse', source_warehouse.trim())
      }
      if (destination_warehouse && destination_warehouse.trim()) {
        q = q.eq('destination_warehouse', destination_warehouse.trim())
      }

      if (search && search.trim()) {
        const s = search.trim().replace(/,/g, '')
        q = q.or(
          `source_warehouse.ilike.%${s}%,destination_warehouse.ilike.%${s}%,status.ilike.%${s}%`,
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

      stockTransfers.value = (data || []) as StockTransferType[]
      return stockTransfers.value
    } catch (err) {
      handleError(err, 'Failed to fetch stock transfers')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchStockTransferById = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('stock_transfers')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      currentStockTransfer.value = data as StockTransferType
      return currentStockTransfer.value
    } catch (err) {
      handleError(err, `Failed to fetch stock transfer with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const createStockTransfer = async (stockTransferData: CreateStockTransferData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: createError } = await supabase
        .from('stock_transfers')
        .insert([stockTransferData])
        .select()
        .single()

      if (createError) throw createError

      const created = data as StockTransferType
      stockTransfers.value.unshift(created)
      currentStockTransfer.value = created
      return created
    } catch (err) {
      handleError(err, 'Failed to create stock transfer')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const updateStockTransfer = async (id: number, updateData: UpdateStockTransferData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: updateError } = await supabase
        .from('stock_transfers')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      const updated = data as StockTransferType
      const index = stockTransfers.value.findIndex((st) => st.id === id)
      if (index !== -1) stockTransfers.value[index] = updated
      if (currentStockTransfer.value?.id === id) currentStockTransfer.value = updated
      return updated
    } catch (err) {
      handleError(err, `Failed to update stock transfer with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const deleteStockTransfer = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { error: deleteError } = await supabase.from('stock_transfers').delete().eq('id', id)
      if (deleteError) throw deleteError

      stockTransfers.value = stockTransfers.value.filter((st) => st.id !== id)
      if (currentStockTransfer.value?.id === id) currentStockTransfer.value = undefined
      return true
    } catch (err) {
      handleError(err, `Failed to delete stock transfer with ID ${id}`)
      return false
    } finally {
      loading.value = false
    }
  }

  const upsertStockTransferLocal = (stockTransfer: StockTransferType) => {
    const idx = stockTransfers.value.findIndex((st) => st.id === stockTransfer.id)
    if (idx === -1) stockTransfers.value.unshift(stockTransfer)
    else stockTransfers.value[idx] = stockTransfer

    if (currentStockTransfer.value?.id === stockTransfer.id)
      currentStockTransfer.value = stockTransfer
  }

  const removeStockTransferLocal = (id: number) => {
    stockTransfers.value = stockTransfers.value.filter((st) => st.id !== id)
    if (currentStockTransfer.value?.id === id) currentStockTransfer.value = undefined
  }

  const resetStore = () => {
    stockTransfers.value = []
    currentStockTransfer.value = undefined
    loading.value = false
    error.value = ''
  }

  return {
    // State
    stockTransfers,
    currentStockTransfer,
    loading,
    error,

    // Computed
    stockTransfersCount,
    hasStockTransfers,
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Actions
    fetchStockTransfers,
    fetchStockTransferById,
    createStockTransfer,
    updateStockTransfer,
    deleteStockTransfer,
    clearError,
    resetStore,

    // Realtime
    startRealtime,
    stopRealtime,

    // Local helpers (optional)
    upsertStockTransferLocal,
    removeStockTransferLocal,
  }
})
