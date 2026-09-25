import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'

// ─── Types matching the version_logs table ─────────────────────────────
export type VersionLog = {
  version: string
  date: string
  title: string
  changes: string[]
}

// Row shape from the public.version_logs table
export type VersionLogRow = {
  id: number
  created_at: string
  contents: VersionLog | null
}

// Row shape from the public.user_version_logs table
export type UserVersionLogType = {
  id: number
  created_at: string
  user_id: string
  version_log_id: number | null
  is_read: boolean | null
}

// Joined row: a user's version log record with its associated version log.
// Supabase types embedded relationships as arrays, but PostgREST can return a
// single object for a many-to-one join, so we accept either shape.
export type UserVersionLogJoinRow = {
  id: number
  created_at: string
  user_id: string
  version_log_id: number | null
  is_read: boolean | null
  version_logs:
    | { id: number; contents: VersionLog | null }[]
    | { id: number; contents: VersionLog | null }
    | null
}

// Unread version log ready for display in the dialog
export type UnreadUserVersionLog = {
  id: number
  versionLogId: number | null
  log: VersionLogDisplay
}

// Transformed log type for timeline display (same shape as the old LogType)
export type VersionLogDisplay = {
  id: string
  created_at: string
  title: string
  version: string
  description: string
  type: 'feature' | 'fix' | 'update'
}

// ─── Store ──────────────────────────────────────────────────────────────

export const useVersionLogsDataStore = defineStore('versionLogsData', () => {
  // ─── States ─────────────────────────────────────────────────────
  const logs: Ref<VersionLogDisplay[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // ─── User version log read-state (for the post-login dialog) ─────
  const pendingVersionLogs: Ref<UnreadUserVersionLog[]> = ref([])
  const versionLogDialogVisible = ref(false)
  const versionLogConfirming = ref(false)
  const versionLogError: Ref<string> = ref('')

  // ─── Computed ───────────────────────────────────────────────────
  const logsCount = computed(() => logs.value.length)
  const hasLogs = computed(() => logs.value.length > 0)
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const hasPendingVersionLogs = computed(() => pendingVersionLogs.value.length > 0)
  const hasVersionLogError = computed(() => versionLogError.value !== '')

  // ─── Helpers ────────────────────────────────────────────────────
  const handleError = (err: unknown, defaultMessage: string) => {
    const errorMessage = err instanceof Error ? err.message : defaultMessage
    error.value = errorMessage
  }

  const clearError = () => {
    error.value = ''
  }

  // ─── Transform a single version log to display format ───────────
  const transformVersionLog = (versionLog: VersionLog): VersionLogDisplay => {
    // Combine all changes into a bullet-list description
    const combinedDescription = versionLog.changes.map((c) => `• ${c}`).join('\n')

    // Determine the primary type based on change keywords
    const typeCount: Record<string, number> = { feature: 0, fix: 0, update: 0 }
    versionLog.changes.forEach((change) => {
      const lower = change.toLowerCase()
      if (lower.includes('feat') || lower.includes('feature')) {
        typeCount.feature++
      } else if (lower.includes('fix')) {
        typeCount.fix++
      } else {
        typeCount.update++
      }
    })

    // Get the most common type, default to 'update'
    const primaryType = (Object.entries(typeCount) as [string, number][]).reduce((a, b) =>
      a[1] >= b[1] ? a : b,
    )[0] as 'feature' | 'fix' | 'update'

    return {
      id: versionLog.version,
      created_at: versionLog.date + 'T00:00:00.000Z',
      title: versionLog.title,
      version: versionLog.version,
      description: combinedDescription,
      type: primaryType,
    }
  }

  // ─── Actions ────────────────────────────────────────────────────

  // Fetch version logs from the version_logs table via Supabase
  const fetchLogs = async () => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('version_logs')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      const rows = (data as VersionLogRow[] | null) || []

      logs.value = rows
        .filter((row) => row.contents !== null)
        .map((row) => transformVersionLog(row.contents as VersionLog))
    } catch (err) {
      handleError(err, 'Failed to fetch version logs')
    } finally {
      loading.value = false
    }
  }

  // Fetch unread version logs for a user (joined with version_logs contents)
  const fetchUnreadVersionLogs = async (userId?: string | null): Promise<boolean> => {
    pendingVersionLogs.value = []
    versionLogError.value = ''

    if (!userId) {
      versionLogDialogVisible.value = false
      return false
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('user_version_logs')
        .select('id, created_at, user_id, version_log_id, is_read, version_logs(id, contents)')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      const rows = (data as UserVersionLogJoinRow[] | null) || []

      // PostgREST can return the joined version_logs as either an object
      // (many-to-one) or an array, so normalize both.
      const resolveVersionLog = (row: UserVersionLogJoinRow) => {
        const embedded = row.version_logs
        if (Array.isArray(embedded)) {
          return embedded.length ? embedded[0] : null
        }
        return embedded
      }

      pendingVersionLogs.value = rows
        .filter((row) => resolveVersionLog(row)?.contents != null)
        .map((row) => ({
          id: row.id,
          versionLogId: row.version_log_id,
          log: transformVersionLog(resolveVersionLog(row)!.contents as VersionLog),
        }))

      const shouldShow = pendingVersionLogs.value.length > 0
      versionLogDialogVisible.value = shouldShow
      return shouldShow
    } catch (err) {
      versionLogError.value = err instanceof Error ? err.message : 'Failed to check version logs'
      versionLogDialogVisible.value = false
      return false
    }
  }

  // Mark all currently pending version logs as read for the current user
  const markVersionLogsAsRead = async (): Promise<boolean> => {
    const ids = pendingVersionLogs.value.map((item) => item.id)
    if (ids.length === 0) {
      versionLogDialogVisible.value = false
      return true
    }

    versionLogConfirming.value = true
    versionLogError.value = ''

    try {
      const { error: updateError } = await supabase
        .from('user_version_logs')
        .update({ is_read: true })
        .in('id', ids)

      if (updateError) {
        throw updateError
      }

      pendingVersionLogs.value = []
      versionLogDialogVisible.value = false
      return true
    } catch (err) {
      versionLogError.value = err instanceof Error ? err.message : 'Failed to update version logs'
      return false
    } finally {
      versionLogConfirming.value = false
    }
  }

  // Close the version logs dialog without marking logs as read
  const closeVersionLogsDialog = () => {
    versionLogDialogVisible.value = false
  }

  // Get logs by version
  const getLogsByVersion = (version: string) =>
    logs.value.filter((log) => log.version === version)

  // Get recent logs (last N logs)
  const getRecentLogs = (limit: number = 10) => logs.value.slice(0, limit)

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
    pendingVersionLogs.value = []
    versionLogDialogVisible.value = false
    versionLogConfirming.value = false
    versionLogError.value = ''
  }

  return {
    // State
    logs,
    loading,
    error,
    pendingVersionLogs,
    versionLogDialogVisible,
    versionLogConfirming,
    versionLogError,

    // Computed
    logsCount,
    hasLogs,
    isLoading,
    hasError,
    hasPendingVersionLogs,
    hasVersionLogError,

    // Actions
    fetchLogs,
    getLogsByVersion,
    getRecentLogs,
    fetchUnreadVersionLogs,
    markVersionLogsAsRead,
    closeVersionLogsDialog,
    clearError,
    clearLogs,
    resetStore,
  }
})