import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import type { VersionLog, VersionLogDisplay, UnreadUserVersionLog } from '@/stores/versionLogsData'

const toast = useToast()

// ─── Types matching the public.user_versions_logs table ────────────────
// id: bigint pk, created_at: timestamptz, user_id: uuid (auth.users),
// version_logs_id: bigint (version_logs.id), is_read: boolean
export type UserVersionLogRow = {
  id: number
  created_at: string
  user_id: string | null
  version_logs_id: number | null
  is_read: boolean | null
}

// PostgREST can return a many-to-one embedded relationship as either a
// single object or an array, so accept both shapes.
export type UserVersionLogJoinRow = UserVersionLogRow & {
  version_logs:
    | { id: number; contents: unknown }[]
    | { id: number; contents: unknown }
    | null
}

export type CreateUserVersionLogData = {
  user_id?: string | null
  version_logs_id?: number | null
  is_read?: boolean | null
}

export type UpdateUserVersionLogData = Partial<CreateUserVersionLogData>

type FetchUserVersionLogsOptions = {
  userId?: string | null
  isRead?: boolean
  versionLogId?: number | null
  includeVersionLog?: boolean
}

export const useUserVersionLogsDataStore = defineStore('userVersionLogsData', () => {
  // ─── States ───────────────────────────────────────────────────────
  const rows: Ref<UserVersionLogRow[]> = ref([])
  const currentRow: Ref<UserVersionLogRow | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // ─── User version log read-state (for the post-login dialog) ─────
  const pendingVersionLogs: Ref<UnreadUserVersionLog[]> = ref([])
  const versionLogDialogVisible = ref(false)
  const versionLogConfirming = ref(false)
  const versionLogError: Ref<string> = ref('')

  // ─── Computed ─────────────────────────────────────────────────────
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const rowsCount = computed(() => rows.value.length)
  const hasRows = computed(() => rows.value.length > 0)
  const hasPendingVersionLogs = computed(() => pendingVersionLogs.value.length > 0)
  const hasVersionLogError = computed(() => versionLogError.value !== '')

  // ─── Helpers ──────────────────────────────────────────────────────
  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }
  const clearError = () => {
    error.value = ''
  }

  const upsertLocal = (row: UserVersionLogRow) => {
    const idx = rows.value.findIndex((r) => r.id === row.id)
    if (idx === -1) rows.value.unshift(row)
    else rows.value[idx] = row
  }
  const removeLocal = (id: number) => {
    rows.value = rows.value.filter((r) => r.id !== id)
    if (currentRow.value?.id === id) currentRow.value = undefined
  }

  // ─── Fetch all user version logs (optional filters) ───────────────
  const fetchUserVersionLogs = async (
    options: FetchUserVersionLogsOptions = {},
  ): Promise<UserVersionLogRow[]> => {
    loading.value = true
    clearError()
    try {
      const { userId, isRead, versionLogId, includeVersionLog } = options
      let q = supabase
        .from('user_versions_logs')
        .select(
          includeVersionLog
            ? 'id, created_at, user_id, version_logs_id, is_read, version_logs(id, contents)'
            : '*',
        )
      if (userId) q = q.eq('user_id', userId)
      if (isRead !== undefined) q = q.eq('is_read', isRead)
      if (versionLogId !== undefined) q = q.eq('version_logs_id', versionLogId)
      q = q.order('created_at', { ascending: false })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      rows.value = ((data || []) as unknown as UserVersionLogRow[]).filter((r) => r != null)
      return rows.value
    } catch (err) {
      handleError(err, 'Failed to fetch user version logs')
      return []
    } finally {
      loading.value = false
    }
  }

  // ─── Fetch a single user version log by id ────────────────────────
  const fetchUserVersionLogById = async (id: number): Promise<UserVersionLogRow | null> => {
    loading.value = true
    clearError()
    try {
      const { data, error: fetchError } = await supabase
        .from('user_versions_logs')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (fetchError) throw fetchError
      currentRow.value = (data as UserVersionLogRow | null) ?? undefined
      return currentRow.value ?? null
    } catch (err) {
      handleError(err, 'Failed to fetch user version log')
      return null
    } finally {
      loading.value = false
    }
  }

  // ─── Create a new user version log ────────────────────────────────
  const createUserVersionLog = async (
    data: CreateUserVersionLogData,
  ): Promise<UserVersionLogRow | undefined> => {
    loading.value = true
    clearError()
    try {
      const { data: created, error: createError } = await supabase
        .from('user_versions_logs')
        .insert([data])
        .select()
        .single()
      if (createError) throw createError
      upsertLocal(created as UserVersionLogRow)
      currentRow.value = created as UserVersionLogRow
      toast.success('User version log created.')
      return created as UserVersionLogRow
    } catch (err) {
      handleError(err, 'Failed to create user version log')
      toast.error('Failed to create user version log.')
      return undefined
    } finally {
      loading.value = false
    }
  }

  // ─── Update a user version log by id ──────────────────────────────
  const updateUserVersionLog = async (
    id: number,
    data: UpdateUserVersionLogData,
  ): Promise<UserVersionLogRow | undefined> => {
    loading.value = true
    clearError()
    try {
      const { data: updated, error: updateError } = await supabase
        .from('user_versions_logs')
        .update(data)
        .eq('id', id)
        .select()
        .single()
      if (updateError) throw updateError
      upsertLocal(updated as UserVersionLogRow)
      currentRow.value = updated as UserVersionLogRow
      toast.success('User version log updated.')
      return updated as UserVersionLogRow
    } catch (err) {
      handleError(err, 'Failed to update user version log')
      toast.error('Failed to update user version log.')
      return undefined
    } finally {
      loading.value = false
    }
  }

  // ─── Delete a user version log by id ──────────────────────────────
  const deleteUserVersionLog = async (id: number): Promise<boolean> => {
    loading.value = true
    clearError()
    try {
      const { error: deleteError } = await supabase
        .from('user_versions_logs')
        .delete()
        .eq('id', id)
      if (deleteError) throw deleteError
      removeLocal(id)
      toast.success('User version log deleted.')
      return true
    } catch (err) {
      handleError(err, 'Failed to delete user version log')
      toast.error('Failed to delete user version log.')
      return false
    } finally {
      loading.value = false
    }
  }

  // ─── Mark a user version log (or all for a version log) as read ───
  const markAsRead = async (
    id: number,
    options: { versionLogId?: number | null } = {},
  ): Promise<boolean> => {
    loading.value = true
    clearError()
    try {
      let q = supabase.from('user_versions_logs').update({ is_read: true })
      if (options.versionLogId !== undefined) q = q.eq('version_logs_id', options.versionLogId)
      else q = q.eq('id', id)
      const { data, error: updateError } = await q.select()
      if (updateError) throw updateError

      const updated = (data || []) as UserVersionLogRow[]
      updated.forEach((r) => upsertLocal(r))
      return true
    } catch (err) {
      handleError(err, 'Failed to mark user version log as read')
      toast.error('Failed to mark user version log as read.')
      return false
    } finally {
      loading.value = false
    }
  }

  // ─── Mark a user version log as unread ────────────────────────────
  const markAsUnread = async (id: number): Promise<boolean> => {
    loading.value = true
    clearError()
    try {
      const { data, error: updateError } = await supabase
        .from('user_versions_logs')
        .update({ is_read: false })
        .eq('id', id)
        .select()
      if (updateError) throw updateError

      const updated = (data || []) as UserVersionLogRow[]
      updated.forEach((r) => upsertLocal(r))
      return true
    } catch (err) {
      handleError(err, 'Failed to mark user version log as unread')
      toast.error('Failed to mark user version log as unread.')
      return false
    } finally {
      loading.value = false
    }
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

  // Normalize the joined version_logs (array or single object) to one record
  const resolveVersionLog = (row: UserVersionLogJoinRow) => {
    const embedded = row.version_logs
    if (Array.isArray(embedded)) return embedded.length ? embedded[0] : null
    return embedded
  }

  // ─── Fetch the logged-in user's unread version logs ──────────────
  // Queries user_versions_logs where is_read = false, joined with the
  // version_logs contents. Shows the dialog when any exist.
  const fetchUnreadVersionLogs = async (userId?: string | null): Promise<boolean> => {
    pendingVersionLogs.value = []
    versionLogError.value = ''

    if (!userId) {
      versionLogDialogVisible.value = false
      return false
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('user_versions_logs')
        .select('id, created_at, user_id, version_logs_id, is_read, version_logs(id, contents)')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      const rows = (data as UserVersionLogJoinRow[] | null) || []

      pendingVersionLogs.value = rows
        .filter((row) => resolveVersionLog(row)?.contents != null)
        .map((row) => ({
          id: row.id,
          versionLogId: row.version_logs_id,
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

  // ─── Mark all currently pending version logs as read for the user ──
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
        .from('user_versions_logs')
        .update({ is_read: true })
        .in('id', ids)

      if (updateError) throw updateError

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

  // ─── Close the version logs dialog without marking logs as read ──
  const closeVersionLogsDialog = () => {
    versionLogDialogVisible.value = false
  }

  // ─── Reset store to initial state ─────────────────────────────────
  const resetStore = () => {
    rows.value = []
    currentRow.value = undefined
    loading.value = false
    error.value = ''
    pendingVersionLogs.value = []
    versionLogDialogVisible.value = false
    versionLogConfirming.value = false
    versionLogError.value = ''
  }

  return {
    // State
    rows,
    currentRow,
    loading,
    error,
    pendingVersionLogs,
    versionLogDialogVisible,
    versionLogConfirming,
    versionLogError,

    // Computed
    isLoading,
    hasError,
    rowsCount,
    hasRows,
    hasPendingVersionLogs,
    hasVersionLogError,

    // Actions
    fetchUserVersionLogs,
    fetchUserVersionLogById,
    createUserVersionLog,
    updateUserVersionLog,
    deleteUserVersionLog,
    markAsRead,
    markAsUnread,
    fetchUnreadVersionLogs,
    markVersionLogsAsRead,
    closeVersionLogsDialog,
    clearError,
    resetStore,
  }
})

