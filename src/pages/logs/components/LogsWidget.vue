<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLogsDataStore } from '@/stores/logsData'
import type { LogType } from '@/stores/logsData'
import { getReferenceLabel, getActionColor, getModuleColor } from '../composables/logsHelpers'
import { useDisplay } from 'vuetify'
import { formatCurrency, formatDate } from '@/utils/helpers'
import LogsViewDialog from '@/pages/logs/dialogs/LogsViewDialog.vue'

const logsStore = useLogsDataStore()
const { logs, loading, logsCount, hasLogs, isLoading, hasError, error } = storeToRefs(logsStore)
const { mobile } = useDisplay()

// ─── Props ─────────────────────────────────────────────────────────────
const props = defineProps<{
  moduleFilter?: string | null
}>()

// ─── Data-table state ──────────────────────────────────────────────────
const itemsPerPage = ref(10)
const page = ref(1)
const serverItems = ref<LogType[]>([])
const totalLogs = ref(0)
const loadingTable = ref(false)

const search = ref('')
const statusFilter = ref('all')
const selectedLog = ref<LogType | null>(null)
const showDialog = ref(false)

// Headers definition (ID column intentionally omitted)
const headers = computed(() => [
  { title: 'Action', key: 'action', sortable: true, width: 120 },
  {
    title: 'Description',
    key: 'description',
    sortable: false,
    width: mobile.value ? 200 : 300,
  },
  { title: 'Module', key: 'module', sortable: true, width: 140 },
  { title: 'Created By', key: 'created_by_email', sortable: true, width: 180 },
  { title: 'Reference No.', key: 'reference_no', sortable: false, width: 130 },
  { title: 'Created At', key: 'created_at', sortable: true, width: 160 },
  { title: 'Actions', key: 'actions', sortable: false, width: 100 },
])

// Load server data handler (v-data-table-server callback)
const loadItems = async ({ page: p, itemsPerPage: ipp, sortBy: sb }: any) => {
  loadingTable.value = true

  // Fetch all logs from Supabase (store already sorts desc by created_at)
  await logsStore.fetchLogs()

  // Deduplicate by transaction_id, keeping only the latest log per transaction
  const latestByTransaction = new Map<number, LogType>()
  logs.value.forEach((log) => {
    const txId = log.transaction_id
    if (txId) {
      const existing = latestByTransaction.get(txId)
      if (!existing || log.id > existing.id) {
        latestByTransaction.set(txId, log)
      }
    }
  })

  // Use deduplicated logs
  let sorted = Array.from(latestByTransaction.values())

  // Apply module filter if set
  if (props.moduleFilter) {
    sorted = sorted.filter((log) => log.module?.toLowerCase() === props.moduleFilter!.toLowerCase())
  }

  // Apply status filter
  if (statusFilter.value !== 'all') {
    sorted = sorted.filter((log) => {
      const status = (log.status ?? '').toLowerCase()
      if (statusFilter.value === 'active') return status !== 'complete' && status !== ''
      if (statusFilter.value === 'complete') return status === 'complete'
      return true
    })
  }

  if (sb.length) {
    const { key, order } = sb[0]
    sorted.sort((a: any, b: any) => {
      const aVal = a[key] ?? ''
      const bVal = b[key] ?? ''
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal
      return order === 'desc' ? -cmp : cmp
    })
  }

  // Apply client-side filter on search (across all columns)
  if (search.value.trim()) {
    const term = search.value.toLowerCase()
    sorted = sorted.filter(
      (log) =>
        log.action?.toLowerCase().includes(term) ||
        log.description?.toLowerCase().includes(term) ||
        log.module?.toLowerCase().includes(term) ||
        log.created_by_email?.toLowerCase().includes(term) ||
        log.reference_no?.toLowerCase().includes(term),
    )
  }

  totalLogs.value = sorted.length

  // Paginate
  const start = (p - 1) * ipp
  serverItems.value = sorted.slice(start, start + ipp)

  loadingTable.value = false
}

// Open dialog to show all logs for a transaction
const openLogsDialog = async (log: any) => {
  if (!log.transaction_id) return

  // Fetch all logs for this transaction
  await logsStore.fetchLogs()
  const txLogs = logs.value.filter((l: any) => l.transaction_id === log.transaction_id)

  // Sort by id descending to show latest first
  txLogs.sort((a: any, b: any) => b.id - a.id)

  selectedLog.value = txLogs[0] || log
  showDialog.value = true
}

// Close dialog
const closeDialog = () => {
  showDialog.value = false
  selectedLog.value = null
}

// Computed property for dialog logs
const dialogLogs = computed<LogType[]>(() => {
  if (!selectedLog.value) return []
  return logs.value.filter((l) => l.transaction_id === selectedLog.value!.transaction_id)
})

// Handle page updates from mobile widget
const handlePageUpdate = (newPage: number) => {
  loadItems({ page: newPage, itemsPerPage: itemsPerPage.value, sortBy: [] })
}

onMounted(async () => {
  await loadItems({ page: 1, itemsPerPage: 10, sortBy: [] })
})

// Watch moduleFilter to reload when filter changes
watch(() => props.moduleFilter, () => {
  page.value = 1
  loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
})

// Watch search to reload when search term changes (reacts on every keystroke)
watch(search, () => {
  page.value = 1
  loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
})

// Watch statusFilter to reload when filter changes
watch(statusFilter, () => {
  page.value = 1
  loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
})
</script>

