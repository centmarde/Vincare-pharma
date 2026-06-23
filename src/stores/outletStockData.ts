import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ProductType } from '@/stores/productsData'

// Matches `public.outlet_stock` schema (with FK join)
export type OutletStockType = {
  id: number
  created_at: string
  updated_at: string | null
  outlet_id: number
  product_id: number
  quantity: number
  // Joined FK data
  product?: ProductType | null
}

type FetchOutletStockOptions = {
  outletId: number
  search?: string
}

export const useOutletStockDataStore = defineStore('outletStockData', () => {

  // ─── State ──────────────────────────────────────────────────────────────────

  const outletStock: Ref<OutletStockType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // ─── Realtime ────────────────────────────────────────────────────────────────

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // ─── Computed ────────────────────────────────────────────────────────────────

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }

  const clearError = () => {
    error.value = ''
  }

  // ─── Realtime ────────────────────────────────────────────────────────────────

  const startRealtime = (outletId: number) => {
    if (realtimeChannel.value) return realtimeChannel.value

    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel(`outlet-stock-channel-${outletId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'outlet_stock',
        filter: `outlet_id=eq.${outletId}`,
      }, async () => { await fetchOutletStock({ outletId }) })
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

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const fetchOutletStock = async (options: FetchOutletStockOptions) => {
    loading.value = true
    clearError()

    try {
      const { outletId, search } = options

      let q = supabase
        .from('outlet_stock')
        .select('*, product:product_id(*)')
        .eq('outlet_id', outletId)

      if (search?.trim()) {
        const s = search.trim()
        q = q.or(`product_name.ilike.%${s}%,sku.ilike.%${s}%`, { referencedTable: 'product' })
      }

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      outletStock.value = (data || []) as OutletStockType[]
      return outletStock.value

    } catch (err) {
      handleError(err, 'Failed to fetch outlet stock')
      return []
    } finally {
      loading.value = false
    }
  }

  // Used exclusively by the stock-transfer receiving flow — the only legitimate
  // way outlet_stock should change, so it's the only mutation this store exposes.
  const incrementOutletStock = async (outletId: number, productId: number, qty: number) => {
    clearError()

    try {
      const { data: existing, error: fetchError } = await supabase
        .from('outlet_stock')
        .select('id, quantity')
        .eq('outlet_id', outletId)
        .eq('product_id', productId)
        .maybeSingle()

      if (fetchError) throw fetchError

      if (existing) {
        const { error: updateError } = await supabase
          .from('outlet_stock')
          .update({ quantity: existing.quantity + qty, updated_at: new Date().toISOString() })
          .eq('id', existing.id)

        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('outlet_stock')
          .insert({ outlet_id: outletId, product_id: productId, quantity: qty })

        if (insertError) throw insertError
      }

      return true

    } catch (err) {
      handleError(err, 'Failed to update outlet stock')
      return false
    }
  }

  const resetStore = () => {
    outletStock.value = []
    loading.value = false
    error.value = ''
  }

  // ─── Expose ───────────────────────────────────────────────────────────────────

  return {
    // State
    outletStock,
    loading,
    error,

    // Computed
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Actions
    fetchOutletStock,
    incrementOutletStock,
    clearError,
    resetStore,

    // Realtime
    startRealtime,
    stopRealtime,
  }
})
