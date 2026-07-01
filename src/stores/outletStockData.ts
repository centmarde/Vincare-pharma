import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ProductType } from '@/stores/productsData'

// Per-outlet on-hand ledger, keyed by the stable outlet_id (branches are
// editable data — see outletsData.ts — so identity must never be the
// renameable `outlet` text code). That text column is kept only as a
// denormalised mirror for Finance's existing reads.
// Reads only — all mutations happen atomically inside the DB functions
// (pos_create_sale, pos_void_sale, transfer_receive).
export type OutletStockType = {
  id: number
  created_at: string
  updated_at: string | null
  outlet: string
  outlet_id: number
  product_id: number
  quantity: number
  product?: ProductType | null
}

type FetchOutletStockOptions = {
  outletId?: number
  search?: string
}

export const useOutletStockDataStore = defineStore('outletStockData', () => {
  const outletStock: Ref<OutletStockType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeOutletId: Ref<number | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }
  const clearError = () => { error.value = '' }

  // Branch picker callers re-call this on every outlet switch — without
  // tracking which outlet the live channel is filtered to, a switch away
  // from the first-subscribed branch would silently keep listening to the
  // old one (or just no-op) instead of resubscribing to the new filter.
  const startRealtime = (outletId: number) => {
    if (realtimeChannel.value && realtimeOutletId.value === outletId) return realtimeChannel.value
    if (realtimeChannel.value) {
      const old = realtimeChannel.value
      realtimeChannel.value = null
      void supabase.removeChannel(old)
    }
    realtimeStatus.value = 'subscribing'
    realtimeOutletId.value = outletId
    const channel = supabase
      .channel(`outlet-stock-channel-${outletId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'outlet_stock', filter: `outlet_id=eq.${outletId}`,
      }, async () => { await fetchOutletStock({ outletId }) })
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
    realtimeOutletId.value = null
    realtimeStatus.value = 'idle'
    await supabase.removeChannel(channel)
  }

  const fetchOutletStock = async (options: FetchOutletStockOptions) => {
    loading.value = true
    clearError()
    try {
      const { outletId, search } = options
      let q = supabase.from('outlet_stock').select('*, product:product_id(*)')
      if (outletId) q = q.eq('outlet_id', outletId)

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
