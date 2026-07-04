import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'

const toast = useToast()

export type AgentType = {
  id: number
  created_at: string
  name: string | null
  contact_no: string | null
  email: string | null
  area: string | null
  commission_rate: number | null
  is_active: boolean | null
  notes: string | null
}

export type CreateAgentData = {
  name?: string | null
  contact_no?: string | null
  email?: string | null
  area?: string | null
  commission_rate?: number | null
  is_active?: boolean | null
  notes?: string | null
}

export type UpdateAgentData = CreateAgentData

type FetchAgentsOptions = {
  search?: string
  activeOnly?: boolean
}

export const useAgentsDataStore = defineStore('agentsData', () => {
  const agents: Ref<AgentType[]> = ref([])
  const currentAgent: Ref<AgentType | undefined> = ref(undefined)
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

  const upsertLocal = (a: AgentType) => {
    const idx = agents.value.findIndex((x) => x.id === a.id)
    if (idx === -1) agents.value.unshift(a)
    else agents.value[idx] = a
  }
  const removeLocal = (id: number) => {
    agents.value = agents.value.filter((x) => x.id !== id)
  }

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value
    realtimeStatus.value = 'subscribing'
    const channel = supabase
      .channel('agents-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          upsertLocal(payload.new as AgentType)
        } else if (payload.eventType === 'DELETE') {
          const id = (payload.old as Partial<AgentType>)?.id
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

  const fetchAgents = async (options: FetchAgentsOptions = {}) => {
    loading.value = true
    clearError()
    try {
      const { search, activeOnly } = options
      let q = supabase.from('agents').select('*')
      if (activeOnly) q = q.eq('is_active', true)
      if (search?.trim()) {
        const s = search.trim().replace(/,/g, '')
        q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,area.ilike.%${s}%`)
      }
      q = q.order('created_at', { ascending: false })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      agents.value = (data || []) as AgentType[]
      return agents.value
    } catch (err) {
      handleError(err, 'Failed to fetch agents')
      return []
    } finally {
      loading.value = false
    }
  }

  const createAgent = async (data: CreateAgentData) => {
    loading.value = true
    clearError()
    try {
      const { data: created, error: createError } = await supabase
        .from('agents').insert([data]).select().single()
      if (createError) throw createError
      upsertLocal(created as AgentType)
      toast.success('Agent created.')
      return created as AgentType
    } catch (err) {
      handleError(err, 'Failed to create agent')
      toast.error('Failed to create agent.')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const updateAgent = async (id: number, data: UpdateAgentData) => {
    loading.value = true
    clearError()
    try {
      const { data: updated, error: updateError } = await supabase
        .from('agents').update(data).eq('id', id).select().single()
      if (updateError) throw updateError
      upsertLocal(updated as AgentType)
      toast.success('Agent updated.')
      return updated as AgentType
    } catch (err) {
      handleError(err, 'Failed to update agent')
      toast.error('Failed to update agent.')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const deleteAgent = async (id: number) => {
    loading.value = true
    clearError()
    try {
      const { error: deleteError } = await supabase.from('agents').delete().eq('id', id)
      if (deleteError) throw deleteError
      removeLocal(id)
      toast.success('Agent deleted.')
      return true
    } catch (err) {
      handleError(err, 'Failed to delete agent')
      toast.error('Failed to delete agent.')
      return false
    } finally {
      loading.value = false
    }
  }

  const resetStore = () => {
    agents.value = []
    currentAgent.value = undefined
    loading.value = false
    error.value = ''
  }

  return {
    agents, currentAgent, loading, error,
    isLoading, hasError,
    fetchAgents, createAgent, updateAgent, deleteAgent,
    startRealtime, stopRealtime, clearError, resetStore,
  }
})
