<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLogsDataStore } from '@/stores/logsData'
import type { LogType } from '@/stores/logsData'
import { getReferenceLabel, getActionColor, getModuleColor } from '../composables/logsHelpers'
import { useDisplay } from 'vuetify'
import { formatCurrency, formatDate } from '@/utils/helpers'
import LogsViewDialog from '@/pages/logs/dialogs/LogsViewDialog.vue'
import AdvanceFilterDialog from '@/pages/logs/dialogs/AdvanceFilterDialog.vue'
import type { AdvanceFilters } from '@/pages/logs/dialogs/AdvanceFilterDialog.vue'
import MobileLogsWidget from '@/pages/logs/mobile/LogsWidget.vue'

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

// Advance filter state
const showAdvanceFilter = ref(false)
const advanceFilters = ref<AdvanceFilters>({
  datePreset: 'all',
  fromDate: null,
  toDate: null,
  specificDay: null,
  specificMonth: null,
  specificYear: null,
  modules: [],
  actions: [],
  status: 'all',
  transactionTypes: [],
  createdByEmail: '',
  search: '',
})

// Date range filters
const fromDate = ref<string | null>(null)
const toDate = ref<string | null>(null)

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
    if (props.moduleFilter === 'reorder') {
      sorted = sorted.filter(
        (log) =>
          log.module?.toLowerCase() === 'reorder' &&
          (log.transaction_type === 'reorder_lowstock' ||
            log.transaction_type === 'reorder_outofstock'),
      )
    } else {
      sorted = sorted.filter(
        (log) => log.module?.toLowerCase() === props.moduleFilter!.toLowerCase(),
      )
    }
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

  // Apply date range filter
  if (fromDate.value) {
    const from = new Date(fromDate.value)
    from.setHours(0, 0, 0, 0)
    sorted = sorted.filter((log) => {
      const logDate = new Date(log.created_at)
      return logDate >= from
    })
  }
  if (toDate.value) {
    const to = new Date(toDate.value)
    to.setHours(23, 59, 59, 999)
    sorted = sorted.filter((log) => {
      const logDate = new Date(log.created_at)
      return logDate <= to
    })
  }

  // ── Apply advance filters ──────────────────────────────────────────
  const af = advanceFilters.value

  // Advance date presets
  if (af.datePreset !== 'all') {
    if (af.datePreset === 'today') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      sorted = sorted.filter((log) => {
        const d = new Date(log.created_at)
        return d >= today && d < tomorrow
      })
    } else if (af.datePreset === 'this_week') {
      const now = new Date()
      const dayOfWeek = now.getDay()
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
      const monday = new Date(now.setDate(diff))
      monday.setHours(0, 0, 0, 0)
      sorted = sorted.filter((log) => new Date(log.created_at) >= monday)
    } else if (af.datePreset === 'this_month') {
      const now = new Date()
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      firstDay.setHours(0, 0, 0, 0)
      sorted = sorted.filter((log) => new Date(log.created_at) >= firstDay)
    } else if (af.datePreset === 'this_year') {
      const now = new Date()
      const firstDay = new Date(now.getFullYear(), 0, 1)
      firstDay.setHours(0, 0, 0, 0)
      sorted = sorted.filter((log) => new Date(log.created_at) >= firstDay)
    } else if (af.datePreset === 'custom') {
      if (af.fromDate) {
        const from = new Date(af.fromDate)
        from.setHours(0, 0, 0, 0)
        sorted = sorted.filter((log) => new Date(log.created_at) >= from)
      }
      if (af.toDate) {
        const to = new Date(af.toDate)
        to.setHours(23, 59, 59, 999)
        sorted = sorted.filter((log) => new Date(log.created_at) <= to)
      }
    } else if (af.datePreset === 'specific_day') {
      if (af.specificDay) {
        const dayStart = new Date(af.specificDay)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(dayStart)
        dayEnd.setDate(dayEnd.getDate() + 1)
        sorted = sorted.filter((log) => {
          const d = new Date(log.created_at)
          return d >= dayStart && d < dayEnd
        })
      }
    } else if (af.datePreset === 'specific_month') {
      if (af.specificMonth) {
        const year = af.specificYear || new Date().getFullYear()
        const monthStart = new Date(year, af.specificMonth - 1, 1)
        monthStart.setHours(0, 0, 0, 0)
        const monthEnd = new Date(year, af.specificMonth, 0, 23, 59, 59, 999)
        sorted = sorted.filter((log) => {
          const d = new Date(log.created_at)
          return d >= monthStart && d <= monthEnd
        })
      }
    } else if (af.datePreset === 'specific_year') {
      if (af.specificYear) {
        const yearStart = new Date(af.specificYear, 0, 1)
        yearStart.setHours(0, 0, 0, 0)
        const yearEnd = new Date(af.specificYear, 11, 31, 23, 59, 59, 999)
        sorted = sorted.filter((log) => {
          const d = new Date(log.created_at)
          return d >= yearStart && d <= yearEnd
        })
      }
    }
  }

  // Advance module filter
  if (af.modules.length > 0) {
    sorted = sorted.filter((log) => log.module && af.modules.includes(log.module))
  }

  // Advance action filter
  if (af.actions.length > 0) {
    sorted = sorted.filter((log) => log.action && af.actions.includes(log.action))
  }

  // Advance status filter
  if (af.status !== 'all') {
    sorted = sorted.filter((log) => {
      const status = (log.status ?? '').toLowerCase()
      if (af.status === 'active') return status !== 'complete' && status !== ''
      if (af.status === 'complete') return status === 'complete'
      return true
    })
  }

  // Advance transaction type filter
  if (af.transactionTypes.length > 0) {
    sorted = sorted.filter(
      (log) => log.transaction_type && af.transactionTypes.includes(log.transaction_type),
    )
  }

  // Advance created by email filter
  if (af.createdByEmail) {
    sorted = sorted.filter((log) => log.created_by_email === af.createdByEmail)
  }

  // Advance search text filter
  if (af.search.trim()) {
    const term = af.search.toLowerCase()
    sorted = sorted.filter(
      (log) =>
        log.action?.toLowerCase().includes(term) ||
        log.description?.toLowerCase().includes(term) ||
        log.module?.toLowerCase().includes(term) ||
        log.created_by_email?.toLowerCase().includes(term) ||
        log.reference_no?.toLowerCase().includes(term),
    )
  }
  // ── End advance filters ─────────────────────────────────────────────

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

  await logsStore.fetchLogs()
  const txLogs = logs.value.filter((l: any) => l.transaction_id === log.transaction_id)
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

