<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLogsDataStore } from '@/stores/logsData'
import type { LogType } from '@/stores/logsData'
import { useDisplay } from 'vuetify'
import { formatCurrency } from '@/utils/helpers'
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
  
  if (sb.length) {
    const { key, order } = sb[0]
    sorted.sort((a: any, b: any) => {
      const aVal = a[key] ?? ''
      const bVal = b[key] ?? ''
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal
      return order === 'desc' ? -cmp : cmp
    })
  }

  // Apply client-side filter on search
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

// Format date
const formatDate = (dateString: string | null) => {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Action chip color
const getActionColor = (action: string | null) => {
  if (!action) return 'grey'
  const lower = action.toLowerCase()
  if (lower.includes('submit') || lower.includes('create')) return 'success'
  if (lower.includes('update') || lower.includes('edit')) return 'info'
  if (lower.includes('delete') || lower.includes('remove')) return 'error'
  if (lower.includes('approve')) return 'primary'
  if (lower.includes('reject')) return 'warning'
  return 'grey'
}

// Module chip color — matching LogsCard module colors
const getModuleColor = (module: string | null) => {
  if (!module) return 'grey'
  const lower = module.toLowerCase()
  if (lower.includes('purchase_requisition') || lower.includes('requisition')) return 'purple'
  if (lower.includes('purchase_order') || lower.includes('po') || lower.includes('order')) return 'indigo'
  if (lower.includes('stock_in') || lower.includes('stock in')) return 'teal'
  if (lower.includes('stock_out') || lower.includes('stock out')) return 'orange'
  if (lower.includes('sale') && !lower.includes('sales_return') && !lower.includes('return')) return 'green'
  if (lower.includes('transfer')) return 'blue'
  if (lower.includes('expense')) return 'red'
  if (lower.includes('purchase_return')) return 'purple'
  if (lower.includes('sales_return') || lower.includes('return')) return 'pink'
  return 'grey'
}

onMounted(async () => {
  await loadItems({ page: 1, itemsPerPage: 10, sortBy: [] })
})

// Watch moduleFilter to reload when filter changes
watch(() => props.moduleFilter, () => {
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
        <v-text-field
          v-model="search"
          label="Search logs..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="comfortable"
          hide-details
          class="max-width-300"
          clearable
          @keyup.enter="page = 1; loadItems({ page: 1, itemsPerPage, sortBy: [] })"
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
      <v-text-field
        v-model="search"
        label="Search logs..."
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        hide-details
        clearable
        @keyup.enter="page = 1; loadItems({ page: 1, itemsPerPage, sortBy: [] })"
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
        <template #[`item.reference_no`]="{ value }">
          <v-chip
            v-if="value"
            size="small"
            color="primary"
            variant="tonal"
            class="font-weight-medium"
          >
            {{ value }}
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
        <div v-if="serverItems.length > 0" class="pa-3">
          <v-card
            v-for="log in serverItems"
            :key="log.id"
            class="mb-3"
            rounded="lg"
            elevation="2"
          >
            <!-- Card header: action + module chips -->
            <v-card-title class="d-flex align-center ga-2 pa-3 pb-1">
              <v-avatar size="32" :color="getActionColor(log.action)" variant="tonal">
                <v-icon size="16" color="white">
                  {{
                    log.action?.toLowerCase().includes('submit')
                      ? 'mdi-send'
                      : log.action?.toLowerCase().includes('create')
                        ? 'mdi-plus-circle'
                        : log.action?.toLowerCase().includes('update') ||
                            log.action?.toLowerCase().includes('edit')
                          ? 'mdi-pencil'
                          : log.action?.toLowerCase().includes('delete') ||
                              log.action?.toLowerCase().includes('remove')
                            ? 'mdi-delete'
                            : log.action?.toLowerCase().includes('approve')
                              ? 'mdi-check-circle'
                              : log.action?.toLowerCase().includes('reject')
                                ? 'mdi-close-circle'
                                : 'mdi-circle-small'
                  }}
                </v-icon>
              </v-avatar>
              <div class="d-flex flex-wrap ga-1">
                <v-chip
                  :color="getActionColor(log.action)"
                  size="x-small"
                  variant="tonal"
                  class="text-capitalize font-weight-medium"
                >
                  {{ log.action || '—' }}
                </v-chip>
                <v-chip
                  :color="getModuleColor(log.module)"
                  size="x-small"
                  variant="outlined"
                  class="text-capitalize"
                >
                  {{ log.module || '—' }}
                </v-chip>
              </div>
            </v-card-title>

            <!-- Card body: description -->
            <v-card-text class="pa-3 pt-1">
              <div class="text-body-2 mb-2">{{ log.description || '—' }}</div>
              <v-divider class="mb-2"></v-divider>
              <div class="d-flex flex-wrap align-center ga-3 text-caption text-medium-emphasis">
                <div v-if="log.created_by_email" class="d-flex align-center ga-1">
                  <v-icon size="12">mdi-account</v-icon>
                  <span>{{ log.created_by_email }}</span>
                </div>
                <div v-if="log.reference_no" class="d-flex align-center ga-1">
                  <v-icon size="12">mdi-hash</v-icon>
                  <span>{{ log.reference_no }}</span>
                </div>
                <div v-else class="d-flex align-center ga-1">
                  <v-icon size="12">mdi-clock-outline</v-icon>
                  <span>On Review</span>
                </div>
                <div class="d-flex align-center ga-1">
                  <v-icon size="12">mdi-calendar</v-icon>
                  <span>{{ formatDate(log.created_at) }}</span>
                </div>
              </div>
            </v-card-text>

            <!-- Mobile action button -->
            <v-card-actions class="pa-3 pt-0">
              <v-btn
                size="small"
                variant="outlined"
                color="primary"
                block
                @click="openLogsDialog(log)"
              >
                <v-icon size="16" class="mr-1">mdi-text-box-search-outline</v-icon>
                View History
              </v-btn>
            </v-card-actions>
          </v-card>
        </div>

        <!-- Mobile empty state -->
        <div v-else-if="!loadingTable" class="text-center pa-6">
          <v-icon
            icon="mdi-text-box-search-outline"
            size="48"
            color="grey-lighten-1"
            class="mb-3"
          ></v-icon>
          <div class="text-h6 text-medium-emphasis mb-1">No logs found</div>
          <div class="text-body-2 text-medium-emphasis">No activity logs to display.</div>
        </div>

        <!-- Mobile loading -->
        <div v-if="loadingTable" class="text-center pa-6">
          <v-progress-circular indeterminate color="primary" size="32"></v-progress-circular>
          <div class="text-body-2 mt-2 text-medium-emphasis">Loading logs...</div>
        </div>

        <!-- Mobile pagination info -->
        <div
          v-if="serverItems.length > 0 && totalLogs > itemsPerPage"
          class="d-flex align-center justify-center pa-3 ga-2"
        >
          <v-btn
            icon="mdi-chevron-left"
            variant="tonal"
            size="small"
            :disabled="page <= 1"
            @click="page--; loadItems({ page: page, itemsPerPage, sortBy: [] })"
          ></v-btn>
          <span class="text-caption text-medium-emphasis">
            Page {{ page }} of {{ Math.ceil(totalLogs / itemsPerPage) }}
          </span>
          <v-btn
            icon="mdi-chevron-right"
            variant="tonal"
            size="small"
            :disabled="page >= Math.ceil(totalLogs / itemsPerPage)"
            @click="page++; loadItems({ page: page, itemsPerPage, sortBy: [] })"
          ></v-btn>
        </div>
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
