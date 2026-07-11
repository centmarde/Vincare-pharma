import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useAuthUserStore } from './authUser'
import { useToast } from 'vue-toastification'

const toast = useToast()

// ─── Types matching the public.logs table schema ──────────────────────
// id, created_at, action, description, module,
// created_by (uuid → auth.users),
// transaction_id (bigint → transactions)

export type LogType = {
  id: number
  created_at: string
  action: string | null
  description: string | null
  module: string | null
  created_by: string | null // uuid FK → auth.users
  transaction_id: number | null
  // Resolved at display time
  created_by_email?: string | null
  reference_no?: string | null
  requisition_no?: string | null  // from joined transactions
  po_no?: string | null           // from joined transactions
  status?: string | null          // from joined transactions
}

export type CreateLogData = {
  action?: string
  description?: string
  module?: string
  transaction_id?: number
  created_by?: string // uuid
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

  // ─── User email resolver ─────────────────────────────────────────
  async function resolveUserEmail(userId: string | null): Promise<string | null> {
    if (!userId) return null
    if (!authStore.users.length) {
      await authStore.getAllUsers()
    }
    return authStore.users.find((u: any) => u.id === userId)?.email ?? null
  }

  /**
   * Enrich an array of raw logs with resolved emails and reference_no.
   * Uses Promise.all for concurrent resolution.
   */
  async function enrichLogs(rawData: any[]): Promise<LogType[]> {
    // Ensure users are loaded once for the whole batch
    if (!authStore.users.length) {
      await authStore.getAllUsers()
    }

    return Promise.all(
      (rawData || []).map(async (log: any) => {
        const createdByEmail = await resolveUserEmail(log.created_by)

        // Resolve the document number from the transactions row. Each type now
        // stores its number in its own dedicated column (per-type ref-column
        // scheme); reference_no is stock_in / deferred-finance only. The type's
        // own number is preferred over po_no so an agreed in-house order's logs
        // still show IH- (it carries both inhouse_no and a minted po_no).
        const tx = log.transactions ?? {}
        const referenceNo =
          tx.reference_no ??
          tx.inhouse_no ??
          tx.ethical_no ??
          tx.sale_no ??
          tx.transfer_no ??
          tx.remittance_no ??
          tx.expense_no ??
          tx.po_no ??
          tx.requisition_no ??
          null

        return {
          id: log.id,
          created_at: log.created_at,
          action: log.action,
          description: log.description,
          module: log.module,
          created_by: log.created_by ?? null,
          transaction_id: log.transaction_id ?? null,
          created_by_email: createdByEmail,
          reference_no: referenceNo,
          requisition_no: tx.requisition_no ?? null,
          po_no: tx.po_no ?? null,
          status: tx.status ?? null,
        }
      }),
    )
  }

  // ─── CRUD Actions ───────────────────────────────────────────────────

  // Fetch all logs with joined transactions.reference_no
  const fetchLogs = async () => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('logs')
        .select(
          `
          *,
          transactions (
            reference_no,
            po_no,
            requisition_no,
            sale_no,
            transfer_no,
            remittance_no,
            inhouse_no,
            ethical_no,
            expense_no,
            status
          )
        `,
        )
        .order('created_at', { ascending: false })

      if (fetchError) {
        handleError(fetchError, 'Failed to fetch logs')
        return
      }

      logs.value = await enrichLogs(data || [])
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
        .select(
          `
          *,
          transactions (
            reference_no,
            po_no,
            requisition_no,
            sale_no,
            transfer_no,
            remittance_no,
            inhouse_no,
            ethical_no,
            expense_no
          )
        `,
        )
        .or(`action.ilike.%${logType}%,module.ilike.%${logType}%`)
        .order('created_at', { ascending: false })

      if (fetchError) {
        handleError(fetchError, `Failed to fetch logs of type "${logType}"`)
        return
      }

      logs.value = await enrichLogs(data || [])
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
        .select(
          `
          *,
          transactions (
            reference_no,
            po_no,
            requisition_no,
            sale_no,
            transfer_no,
            remittance_no,
            inhouse_no,
            ethical_no,
            expense_no
          )
        `,
        )
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false })

      if (fetchError) {
        handleError(fetchError, 'Failed to fetch logs for the specified date range')
        return
      }

      logs.value = await enrichLogs(data || [])
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
      let createdBy = logData.created_by
      if (!createdBy) {
        const { user, error: authError } = await authStore.getCurrentUser()
        if (authError || !user) {
          toast.error('User not authenticated.')
          loading.value = false
          return undefined
        }
        createdBy = user.id
      }

      const { data, error: createError } = await supabase
        .from('logs')
        .insert([
          {
            action: logData.action ?? null,
            description: logData.description ?? null,
            module: logData.module ?? null,
            transaction_id: logData.transaction_id ?? null,
            created_by: createdBy,
          },
        ])
        .select('*')
        .single()

      if (createError) {
        handleError(createError, 'Failed to create log')
        toast.error('Failed to create log entry.')
        loading.value = false
        return undefined
      }

      // Resolve emails for the single created record
      const created = data as any
      const createdByEmail = await resolveUserEmail(created.created_by)

      const log: LogType = {
        id: created.id,
        created_at: created.created_at,
        action: created.action,
        description: created.description,
        module: created.module,
        created_by: created.created_by ?? null,
        transaction_id: created.transaction_id ?? null,
        created_by_email: createdByEmail,
      }

      logs.value.unshift(log)
      // toast.success('Log entry created successfully.')
      loading.value = false
      return log
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
        .update(updateData)
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
      const index = logs.value.findIndex((l) => l.id === id)
      if (index !== -1) {
        logs.value[index] = { ...logs.value[index], ...updated }
      }
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
      const { error: deleteError } = await supabase.from('logs').delete().eq('id', id)

      if (deleteError) {
        handleError(deleteError, `Failed to delete log with ID ${id}`)
        toast.error('Failed to delete log entry.')
        loading.value = false
        return false
      }

      logs.value = logs.value.filter((l) => l.id !== id)
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

  // ─── Computed filters ──────────────────────────────────────────────

  const getLogsByTransaction = computed(() => {
    return (transactionId: number) =>
      logs.value.filter((log) => log.transaction_id === transactionId)
  })

  const getLogsByModule = computed(() => {
    return (module: string) =>
      logs.value.filter((log) => log.module?.toLowerCase() === module.toLowerCase())
  })

  const getLogsByCreatedBy = computed(() => {
    return (userId: string) => logs.value.filter((log) => log.created_by === userId)
  })

  const getLogsByAction = computed(() => {
    return (action: string) =>
      logs.value.filter((log) => log.action?.toLowerCase() === action.toLowerCase())
  })

  const getRecentLogs = computed(() => {
    return (limit: number = 10) => logs.value.slice(0, limit)
  })

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

  const clearLogs = () => {
    logs.value = []
    clearError()
  }

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
    getLogsByCreatedBy,
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
