import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type WarehouseType = {
  id: number
  created_at: string
  name: string | null
  location: string | null
}

export type CreateWarehouseData = {
  name?: string | null
  location?: string | null
}

export type UpdateWarehouseData = CreateWarehouseData

type FetchWarehousesOptions = {
  search?: string
  location?: string | null
  orderBy?: keyof Pick<WarehouseType, 'created_at' | 'name' | 'location'>
  ascending?: boolean
  limit?: number
  offset?: number
}

export const useWarehousesDataStore = defineStore('warehousesData', () => {
  // State
  const warehouses: Ref<WarehouseType[]> = ref([])
  const currentWarehouse: Ref<WarehouseType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  //realtime
  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // Computed
  const warehousesCount = computed(() => warehouses.value.length)
  const hasWarehouses = computed(() => warehouses.value.length > 0)
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

  const upsertWarehouseLocal = (warehouse: WarehouseType) => {
    const idx = warehouses.value.findIndex((w) => w.id === warehouse.id)
    if (idx === -1) warehouses.value.unshift(warehouse)
    else warehouses.value[idx] = warehouse

    if (currentWarehouse.value?.id === warehouse.id) currentWarehouse.value = warehouse
  }

  const removeWarehouseLocal = (id: number) => {
    warehouses.value = warehouses.value.filter((w) => w.id !== id)
    if (currentWarehouse.value?.id === id) currentWarehouse.value = undefined
  }

  const startRealtime = () => {
    //avoid double subscriptions
    if (realtimeChannel.value) return realtimeChannel.value

    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel('custom-all-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouses' }, (payload) => {
        console.log('Change received!', payload)
        const eventType = payload.eventType

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          const row = payload.new as WarehouseType
          if (row?.id != null) upsertWarehouseLocal(row)
        }

        if (eventType === 'DELETE') {
          const row = payload.old as Partial<WarehouseType> | null
          const id = row?.id
          if (typeof id === 'number') removeWarehouseLocal(id)
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

    // Ensure it's actually removed on the client
    await supabase.removeChannel(channel)
  }

  // CRUD
  const fetchWarehouses = async (options: FetchWarehousesOptions = {}) => {
    loading.value = true
    clearError()

    try {
      const { search, location, orderBy = 'created_at', ascending = false, limit, offset } = options

      let q = supabase.from('warehouses').select('*')

      if (location && location.trim()) {
        q = q.eq('location', location.trim())
      }

      if (search && search.trim()) {
        const s = search.trim().replace(/,/g, '')
        q = q.or(`name.ilike.%${s}%,location.ilike.%${s}%`)
      }

      q = q.order(orderBy as string, { ascending })

      if (typeof limit === 'number' && typeof offset === 'number') {
        q = q.range(offset, offset + limit - 1)
      } else if (typeof limit === 'number') {
        q = q.limit(limit)
      }

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      warehouses.value = (data || []) as WarehouseType[]
      return warehouses.value
    } catch (err) {
      handleError(err, 'Failed to fetch warehouses')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchWarehouseById = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('warehouses')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      currentWarehouse.value = data as WarehouseType
      return currentWarehouse.value
    } catch (err) {
      handleError(err, `Failed to fetch warehouse with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const createWarehouse = async (warehouseData: CreateWarehouseData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: createError } = await supabase
        .from('warehouses')
        .insert([warehouseData])
        .select()
        .single()

      if (createError) throw createError

      const created = data as WarehouseType
      warehouses.value.unshift(created)
      currentWarehouse.value = created
      return created
    } catch (err) {
      handleError(err, 'Failed to create warehouse')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const updateWarehouse = async (id: number, updateData: UpdateWarehouseData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: updateError } = await supabase
        .from('warehouses')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      const updated = data as WarehouseType
      const idx = warehouses.value.findIndex((w) => w.id === id)
      if (idx !== -1) warehouses.value[idx] = updated
      if (currentWarehouse.value?.id === id) currentWarehouse.value = updated
      return updated
    } catch (err) {
      handleError(err, `Failed to update warehouse with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const deleteWarehouse = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { error: deleteError } = await supabase.from('warehouses').delete().eq('id', id)
      if (deleteError) throw deleteError

      removeWarehouseLocal(id)
      return true
    } catch (err) {
      handleError(err, `Failed to delete warehouse with ID ${id}`)
      return false
    } finally {
      loading.value = false
    }
  }

  const resetStore = () => {
    warehouses.value = []
    currentWarehouse.value = undefined
    loading.value = false
    error.value = ''
    realtimeChannel.value = null
    realtimeStatus.value = 'idle'
  }

  return {
    warehouses,
    currentWarehouse,
    loading,
    error,
    realtimeChannel,
    realtimeStatus,
    warehousesCount,
    hasWarehouses,
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Realtime actions
    startRealtime,
    stopRealtime,

    // CRUD actions
    fetchWarehouses,
    fetchWarehouseById,
    createWarehouse,
    updateWarehouse,
    deleteWarehouse,

    // misc
    clearError,
    resetStore,

    // local helpers (optional)
    upsertWarehouseLocal,
    removeWarehouseLocal,
  }
})
