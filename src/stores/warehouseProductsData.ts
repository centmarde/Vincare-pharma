import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type WarehouseProductType = {
  id: number
  created_at: string
  product_id: number | null
  warehouse_id: number | null
  total_qty: number | null
  notes: string | null
}

export type CreateWarehouseProductData = {
  product_id?: number | null
  warehouse_id?: number | null
  total_qty?: number | null
  notes?: string | null
}

export type UpdateWarehouseProductData = CreateWarehouseProductData

type FetchWarehouseProductsOptions = {
  product_id?: number | null
  warehouse_id?: number | null
  orderBy?: keyof Pick<WarehouseProductType, 'created_at' | 'product_id' | 'warehouse_id' | 'total_qty'>
  ascending?: boolean
  limit?: number
  offset?: number
}

export const useWarehouseProductsDataStore = defineStore('warehouseProductsData', () => {
  // State
  const warehouseProducts: Ref<WarehouseProductType[]> = ref([])
  const currentWarehouseProduct: Ref<WarehouseProductType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // Realtime
  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // Computed
  const warehouseProductsCount = computed(() => warehouseProducts.value.length)
  const hasWarehouseProducts = computed(() => warehouseProducts.value.length > 0)
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

  const upsertWarehouseProductLocal = (warehouseProduct: WarehouseProductType) => {
    const idx = warehouseProducts.value.findIndex((wp) => wp.id === warehouseProduct.id)
    if (idx === -1) warehouseProducts.value.unshift(warehouseProduct)
    else warehouseProducts.value[idx] = warehouseProduct

    if (currentWarehouseProduct.value?.id === warehouseProduct.id) {
      currentWarehouseProduct.value = warehouseProduct
    }
  }

  const removeWarehouseProductLocal = (id: number) => {
    warehouseProducts.value = warehouseProducts.value.filter((wp) => wp.id !== id)
    if (currentWarehouseProduct.value?.id === id) currentWarehouseProduct.value = undefined
  }

  const startRealtime = () => {
    // Avoid double subscriptions
    if (realtimeChannel.value) return realtimeChannel.value

    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel('custom-all-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'warehouse_products' },
        (payload) => {
          console.log('Change received!', payload)
          const eventType = payload.eventType

          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const row = payload.new as WarehouseProductType
            if (row?.id != null) upsertWarehouseProductLocal(row)
          }

          if (eventType === 'DELETE') {
            const row = payload.old as Partial<WarehouseProductType> | null
            const id = row?.id
            if (typeof id === 'number') removeWarehouseProductLocal(id)
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
  const fetchWarehouseProducts = async (options: FetchWarehouseProductsOptions = {}) => {
    loading.value = true
    clearError()

    try {
      const { product_id, warehouse_id, orderBy = 'created_at', ascending = false, limit, offset } = options

      let q = supabase.from('warehouse_products').select('*')

      if (product_id != null) {
        q = q.eq('product_id', product_id)
      }

      if (warehouse_id != null) {
        q = q.eq('warehouse_id', warehouse_id)
      }

      q = q.order(orderBy as string, { ascending })

      if (typeof limit === 'number' && typeof offset === 'number') {
        q = q.range(offset, offset + limit - 1)
      } else if (typeof limit === 'number') {
        q = q.limit(limit)
      }

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      warehouseProducts.value = (data || []) as WarehouseProductType[]
      return warehouseProducts.value
    } catch (err) {
      handleError(err, 'Failed to fetch warehouse products')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchWarehouseProductById = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('warehouse_products')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      currentWarehouseProduct.value = data as WarehouseProductType
      return currentWarehouseProduct.value
    } catch (err) {
      handleError(err, `Failed to fetch warehouse product with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const fetchWarehouseProductByProductAndWarehouse = async (
    productId: number,
    warehouseId: number,
  ) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('warehouse_products')
        .select('*')
        .eq('product_id', productId)
        .eq('warehouse_id', warehouseId)
        .maybeSingle()

      if (fetchError) throw fetchError

      currentWarehouseProduct.value = (data as WarehouseProductType) ?? undefined
      return currentWarehouseProduct.value
    } catch (err) {
      handleError(err, 'Failed to fetch warehouse product')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const createWarehouseProduct = async (data: CreateWarehouseProductData) => {
    loading.value = true
    clearError()

    try {
      const { data: created, error: createError } = await supabase
        .from('warehouse_products')
        .insert([data])
        .select()
        .single()

      if (createError) throw createError

      const wp = created as WarehouseProductType
      warehouseProducts.value.unshift(wp)
      currentWarehouseProduct.value = wp
      return wp
    } catch (err) {
      handleError(err, 'Failed to create warehouse product')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const updateWarehouseProduct = async (id: number, updateData: UpdateWarehouseProductData) => {
    loading.value = true
    clearError()

    try {
      const { data: updated, error: updateError } = await supabase
        .from('warehouse_products')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      const wp = updated as WarehouseProductType
      const idx = warehouseProducts.value.findIndex((p) => p.id === id)
      if (idx !== -1) warehouseProducts.value[idx] = wp
      if (currentWarehouseProduct.value?.id === id) currentWarehouseProduct.value = wp
      return wp
    } catch (err) {
      handleError(err, `Failed to update warehouse product with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const deleteWarehouseProduct = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { error: deleteError } = await supabase
        .from('warehouse_products')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      removeWarehouseProductLocal(id)
      return true
    } catch (err) {
      handleError(err, `Failed to delete warehouse product with ID ${id}`)
      return false
    } finally {
      loading.value = false
    }
  }

  const resetStore = () => {
    warehouseProducts.value = []
    currentWarehouseProduct.value = undefined
    loading.value = false
    error.value = ''
    realtimeChannel.value = null
    realtimeStatus.value = 'idle'
  }

  return {
    // State
    warehouseProducts,
    currentWarehouseProduct,
    loading,
    error,
    realtimeChannel,
    realtimeStatus,

    // Computed
    warehouseProductsCount,
    hasWarehouseProducts,
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Realtime
    startRealtime,
    stopRealtime,

    // CRUD
    fetchWarehouseProducts,
    fetchWarehouseProductById,
    fetchWarehouseProductByProductAndWarehouse,
    createWarehouseProduct,
    updateWarehouseProduct,
    deleteWarehouseProduct,

    // Misc
    clearError,
    resetStore,
    upsertWarehouseProductLocal,
    removeWarehouseProductLocal,
  }
})
