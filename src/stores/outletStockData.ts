import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ProductType } from '@/stores/productsData'

// Per-outlet on-hand ledger, keyed by outlet CODE ('EXELMED' / 'ETHICAL').
// Reads only — all mutations happen atomically inside the DB functions
// (pos_create_sale, pos_void_sale, transfer_receive).
export type OutletStockType = {
  id: number
  created_at: string
  updated_at: string | null
  outlet: string
  product_id: number
  quantity: number
  product?: ProductType | null
}

type FetchOutletStockOptions = {
  outlet: string
  search?: string
}

export const useOutletStockDataStore = defineStore('outletStockData', () => {
  const outletStock: Ref<OutletStockType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }
  const clearError = () => { error.value = '' }

  const startRealtime = (outlet: string) => {
    if (realtimeChannel.value) return realtimeChannel.value
    realtimeStatus.value = 'subscribing'
    const channel = supabase
      .channel(`outlet-stock-channel-${outlet}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'outlet_stock', filter: `outlet=eq.${outlet}`,
      }, async () => { await fetchOutletStock({ outlet }) })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') realtimeStatus.value = 'subscribed'
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') realtimeStatus.value = 'error'
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

  const fetchOutletStock = async (options: FetchOutletStockOptions) => {
    loading.value = true
    clearError()
    try {
      const { outlet, search } = options
      let q = supabase.from('outlet_stock').select('*, product:product_id(*)').eq('outlet', outlet)

      if (search && search.trim()) {
        const s = search.trim().replace(/,/g, '')
        q = q.or(`product_name.ilike.%${s}%,sku.ilike.%${s}%`, { referencedTable: 'product' })
      }

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      outletStock.value = (data || []) as unknown as OutletStockType[]
      return outletStock.value
    } catch (err) {
      handleError(err, 'Failed to fetch outlet stock')
      return []
    } finally {
      loading.value = false
    }
  }

  const resetStore = () => {
    outletStock.value = []
    loading.value = false
    error.value = ''
  }

  return {
    outletStock,
    loading,
    error,
    isLoading,
    hasError,
    isRealtimeSubscribed,
    fetchOutletStock,
    startRealtime,
    stopRealtime,
    clearError,
    resetStore,
  }
})
