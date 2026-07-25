import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type ReservedProductType = {
  id: number
  created_at: string
  reserved_qty: number | null
  customer_id: number | null
  warehouse_products_id: number | null
}

export type CreateReservedProductData = {
  reserved_qty?: number | null
  customer_id?: number | null
  warehouse_products_id?: number | null
}

export type UpdateReservedProductData = CreateReservedProductData

export type WarehouseStockWithReservationsRow = {
  warehouse_product_id: number
  product_id: number
  total_qty: number
  available_stock: number
  customer_name: string | null
  reserved_qty: number | null
}

type FetchReservedProductsOptions = {
  customer_id?: number | null
  warehouse_products_id?: number | null
  orderBy?: keyof Pick<
    ReservedProductType,
    'created_at' | 'customer_id' | 'warehouse_products_id' | 'reserved_qty'
  >
  ascending?: boolean
  limit?: number
  offset?: number
}

export const useReservedProductsDataStore = defineStore('reservedProductsData', () => {
  // State
  const reservedProducts: Ref<ReservedProductType[]> = ref([])
  const currentReservedProduct: Ref<ReservedProductType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // Realtime
  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // Computed
  const reservedProductsCount = computed(() => reservedProducts.value.length)
  const hasReservedProducts = computed(() => reservedProducts.value.length > 0)
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => !!error.value)
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')

  // Helpers
  const handleError = (err: unknown, defaultMessage: string) => {
    console.error(err)
    error.value = (err as { message?: string }).message || defaultMessage
  }

  const clearError = () => {
    error.value = ''
  }

  const upsertReservedProductLocal = (reservedProduct: ReservedProductType) => {
    const idx = reservedProducts.value.findIndex((rp) => rp.id === reservedProduct.id)
    if (idx === -1) reservedProducts.value.unshift(reservedProduct)
    else reservedProducts.value[idx] = reservedProduct

    if (currentReservedProduct.value?.id === reservedProduct.id) {
      currentReservedProduct.value = reservedProduct
    }
  }

  const removeReservedProductLocal = (id: number) => {
    reservedProducts.value = reservedProducts.value.filter((rp) => rp.id !== id)
    if (currentReservedProduct.value?.id === id) currentReservedProduct.value = undefined
  }

  const startRealtime = () => {
    // Avoid double subscriptions
    if (realtimeChannel.value) return realtimeChannel.value

    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel('custom-all-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reserved_products' },
        (payload) => {
          console.log('Change received!', payload)
          const eventType = payload.eventType

          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const row = payload.new as ReservedProductType
            if (row?.id != null) upsertReservedProductLocal(row)
          }

          if (eventType === 'DELETE') {
            const row = payload.old as Partial<ReservedProductType> | null
            const id = row?.id
            if (typeof id === 'number') removeReservedProductLocal(id)
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

  // CRUD
  const fetchReservedProducts = async (options: FetchReservedProductsOptions = {}) => {
    loading.value = true
    clearError()

    try {
      const {
        customer_id,
        warehouse_products_id,
        orderBy = 'created_at',
        ascending = false,
        limit,
        offset,
      } = options

      let q = supabase.from('reserved_products').select('*')

      if (typeof customer_id === 'number') {
        q = q.eq('customer_id', customer_id)
      }

      if (typeof warehouse_products_id === 'number') {
        q = q.eq('warehouse_products_id', warehouse_products_id)
      }

      q = q.order(orderBy as string, { ascending })

      if (typeof limit === 'number' && typeof offset === 'number') {
        q = q.range(offset, offset + limit - 1)
      } else if (typeof limit === 'number') {
        q = q.limit(limit)
      }

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      reservedProducts.value = (data || []) as ReservedProductType[]
      return reservedProducts.value
    } catch (err) {
      handleError(err, 'Failed to fetch reserved products')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchReservedProductById = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('reserved_products')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      currentReservedProduct.value = data as ReservedProductType
      return currentReservedProduct.value
    } catch (err) {
      handleError(err, `Failed to fetch reserved product with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const fetchReservedProductsByCustomer = async (customerId: number) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('reserved_products')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      reservedProducts.value = (data || []) as ReservedProductType[]
      return reservedProducts.value
    } catch (err) {
      handleError(err, `Failed to fetch reserved products for customer ID ${customerId}`)
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchReservedProductsByWarehouseProduct = async (warehouseProductId: number) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('reserved_products')
        .select('*')
        .eq('warehouse_products_id', warehouseProductId)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      reservedProducts.value = (data || []) as ReservedProductType[]
      return reservedProducts.value
    } catch (err) {
      handleError(
        err,
        `Failed to fetch reserved products for warehouse product ID ${warehouseProductId}`,
      )
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchReservedProductsByWarehouseProductIds = async (warehouseProductIds: number[]) => {
    if (warehouseProductIds.length === 0) {
      reservedProducts.value = []
      return []
    }

    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('reserved_products')
        .select('*')
        .in('warehouse_products_id', warehouseProductIds)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      reservedProducts.value = (data || []) as ReservedProductType[]
      return reservedProducts.value
    } catch (err) {
      handleError(err, 'Failed to fetch reserved products by warehouse product IDs')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchWarehouseStockWithReservations = async (warehouseId: number) => {
    loading.value = true
    clearError()

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_warehouse_stock_with_reservations',
        { p_warehouse_id: warehouseId },
      )

      //console.log(`[ReservedProductsStore] Calling RPC with p_warehouse_id=${warehouseId}`)
      //console.log('[ReservedProductsStore] Raw RPC response data:', JSON.stringify(data, null, 2))

      if (rpcError) throw rpcError

      const rows = (data || []) as WarehouseStockWithReservationsRow[]
      //console.log('[ReservedProductsStore] RPC result rows:', rows)
      return rows
    } catch (err) {
      handleError(err, 'Failed to fetch warehouse stock with reservations')
      return []
    } finally {
      loading.value = false
    }
  }

  const createReservedProduct = async (data: CreateReservedProductData) => {
    loading.value = true
    clearError()

    try {
      const { data: created, error: createError } = await supabase
        .from('reserved_products')
        .insert([data])
        .select()
        .single()

      if (createError) throw createError

      const rp = created as ReservedProductType
      reservedProducts.value.unshift(rp)
      currentReservedProduct.value = rp
      return rp
    } catch (err) {
      handleError(err, 'Failed to create reserved product')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const updateReservedProduct = async (id: number, updateData: UpdateReservedProductData) => {
    loading.value = true
    clearError()

    try {
      const { data: updated, error: updateError } = await supabase
        .from('reserved_products')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      const rp = updated as ReservedProductType
      const idx = reservedProducts.value.findIndex((p) => p.id === id)
      if (idx !== -1) reservedProducts.value[idx] = rp
      if (currentReservedProduct.value?.id === id) currentReservedProduct.value = rp
      return rp
    } catch (err) {
      handleError(err, `Failed to update reserved product with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const deleteReservedProduct = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { error: deleteError } = await supabase.from('reserved_products').delete().eq('id', id)

      if (deleteError) throw deleteError

      removeReservedProductLocal(id)
      return true
    } catch (err) {
      handleError(err, `Failed to delete reserved product with ID ${id}`)
      return false
    } finally {
      loading.value = false
    }
  }

  const resetStore = () => {
    reservedProducts.value = []
    currentReservedProduct.value = undefined
    loading.value = false
    error.value = ''
    realtimeChannel.value = null
    realtimeStatus.value = 'idle'
  }

  return {
    // State
    reservedProducts,
    currentReservedProduct,
    loading,
    error,
    realtimeChannel,
    realtimeStatus,

    // Computed
    reservedProductsCount,
    hasReservedProducts,
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Realtime
    startRealtime,
    stopRealtime,

    // CRUD
    fetchReservedProducts,
    fetchReservedProductById,
    fetchReservedProductsByCustomer,
    fetchReservedProductsByWarehouseProduct,
    fetchReservedProductsByWarehouseProductIds,
    fetchWarehouseStockWithReservations,
    createReservedProduct,
    updateReservedProduct,
    deleteReservedProduct,

    // Misc
    clearError,
    resetStore,
    upsertReservedProductLocal,
    removeReservedProductLocal,
  }
})
