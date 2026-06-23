import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'

const toast = useToast()

// Matches `public.outlets` schema
export type OutletType = {
  id: number
  created_at: string
  name: string | null
  code: string | null
  type: string | null
  is_active: boolean | null
}

export type CreateOutletData = {
  name?: string | null
  code?: string | null
  type?: string | null
  is_active?: boolean | null
}

export type UpdateOutletData = Partial<CreateOutletData>

type FetchOutletsOptions = {
  search?: string
  orderBy?: keyof Pick<OutletType, 'created_at' | 'name'>
  ascending?: boolean
  activeOnly?: boolean
}

export const useOutletsDataStore = defineStore('outletsData', () => {

  // ─── State ──────────────────────────────────────────────────────────────────

  const outlets: Ref<OutletType[]> = ref([])
  const currentOutlet: Ref<OutletType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // ─── Realtime ────────────────────────────────────────────────────────────────

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // ─── Computed ────────────────────────────────────────────────────────────────

  const outletsCount = computed(() => outlets.value.length)
  const hasOutlets = computed(() => outlets.value.length > 0)
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')

  const activeOutlets = computed(() => outlets.value.filter(o => o.is_active))

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }

  const clearError = () => {
    error.value = ''
  }

  // ─── Realtime ────────────────────────────────────────────────────────────────

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value

    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel('outlets-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outlets' }, (payload) => {
        const eventType = payload.eventType

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          upsertOutletLocal(payload.new as OutletType)
        }

        if (eventType === 'DELETE') {
          const id = (payload.old as Partial<OutletType>)?.id
          if (typeof id === 'number') removeOutletLocal(id)
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

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const fetchOutlets = async (options: FetchOutletsOptions = {}) => {
    loading.value = true
    clearError()

    try {
      const { search, orderBy = 'name', ascending = true, activeOnly = false } = options

      let q = supabase.from('outlets').select('*')

      if (activeOnly) {
        q = q.eq('is_active', true)
      }

      if (search?.trim()) {
        const s = search.trim()
        q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%`)
      }

      q = q.order(orderBy as string, { ascending })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      outlets.value = (data || []) as OutletType[]
      return outlets.value

    } catch (err) {
      handleError(err, 'Failed to fetch outlets')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchOutletById = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('outlets')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      currentOutlet.value = data as OutletType
      return currentOutlet.value

    } catch (err) {
      handleError(err, `Failed to fetch outlet with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const createOutlet = async (outletData: CreateOutletData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: createError } = await supabase
        .from('outlets')
        .insert([outletData])
        .select()
        .single()

      if (createError) throw createError

      const created = data as OutletType
      outlets.value.unshift(created)
      currentOutlet.value = created
      toast.success('Outlet created successfully')
      return created

    } catch (err) {
      handleError(err, 'Failed to create outlet')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const updateOutlet = async (id: number, updateData: UpdateOutletData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: updateError } = await supabase
        .from('outlets')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      const updated = data as OutletType
      const index = outlets.value.findIndex(o => o.id === id)
      if (index !== -1) outlets.value[index] = updated
      if (currentOutlet.value?.id === id) currentOutlet.value = updated
      toast.success('Outlet updated successfully')
      return updated

    } catch (err) {
      handleError(err, `Failed to update outlet with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const deleteOutlet = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { error: deleteError } = await supabase
        .from('outlets')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      removeOutletLocal(id)
      toast.success('Outlet deleted successfully')
      return true

    } catch (err) {
      handleError(err, `Failed to delete outlet with ID ${id}`)
      return false
    } finally {
      loading.value = false
    }
  }

  // ─── Local Helpers ────────────────────────────────────────────────────────────

  const upsertOutletLocal = (outlet: OutletType) => {
    const idx = outlets.value.findIndex(o => o.id === outlet.id)
    if (idx === -1) outlets.value.unshift(outlet)
    else outlets.value[idx] = outlet

    if (currentOutlet.value?.id === outlet.id) currentOutlet.value = outlet
  }

  const removeOutletLocal = (id: number) => {
    outlets.value = outlets.value.filter(o => o.id !== id)
    if (currentOutlet.value?.id === id) currentOutlet.value = undefined
  }

  const resetStore = () => {
    outlets.value = []
    currentOutlet.value = undefined
    loading.value = false
    error.value = ''
  }

  // ─── Expose ───────────────────────────────────────────────────────────────────

  return {
    // State
    outlets,
    currentOutlet,
    loading,
    error,

    // Computed
    outletsCount,
    hasOutlets,
    activeOutlets,
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Actions
    fetchOutlets,
    fetchOutletById,
    createOutlet,
    updateOutlet,
    deleteOutlet,
    clearError,
    resetStore,

    // Realtime
    startRealtime,
    stopRealtime,

    // Local helpers
    upsertOutletLocal,
    removeOutletLocal,
  }
})
