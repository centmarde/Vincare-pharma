import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

// ─── Types matching version-logs.json ─────────────────────────────────
export type VersionLog = {
  version: string
  date: string
  title: string
  changes: string[]
}

export type VersionLogsData = {
  versions: VersionLog[]
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

  // ─── Computed ───────────────────────────────────────────────────
  const logsCount = computed(() => logs.value.length)
  const hasLogs = computed(() => logs.value.length > 0)
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')

  // ─── Helpers ────────────────────────────────────────────────────
  const handleError = (err: unknown, defaultMessage: string) => {
    const errorMessage = err instanceof Error ? err.message : defaultMessage
    error.value = errorMessage
  }

  const clearError = () => {
    error.value = ''
  }

  // ─── Transform version logs to display format ───────────────────
  const transformVersionLogs = (versionLogs: VersionLogsData): VersionLogDisplay[] => {
    return versionLogs.versions.map((versionLog) => {
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
    })
  }

  // ─── Actions ────────────────────────────────────────────────────

  // Fetch version logs from version-logs.json via axios
  const fetchLogs = async () => {
    loading.value = true
    clearError()

    try {
      const response = await axios.get<VersionLogsData>('/data/version-logs.json')
      const versionLogsData: VersionLogsData = response.data

      logs.value = transformVersionLogs(versionLogsData)
    } catch (err) {
      handleError(err, 'Failed to fetch version logs')
    } finally {
      loading.value = false
    }
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

    // Actions
    fetchLogs,
    getLogsByVersion,
    getRecentLogs,
    clearError,
    clearLogs,
    resetStore,
  }
})