// Watch search to reload when search term changes
watch(search, () => {
  page.value = 1
  loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
})

// Watch statusFilter to reload when filter changes
watch(statusFilter, () => {
  page.value = 1
  loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
})

// Watch date filters to reload when they change
watch([fromDate, toDate], () => {
  page.value = 1
  loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
})

// Handle advance filter apply
const handleAdvanceFilterApply = (filters: AdvanceFilters) => {
  advanceFilters.value = { ...filters }
  page.value = 1
  loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
}

// Clear all filters back to defaults
const clearAllFilters = () => {
  search.value = ''
  statusFilter.value = 'all'
  fromDate.value = null
  toDate.value = null
  advanceFilters.value = {
    datePreset: 'all',
    fromDate: null,
    toDate: null,
    specificDay: null,
    specificMonth: null,
    specificYear: null,
    modules: [],
    actions: [],
    status: 'all',
    transactionTypes: [],
    createdByEmail: '',
    search: '',
  }
  page.value = 1
  loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
}
</script>

<template>
  <v-card>
    <!-- Filters toolbar -->
    <v-card-item>
      <template v-if="!mobile">
        <div class="d-flex align-center ga-2 flex-wrap">
          <v-menu :close-on-content-click="false">
            <template #activator="{ props: menuProps }">
              <v-text-field
                v-model="fromDate"
                v-bind="menuProps"
                label="From"
                variant="outlined"
                density="compact"
                hide-details
                clearable
                readonly
                style="max-width: 160px"
              ></v-text-field>
            </template>
            <v-date-picker v-model="fromDate" control-variant="modal"></v-date-picker>
          </v-menu>
          <v-menu :close-on-content-click="false">
            <template #activator="{ props: menuProps }">
              <v-text-field
                v-model="toDate"
                v-bind="menuProps"
                label="To"
                variant="outlined"
                density="compact"
                hide-details
                clearable
                readonly
                style="max-width: 160px"
              ></v-text-field>
            </template>
            <v-date-picker v-model="toDate" control-variant="modal"></v-date-picker>
          </v-menu>
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
            style="max-width: 120px"
          />
          <v-text-field
            v-model="search"
            label="Search logs..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 160px"
            clearable
            @click:clear="page = 1; loadItems({ page: 1, itemsPerPage, sortBy: [] })"
          ></v-text-field>
          <v-tooltip text="Advanced Filters" location="top">
            <template #activator="{ props: tp }">
              <v-btn
                v-bind="tp"
                icon="mdi-tune-vertical-variant"
                variant="text"
                size="small"
                color="primary"
                @click="showAdvanceFilter = true"
              ></v-btn>
            </template>
          </v-tooltip>
          <v-tooltip text="Clear all filters" location="top">
            <template #activator="{ props: tp }">
              <v-btn
                v-bind="tp"
                icon="mdi-filter-remove"
                variant="text"
                size="small"
                color="error"
                @click="clearAllFilters"
              ></v-btn>
            </template>
          </v-tooltip>
          <v-btn
            icon="mdi-refresh"
            variant="text"
            size="small"
            :loading="loadingTable"
            @click="page = 1; loadItems({ page: 1, itemsPerPage, sortBy: [] })"
          ></v-btn>
        </div>
      </template>
      <template v-else>
        <div class="d-flex align-center ga-1 flex-wrap">
          <v-menu :close-on-content-click="false">
            <template #activator="{ props: menuProps }">
              <v-text-field
                v-model="fromDate"
                v-bind="menuProps"
                label="From"
                variant="outlined"
                density="compact"
                hide-details
                clearable
                readonly
                class="flex-1-1"
              ></v-text-field>
            </template>
            <v-date-picker v-model="fromDate" control-variant="modal"></v-date-picker>
          </v-menu>
          <v-menu :close-on-content-click="false">
            <template #activator="{ props: menuProps }">
              <v-text-field
                v-model="toDate"
                v-bind="menuProps"
                label="To"
                variant="outlined"
                density="compact"
                hide-details
                clearable
                readonly
                class="flex-1-1"
              ></v-text-field>
            </template>
            <v-date-picker v-model="toDate" control-variant="modal"></v-date-picker>
          </v-menu>
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
            style="max-width: 100px"
          />
          <v-tooltip text="Advanced Filters" location="top">
            <template #activator="{ props: tp }">
              <v-btn
                v-bind="tp"
                icon="mdi-tune-vertical-variant"
                variant="text"
                size="small"
                color="primary"
                @click="showAdvanceFilter = true"
              ></v-btn>
            </template>
          </v-tooltip>
          <v-tooltip text="Clear all filters" location="top">
            <template #activator="{ props: tp }">
              <v-btn
                v-bind="tp"
                icon="mdi-filter-remove"
                variant="text"
                size="small"
                color="error"
                @click="clearAllFilters"
              ></v-btn>
            </template>
          </v-tooltip>
          <v-btn
            icon="mdi-refresh"
            variant="text"
            size="small"
            :loading="loadingTable"
            @click="page = 1; loadItems({ page: 1, itemsPerPage, sortBy: [] })"
          ></v-btn>
        </div>
        <v-text-field
          v-model="search"
          label="Search logs..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          class="mt-1"
          @click:clear="page = 1; loadItems({ page: 1, itemsPerPage, sortBy: [] })"
        ></v-text-field>
      </template>
    </v-card-item>

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

        <template #[`item.description`]="{ value }">
          <span class="text-body-2">{{ value || '—' }}</span>
        </template>

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

        <template #[`item.created_by_email`]="{ value }">
          <span class="text-body-2">{{ value || '—' }}</span>
        </template>

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

        <template #[`item.created_at`]="{ value }">
          <span class="text-caption">{{ formatDate(value) }}</span>
        </template>

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

      <!-- Logs Detail Dialog -->
      <LogsViewDialog v-model="showDialog" :logs="dialogLogs" @close="closeDialog" />

      <!-- Advance Filter Dialog -->
      <AdvanceFilterDialog
        v-model="showAdvanceFilter"
        :initial-filters="advanceFilters"
        @apply="handleAdvanceFilterApply"
        @close="showAdvanceFilter = false"
      />
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
.flex-1-1 {
  flex: 1 1 0;
}
</style>
