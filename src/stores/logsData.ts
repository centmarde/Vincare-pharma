import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useAuthUserStore } from './authUser'
import { useToast } from 'vue-toastification'

const toast = useToast()

// ─── Types matching the public.logs table schema ─────────────────────────
// Table columns:
//   id, created_at, user_id, action, description,
//   trasaction_id (typo in schema), module, transaction_id, updated_at
export type LogType = {
  id:             number
  created_at:     string
  user_id:        string | null
  action:         string | null
  description:    string | null
  trasaction_id:  number | null   // typo column from schema (missing 'n')
  module:         string | null
  transaction_id: number | null
  updated_at:     string | null
}

export type CreateLogData = {
  user_id?:        string
  action?:         string
  description?:    string
  trasaction_id?:  number
  transaction_id?: number
  module?:         string
  updated_at?:     string
}

export type UpdateLogData = Partial<CreateLogData>

// ─── Store ──────────────────────────────────────────────────────────────────

export const useLogsDataStore = defineStore('logsData', () => {
  const authStore = useAuthUserStore()

  // ─── States ─────────────────────────────────────────────────────────
  const logs: Ref<LogType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // ─── Computed properties ────────────────────────────────────────────
  const logsCount = computed(() => logs.value.length)
  const hasLogs = computed(() => logs.value.length > 0)
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')

  // ─── Helper functions ───────────────────────────────────────────────
  const handleError = (err: unknown, defaultMessage: string) => {
    const errorMessage = err instanceof Error ? err.message : defaultMessage
    error.value = errorMessage
  }

  const clearError = () => {
    error.value = ''
  }

  // ─── CRUD Actions ───────────────────────────────────────────────────

  // Fetch all logs
  const fetchLogs = async () => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('logs')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) {
        handleError(fetchError, 'Failed to fetch logs')
        return
      }

      logs.value = (data || []) as LogType[]
    } catch (err) {
      handleError(err, 'Failed to fetch logs')
    } finally {
      loading.value = false
    }
  }

  // Fetch logs by type (action / module)
  const fetchLogsByType = async (logType: string) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('logs')
        .select('*')
        .or(`action.ilike.%${logType}%,module.ilike.%${logType}%`)
        .order('created_at', { ascending: false })

      if (fetchError) {
        handleError(fetchError, `Failed to fetch logs of type "${logType}"`)
        return
      }

      logs.value = (data || []) as LogType[]
    } catch (err) {
      handleError(err, `Failed to fetch logs of type "${logType}"`)
    } finally {
      loading.value = false
    }
  }

  // Fetch logs by date range
  const fetchLogsByDateRange = async (startDate: string, endDate: string) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('logs')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false })

      if (fetchError) {
        handleError(fetchError, 'Failed to fetch logs for the specified date range')
        return
      }

      logs.value = (data || []) as LogType[]
    } catch (err) {
      handleError(err, 'Failed to fetch logs for the specified date range')
    } finally {
      loading.value = false
    }
  }

  // Create a new log entry
  const createLog = async (logData: CreateLogData) => {
    loading.value = true
    clearError()

    try {
      const { user, error: authError } = await authStore.getCurrentUser()
      if (authError || !user) {
        toast.error('User not authenticated.')
        loading.value = false
        return undefined
      }

      const { data, error: createError } = await supabase
        .from('logs')
        .insert([{
          user_id:        logData.user_id ?? user.id,
          action:         logData.action ?? null,
          description:    logData.description ?? null,
          transaction_id: logData.transaction_id ?? null,
          module:         logData.module ?? null,
          updated_at:     logData.updated_at ?? new Date().toISOString(),
        }])
        .select('*')
        .single()

      if (createError) {
        handleError(createError, 'Failed to create log')
        toast.error('Failed to create log entry.')
        loading.value = false
        return undefined
      }

      const created = data as LogType
      logs.value.unshift(created)
      toast.success('Log entry created successfully.')
      loading.value = false
      return created
    } catch (err) {
      handleError(err, 'Failed to create log')
      toast.error('Failed to create log entry.')
      loading.value = false
      return undefined
    }
  }

  // Update an existing log
  const updateLog = async (id: number, updateData: UpdateLogData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: updateError } = await supabase
        .from('logs')
        .update({
          ...updateData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single()

      if (updateError) {
        handleError(updateError, `Failed to update log with ID ${id}`)
        toast.error('Failed to update log entry.')
        loading.value = false
        return undefined
      }

      const updated = data as LogType
      const index = logs.value.findIndex(l => l.id === id)
      if (index !== -1) logs.value[index] = updated
      toast.success('Log entry updated successfully.')
      loading.value = false
      return updated
    } catch (err) {
      handleError(err, `Failed to update log with ID ${id}`)
      toast.error('Failed to update log entry.')
      loading.value = false
      return undefined
    }
  }

  // Delete a log
  const deleteLog = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { error: deleteError } = await supabase
        .from('logs')
        .delete()
        .eq('id', id)

      if (deleteError) {
        handleError(deleteError, `Failed to delete log with ID ${id}`)
        toast.error('Failed to delete log entry.')
        loading.value = false
        return false
      }

      logs.value = logs.value.filter(l => l.id !== id)
      toast.success('Log entry deleted successfully.')
      loading.value = false
      return true
    } catch (err) {
      handleError(err, `Failed to delete log with ID ${id}`)
      toast.error('Failed to delete log entry.')
      loading.value = false
      return false
    }
  }

  // Get logs by transaction_id
  const getLogsByTransaction = computed(() => {
    return (transactionId: number) =>
      logs.value.filter((log) => log.transaction_id === transactionId)
  })

  // Get logs by module
  const getLogsByModule = computed(() => {
    return (module: string) =>
      logs.value.filter((log) => log.module?.toLowerCase() === module.toLowerCase())
  })

  // Get logs by user_id
  const getLogsByUser = computed(() => {
    return (userId: string) =>
      logs.value.filter((log) => log.user_id === userId)
  })

  // Get logs by action
  const getLogsByAction = computed(() => {
    return (action: string) =>
      logs.value.filter((log) => log.action?.toLowerCase() === action.toLowerCase())
  })

  // Get recent logs (last N logs)
  const getRecentLogs = computed(() => {
    return (limit: number = 10) => logs.value.slice(0, limit)
  })

  // Search logs by action, description, or module
  const searchLogs = computed(() => {
    return (searchTerm: string) => {
      if (!searchTerm.trim()) return logs.value

      const term = searchTerm.toLowerCase()
      return logs.value.filter(
        (log) =>
          log.action?.toLowerCase().includes(term) ||
          log.description?.toLowerCase().includes(term) ||
          log.module?.toLowerCase().includes(term),
      )
    }
  })

  // Clear logs state
  const clearLogs = () => {
    logs.value = []
    clearError()
  }

  // Reset store to initial state
  const resetStore = () => {
    logs.value = []
    loading.value = false
    error.value = ''
  }

  return {
    // State
    logs,
    loading,
    error,

    // Computed
    logsCount,
    hasLogs,
    isLoading,
    hasError,
    getLogsByTransaction,
    getLogsByModule,
    getLogsByUser,
    getLogsByAction,
    getRecentLogs,
    searchLogs,

    // Actions
    fetchLogs,
    fetchLogsByType,
    fetchLogsByDateRange,
    createLog,
    updateLog,
    deleteLog,
    clearError,
    clearLogs,
    resetStore,
  }
})