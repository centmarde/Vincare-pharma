import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useAuthUserStore } from './authUser'
import { useToast } from 'vue-toastification'

const toast = useToast()

// ─── Types matching the new normalized schema ──────────────────────────
// public.logs:    id, created_at, action, description, module, updated_at, updated_by
// public.log_items: id, created_at, transaction_id, logs_id, user_id

export type LogType = {
  id:              number
  created_at:      string
  action:          string | null
  description:     string | null
  module:          string | null
  updated_at:      string | null
  updated_by:      string | null
  // Joined from log_items (via fetch)
  transaction_id?: number | null
  user_id?:        string | null
  user_email?:     string | null
  reference_no?:   string | null
}

export type LogItemType = {
  id:              number
  created_at:      string
  transaction_id:  number | null
  logs_id:         number | null
  user_id:         string | null
}

export type CreateLogData = {
  action?:         string
  description?:    string
  module?:         string
  transaction_id?: number
  user_id?:        string
  updated_by?:     string
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

  // ─── User email resolver ─────────────────────────────────────────
  /**
   * Resolve a user's email from authStore.users by user_id.
   * Ensures users are loaded if not already available.
   */
  async function resolveUserEmail(userId: string | null): Promise<string | null> {
    if (!userId) return null
    if (!authStore.users.length) {
      await authStore.getAllUsers()
    }
    return authStore.users.find((u: any) => u.id === userId)?.email ?? null
  }

  // ─── Shared flatten helper ───────────────────────────────────────
  async function flattenLogs(rawData: any[]): Promise<LogType[]> {
    const resolved = await Promise.all(
      (rawData || []).map(async (log: any) => {
        const items = log.log_items ?? []
        const firstItem = items.length > 0 ? items[0] : {}
        const userId = firstItem.user_id ?? null
        const userEmail = await resolveUserEmail(userId)

        // Resolve reference_no from the nested transactions relation
        const transactions = log.log_items?.[0]?.transactions
        const referenceNo = transactions?.reference_no ?? null

        return {
          id:              log.id,
          created_at:      log.created_at,
          action:          log.action,
          description:     log.description,
          module:          log.module,
          updated_at:      log.updated_at,
          updated_by:      log.updated_by ?? null,
          transaction_id:  firstItem.transaction_id ?? null,
          user_id:         userId,
          user_email:      userEmail,
          reference_no:    referenceNo,
        }
      }),
    )
    return resolved as LogType[]
  }

  // Fetch all logs with related log_items (user_id, transaction_id)
  const fetchLogs = async () => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('logs')
        .select(`
          *,
          log_items (
            transaction_id,
            user_id,
            transactions (
              reference_no
            )
          )
        `)
        .order('created_at', { ascending: false })

      if (fetchError) {
        handleError(fetchError, 'Failed to fetch logs')
        return
      }

      logs.value = await flattenLogs(data || [])
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
        .select(`
          *,
          log_items (
            transaction_id,
            user_id
          )
        `)
        .or(`action.ilike.%${logType}%,module.ilike.%${logType}%`)
        .order('created_at', { ascending: false })

      if (fetchError) {
        handleError(fetchError, `Failed to fetch logs of type "${logType}"`)
        return
      }

      logs.value = await flattenLogs(data || [])
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
        .select(`
          *,
          log_items (
            transaction_id,
            user_id
          )
        `)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false })

      if (fetchError) {
        handleError(fetchError, 'Failed to fetch logs for the specified date range')
        return
      }

      logs.value = await flattenLogs(data || [])
    } catch (err) {
      handleError(err, 'Failed to fetch logs for the specified date range')
    } finally {
      loading.value = false
    }
  }

  // Create a new log entry + log_items row (many-to-many connector)
  // If user_id is provided in logData, it will be used directly.
  // Otherwise, falls back to authStore.getCurrentUser().
  const createLog = async (logData: CreateLogData) => {
    loading.value = true
    clearError()

    try {
      let userId = logData.user_id
      if (!userId) {
        const { user, error: authError } = await authStore.getCurrentUser()
        if (authError || !user) {
          toast.error('User not authenticated.')
          loading.value = false
          return undefined
        }
        userId = user.id
      }

      // Resolve the acting user's email for updated_by
      if (!authStore.users.length) {
        await authStore.getAllUsers()
      }
      const actingUser = authStore.users.find((u: any) => u.id === userId)
      const updatedBy = logData.updated_by ?? actingUser?.email ?? userId

      // 1. Insert into logs table
      const { data: logRecord, error: createError } = await supabase
        .from('logs')
        .insert([{
          action:      logData.action ?? null,
          description: logData.description ?? null,
          module:      logData.module ?? null,
          updated_at:  logData.updated_at ?? new Date().toISOString(),
          updated_by:  updatedBy,
        }])
        .select('id')
        .single()

      if (createError || !logRecord) {
        handleError(createError, 'Failed to create log')
        toast.error('Failed to create log entry.')
        loading.value = false
        return undefined
      }

      const logId = logRecord.id

      // 2. Insert into log_items (many-to-many connector)
      const { error: itemError } = await supabase
        .from('log_items')
        .insert([{
          logs_id:        logId,
          transaction_id: logData.transaction_id ?? null,
          user_id:        userId,
        }])

      if (itemError) {
        handleError(itemError, 'Failed to link log to transaction/user')
        toast.warning('Log created but linkage failed.')
      }

      // 3. Fetch the created log with its joined data
      const { data: fullLog, error: fetchError } = await supabase
        .from('logs')
        .select(`
          *,
          log_items (
            transaction_id,
            user_id
          )
        `)
        .eq('id', logId)
        .single()

      if (fetchError || !fullLog) {
        // Fallback: return basic log data
        const created: LogType = {
          id:             logId,
          created_at:     new Date().toISOString(),
          action:         logData.action ?? null,
          description:    logData.description ?? null,
          module:         logData.module ?? null,
          updated_at:     logData.updated_at ?? null,
          updated_by:     updatedBy ?? null,
          transaction_id: logData.transaction_id ?? null,
          user_id:        userId ?? null,
          user_email:     actingUser?.email ?? null,
        }
        logs.value.unshift(created)
        toast.success('Log entry created successfully.')
        loading.value = false
        return created
      }

      // Flatten the joined result
      const items = fullLog.log_items ?? []
      const firstItem = items.length > 0 ? items[0] : {}
      const created: LogType = {
        id:              fullLog.id,
        created_at:      fullLog.created_at,
        action:          fullLog.action,
        description:     fullLog.description,
        module:          fullLog.module,
        updated_at:      fullLog.updated_at,
        updated_by:      fullLog.updated_by ?? null,
        transaction_id:  firstItem.transaction_id ?? null,
        user_id:         firstItem.user_id ?? null,
        user_email:      actingUser?.email ?? null,
      }

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

  // Update an existing log (only the logs table row)
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
      if (index !== -1) {
        logs.value[index] = { ...logs.value[index], ...updated }
      }
      toast.success('Log entry updated successfully.')
      loading.value = false
      return {
        ...updated,
        transaction_id: logs.value.find(l => l.id === id)?.transaction_id ?? null,
        user_id: logs.value.find(l => l.id === id)?.user_id ?? null,
      } as LogType
    } catch (err) {
      handleError(err, `Failed to update log with ID ${id}`)
      toast.error('Failed to update log entry.')
      loading.value = false
      return undefined
    }
  }

  // Delete a log (cascades to log_items via FK constraint)
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