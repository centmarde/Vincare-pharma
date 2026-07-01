import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'

const toast = useToast()

// Branches are DATA, not code. No logic anywhere may key off `code` — behaviour
// is driven by `channel` ('pos' | 'ethical') and the outlet's `id`, so renaming
// or adding a branch (e.g. "Exelmed Cagayan") never requires a code change.
export type OutletChannel = 'pos' | 'ethical'

export type OutletType = {
  id: number
  created_at: string
  code: string
  name: string
  channel: OutletChannel
  region: string | null
  is_active: boolean
}

export type CreateOutletData = {
  code: string
  name: string
  channel: OutletChannel
  region?: string | null
  is_active?: boolean
}

export type UpdateOutletData = Partial<CreateOutletData>

type FetchOutletsOptions = {
  channel?: OutletChannel
  activeOnly?: boolean
}

export const useOutletsDataStore = defineStore('outletsData', () => {
  const outlets: Ref<OutletType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }
  const clearError = () => { error.value = '' }

  const upsertLocal = (o: OutletType) => {
    const idx = outlets.value.findIndex((x) => x.id === o.id)
    if (idx === -1) outlets.value.push(o)
    else outlets.value[idx] = o
  }
  const removeLocal = (id: number) => {
    outlets.value = outlets.value.filter((x) => x.id !== id)
  }

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value
    realtimeStatus.value = 'subscribing'
    const channel = supabase
      .channel('outlets-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outlets' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          upsertLocal(payload.new as OutletType)
        } else if (payload.eventType === 'DELETE') {
          const id = (payload.old as Partial<OutletType>)?.id
          if (typeof id === 'number') removeLocal(id)
        }
      })
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

  const fetchOutlets = async (options: FetchOutletsOptions = {}) => {
    loading.value = true
    clearError()
    try {
      const { channel, activeOnly } = options
      let q = supabase.from('outlets').select('*')
      if (channel) q = q.eq('channel', channel)
      if (activeOnly) q = q.eq('is_active', true)
      q = q.order('name', { ascending: true })

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

  const createOutlet = async (data: CreateOutletData) => {
    loading.value = true
    clearError()
    try {
      const { data: created, error: createError } = await supabase
        .from('outlets').insert([data]).select().single()
      if (createError) throw createError
      upsertLocal(created as OutletType)
      toast.success('Branch created.')
      return created as OutletType
    } catch (err) {
      handleError(err, 'Failed to create branch')
      toast.error('Failed to create branch.')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const updateOutlet = async (id: number, data: UpdateOutletData) => {
    loading.value = true
    clearError()
    try {
      const { data: updated, error: updateError } = await supabase
        .from('outlets').update(data).eq('id', id).select().single()
      if (updateError) throw updateError
      upsertLocal(updated as OutletType)
      toast.success('Branch updated.')
      return updated as OutletType
    } catch (err) {
      handleError(err, 'Failed to update branch')
      toast.error('Failed to update branch.')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const deleteOutlet = async (id: number) => {
    loading.value = true
    clearError()
    try {
      const { error: deleteError } = await supabase.from('outlets').delete().eq('id', id)
      if (deleteError) throw deleteError
      removeLocal(id)
      toast.success('Branch deleted.')
      return true
    } catch (err) {
      handleError(err, 'Failed to delete branch')
      toast.error('Failed to delete branch. It may already have stock or transactions — deactivate it instead.')
      return false
    } finally {
      loading.value = false
    }
  }

  const resetStore = () => {
    outlets.value = []
    loading.value = false
    error.value = ''
  }

  return {
    outlets, loading, error,
    isLoading, hasError,
    fetchOutlets, createOutlet, updateOutlet, deleteOutlet,
    startRealtime, stopRealtime, clearError, resetStore,
  }
})
