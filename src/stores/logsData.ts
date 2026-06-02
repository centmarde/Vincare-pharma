import { computed, ref } from "vue";
import type { Ref } from "vue";
import { defineStore } from "pinia";
import axios from "axios";

// Version log types matching the JSON structure
export type VersionLogChange = {
  change: string;
  type: string;
}

export type VersionLog = {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

export type VersionLogsData = {
  versions: VersionLog[];
}

// Transformed log type for display (similar to the original LogType)
export type LogType = {
  id: string;
  created_at: string;
  title: string;
  version: string;
  description: string;
  type: string;
}

type LogsState = {
  logs: LogType[];
  loading: boolean;
  error: string;
}

export const useLogsDataStore = defineStore("logsData", () => {
  // States
  const logs: Ref<LogType[]> = ref([]);
  const loading = ref(false);
  const error: Ref<string> = ref("");


  // Computed properties
  const logsCount = computed(() => logs.value.length);
  const hasLogs = computed(() => logs.value.length > 0);
  const isLoading = computed(() => loading.value);
  const hasError = computed(() => error.value !== "");

  // Helper function to handle errors
  const handleError = (err: any, defaultMessage: string) => {
    const errorMessage = err?.message || defaultMessage;
    error.value = errorMessage;
  };

  // Clear error state
  const clearError = () => {
    error.value = "";
  };

  // Transform version logs to log format
  const transformVersionLogsToLogs = (versionLogs: VersionLogsData): LogType[] => {
    const transformedLogs: LogType[] = [];

    versionLogs.versions.forEach((versionLog, versionIndex) => {
      // Create a single log entry per version with all changes combined
      const combinedDescription = versionLog.changes.join('\n• ');

      // Determine the primary type based on the majority of changes
      const types = versionLog.changes.map(change => {
        if (change.toLowerCase().includes('feat') || change.toLowerCase().includes('feature')) {
          return 'feature';
        } else if (change.toLowerCase().includes('fix')) {
          return 'fix';
        }
        return 'update';
      });

      // Get the most common type, or default to 'update'
      const typeCount = types.reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const primaryType = Object.entries(typeCount).reduce((a, b) =>
        typeCount[a[0]] > typeCount[b[0]] ? a : b
      )[0];

      transformedLogs.push({
        id: versionLog.version,
        created_at: versionLog.date + 'T00:00:00.000Z', // Convert date to ISO format
        title: versionLog.title,
        version: versionLog.version,
        description: `• ${combinedDescription}`,
        type: primaryType
      });
    });

    return transformedLogs;
  };  // Fetch all logs from version-logs.json
  const fetchLogs = async () => {
    loading.value = true;
    clearError();

    try {
      const response = await axios.get('/data/version-logs.json');
      const versionLogsData: VersionLogsData = response.data;

      const transformedLogs = transformVersionLogsToLogs(versionLogsData);
      logs.value = transformedLogs;
    } catch (err) {
      handleError(err, "Failed to fetch logs");
    } finally {
      loading.value = false;
    }
  };

  // Fetch logs by type
  const fetchLogsByType = async (logType: string) => {
    loading.value = true;
    clearError();

    try {
      const response = await axios.get('/data/version-logs.json');
      const versionLogsData: VersionLogsData = response.data;

      const transformedLogs = transformVersionLogsToLogs(versionLogsData);
      logs.value = transformedLogs.filter(log => log.type === logType);
    } catch (err) {
      handleError(err, `Failed to fetch logs of type "${logType}"`);
    } finally {
      loading.value = false;
    }
  };

  // Fetch logs by date range
  const fetchLogsByDateRange = async (startDate: string, endDate: string) => {
    loading.value = true;
    clearError();

    try {
      const response = await axios.get('/data/version-logs.json');
      const versionLogsData: VersionLogsData = response.data;

      const transformedLogs = transformVersionLogsToLogs(versionLogsData);
      const start = new Date(startDate);
      const end = new Date(endDate);

      logs.value = transformedLogs.filter(log => {
        const logDate = new Date(log.created_at);
        return logDate >= start && logDate <= end;
      });
    } catch (err) {
      handleError(err, "Failed to fetch logs for the specified date range");
    } finally {
      loading.value = false;
    }
  };

  // Get logs by version
  const getLogsByVersion = computed(() => {
    return (version: string) => logs.value.filter(log => log.version === version);
  });

  // Get logs by type (computed filter)
  const getLogsByType = computed(() => {
    return (logType: string) => logs.value.filter(log => log.type === logType);
  });

  // Get recent logs (last N logs)
  const getRecentLogs = computed(() => {
    return (limit: number = 10) => logs.value.slice(0, limit);
  });

  // Search logs by title or description
  const searchLogs = computed(() => {
    return (searchTerm: string) => {
      if (!searchTerm.trim()) return logs.value;

      const term = searchTerm.toLowerCase();
      return logs.value.filter(log =>
        log.title.toLowerCase().includes(term) ||
        log.description.toLowerCase().includes(term)
      );
    };
  });

  // Clear logs state
  const clearLogs = () => {
    logs.value = [];
    clearError();
  };

  // Reset store to initial state
  const resetStore = () => {
    logs.value = [];
    loading.value = false;
    error.value = "";
  };

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
    getLogsByVersion,
    getLogsByType,
    getRecentLogs,
    searchLogs,

    // Actions
    fetchLogs,
    fetchLogsByType,
    fetchLogsByDateRange,
    clearError,
    clearLogs,
    resetStore,
  };
});