<template>
  <v-card>
    <!-- Toolbar -->
    <v-card-title class="d-flex align-center flex-wrap ga-2 pa-3">
      <v-icon icon="mdi-text-box-search-outline" class="mr-1" color="primary"></v-icon>
      <span class="text-h6 font-weight-bold">Activity Logs</span>
      <v-spacer></v-spacer>
      <template v-if="!mobile">
        <v-select
          v-model="statusFilter"
          :items="[
            { title: 'All', value: 'all' },
            { title: 'Active', value: 'active' },
            { title: 'Complete', value: 'complete' },
          ]"
          item-title="title"
          item-value="value"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 160px"
          class="mr-2"
        />
        <v-text-field
          v-model="search"
          label="Search logs..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="comfortable"
          hide-details
          class="max-width-300"
          clearable
          @click:clear="page = 1; loadItems({ page: 1, itemsPerPage, sortBy: [] })"
        ></v-text-field>
        <v-btn
          icon="mdi-refresh"
          variant="text"
          :loading="loadingTable"
          @click="page = 1; loadItems({ page: 1, itemsPerPage, sortBy: [] })"
        ></v-btn>
      </template>
      <template v-else>
        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="loadingTable"
          @click="page = 1; loadItems({ page: 1, itemsPerPage, sortBy: [] })"
        ></v-btn>
      </template>
    </v-card-title>

    <!-- Mobile search -->
    <div v-if="mobile" class="px-3 pb-2">
      <v-select
        v-model="statusFilter"
        :items="[
          { title: 'All', value: 'all' },
          { title: 'Active', value: 'active' },
          { title: 'Complete', value: 'complete' },
        ]"
        item-title="title"
        item-value="value"
        variant="outlined"
        density="compact"
        hide-details
        class="mb-2"
      />
      <v-text-field
        v-model="search"
        label="Search logs..."
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        hide-details
        clearable
          @click:clear="page = 1; loadItems({ page: 1, itemsPerPage, sortBy: [] })"
      ></v-text-field>
    </div>

    <v-divider></v-divider>

    <!-- Error state -->
    <v-alert
      v-if="hasError"
      type="error"
      variant="tonal"
      class="ma-3"
      closable
      @click:close="logsStore.clearError"
    >
      {{ error }}
    </v-alert>

    <v-card-text class="pa-0">
      <!-- Desktop table -->
      <v-data-table-server
        v-if="!mobile"
        v-model:items-per-page="itemsPerPage"
        v-model:page="page"
        :headers="headers"
        :items="serverItems"
        :items-length="totalLogs"
        :loading="loadingTable"
        :items-per-page-options="[5, 10, 15, 20, 25, 50, 100]"
        loading-text="Loading logs..."
        hover
        density="comfortable"
        @update:options="loadItems"
      >
        <!-- Action column -->
        <template #[`item.action`]="{ value }">
          <v-chip
            :color="getActionColor(value)"
            size="small"
            variant="tonal"
            class="text-capitalize font-weight-medium"
          >
            {{ value || '—' }}
          </v-chip>
        </template>

        <!-- Description column -->
        <template #[`item.description`]="{ value }">
          <span class="text-body-2">{{ value || '—' }}</span>
        </template>

        <!-- Module column -->
        <template #[`item.module`]="{ value }">
          <v-chip
            :color="getModuleColor(value)"
            size="small"
            variant="outlined"
            class="text-capitalize"
          >
            {{ value || '—' }}
          </v-chip>
        </template>

        <!-- Created By (email) column -->
        <template #[`item.created_by_email`]="{ value }">
          <span class="text-body-2">{{ value || '—' }}</span>
        </template>

        <!-- Reference No. column -->
        <template #[`item.reference_no`]="{ item }">
          <v-chip
            v-if="getReferenceLabel(item)"
            size="small"
            color="primary"
            variant="tonal"
            class="font-weight-medium"
          >
            {{ getReferenceLabel(item) }}
          </v-chip>
          <v-chip v-else size="small" color="warning" variant="tonal" class="font-weight-medium">
            On Review
          </v-chip>
        </template>

        <!-- Created At column -->
        <template #[`item.created_at`]="{ value }">
          <span class="text-caption">{{ formatDate(value) }}</span>
        </template>

        <!-- Actions column -->
        <template #[`item.actions`]="{ item }">
          <v-btn
            icon="mdi-history"
            size="small"
            variant="outlined"
            color="primary"
            @click="openLogsDialog(item)"
          >
            <v-icon size="16">mdi-text-box-search-outline</v-icon>
            <v-tooltip activator="parent" location="top">View transaction history</v-tooltip>
          </v-btn>
        </template>
      </v-data-table-server>

      <!-- Mobile cards -->
      <template v-else>
        <MobileLogsWidget
          :server-items="serverItems"
          :loading-table="loadingTable"
          :total-logs="totalLogs"
          :items-per-page="itemsPerPage"
          :page="page"
          @view-history="openLogsDialog"
          @update:page="handlePageUpdate"
        />
      </template>

      <!-- Logs Detail Dialog (outside v-if/v-else to avoid template errors) -->
      <LogsViewDialog v-model="showDialog" :logs="dialogLogs" @close="closeDialog" />
    </v-card-text>
  </v-card>
</template>

<style scoped>
.max-width-300 {
  max-width: 300px;
}
.border-b-sm {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}
</style>
