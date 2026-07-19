<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useDisplay } from 'vuetify'
import { storeToRefs } from 'pinia'
import { useLogsDataStore } from '@/stores/logsData'

const logsStore = useLogsDataStore()
const { logs } = storeToRefs(logsStore)
const { mobile } = useDisplay()

// ─── Props ─────────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean
  initialFilters?: AdvanceFilters
}>()

// ─── Emits ─────────────────────────────────────────────────────────────
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  apply: [filters: AdvanceFilters]
  close: []
}>()

// ─── Types ─────────────────────────────────────────────────────────────
export interface AdvanceFilters {
  datePreset: string
  fromDate: string | null
  toDate: string | null
  specificDay: string | null
  specificMonth: number | null
  specificYear: number | null
  modules: string[]
  actions: string[]
  status: string
  transactionTypes: string[]
  createdByEmail: string
  search: string
}

// ─── Dialog model ──────────────────────────────────────────────────────
const dialog = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

// ─── Available module options (hardcoded list matching LogsCard) ───────
const availableModules = [
  'purchase_requisition',
  'purchase_order',
  'stock_in',
  'inhouse',
  'warehouse',
  'ethical',
  'pos',
]

const availableActions = computed<string[]>(() => {
  const set = new Set<string>()
  logs.value.forEach((log) => {
    if (log.action) set.add(log.action)
  })
  return Array.from(set).sort()
})

const availableTransactionTypes = computed<string[]>(() => {
  const set = new Set<string>()
  logs.value.forEach((log) => {
    if (log.transaction_type) set.add(log.transaction_type)
  })
  return Array.from(set).sort()
})

const availableEmails = computed<string[]>(() => {
  const set = new Set<string>()
  logs.value.forEach((log) => {
    if (log.created_by_email) set.add(log.created_by_email)
  })
  return Array.from(set).sort()
})

// ─── Filter state ──────────────────────────────────────────────────────
const datePreset = ref('all')
const fromDate = ref<string | null>(null)
const toDate = ref<string | null>(null)
const specificDay = ref<string | null>(null)
const specificMonth = ref<number | null>(null)
const specificYear = ref<number | null>(null)
const selectedModules = ref<string[]>([])
const selectedActions = ref<string[]>([])
const status = ref('all')
const selectedTransactionTypes = ref<string[]>([])
const createdByEmail = ref('')
const search = ref('')

// Month options
const months = [
  { title: 'January', value: 1 },
  { title: 'February', value: 2 },
  { title: 'March', value: 3 },
  { title: 'April', value: 4 },
  { title: 'May', value: 5 },
  { title: 'June', value: 6 },
  { title: 'July', value: 7 },
  { title: 'August', value: 8 },
  { title: 'September', value: 9 },
  { title: 'October', value: 10 },
  { title: 'November', value: 11 },
  { title: 'December', value: 12 },
]

// Year options (last 10 years)
const currentYear = new Date().getFullYear()
const years = Array.from({ length: 10 }, (_, i) => currentYear - i)

// Date preset options
const datePresets = [
  { title: 'All Time', value: 'all' },
  { title: 'Today', value: 'today' },
  { title: 'This Week', value: 'this_week' },
  { title: 'This Month', value: 'this_month' },
  { title: 'This Year', value: 'this_year' },
  { title: 'Custom Range', value: 'custom' },
  { title: 'Specific Day', value: 'specific_day' },
  { title: 'Specific Month', value: 'specific_month' },
  { title: 'Specific Year', value: 'specific_year' },
]

// Status options
const statusOptions = [
  { title: 'All', value: 'all' },
  { title: 'Active', value: 'active' },
  { title: 'Complete', value: 'complete' },
]

// ─── Initialize from props ────────────────────────────────────────────
const initializeFilters = () => {
  if (props.initialFilters) {
    datePreset.value = props.initialFilters.datePreset || 'all'
    fromDate.value = props.initialFilters.fromDate || null
    toDate.value = props.initialFilters.toDate || null
    specificDay.value = props.initialFilters.specificDay || null
    specificMonth.value = props.initialFilters.specificMonth || null
    specificYear.value = props.initialFilters.specificYear || null
    selectedModules.value = [...(props.initialFilters.modules || [])]
    selectedActions.value = [...(props.initialFilters.actions || [])]
    status.value = props.initialFilters.status || 'all'
    selectedTransactionTypes.value = [...(props.initialFilters.transactionTypes || [])]
    createdByEmail.value = props.initialFilters.createdByEmail || ''
    search.value = props.initialFilters.search || ''
  }
}

onMounted(() => {
  initializeFilters()
})

// ─── Watch for dialog open to refresh ──────────────────────────────────
const handleOpen = () => {
  initializeFilters()
}

// ─── Apply filters ─────────────────────────────────────────────────────
const applyFilters = () => {
  const filters: AdvanceFilters = {
    datePreset: datePreset.value,
    fromDate: fromDate.value,
    toDate: toDate.value,
    specificDay: specificDay.value,
    specificMonth: specificMonth.value,
    specificYear: specificYear.value,
    modules: selectedModules.value,
    actions: selectedActions.value,
    status: status.value,
    transactionTypes: selectedTransactionTypes.value,
    createdByEmail: createdByEmail.value,
    search: search.value,
  }
  emit('apply', filters)
  dialog.value = false
}

// ─── Clear all filters ─────────────────────────────────────────────────
const clearFilters = () => {
  datePreset.value = 'all'
  fromDate.value = null
  toDate.value = null
  specificDay.value = null
  specificMonth.value = null
  specificYear.value = null
  selectedModules.value = []
  selectedActions.value = []
  status.value = 'all'
  selectedTransactionTypes.value = []
  createdByEmail.value = ''
  search.value = ''
}

// ─── Handle date preset change ─────────────────────────────────────────
const handleDatePresetChange = (preset: string) => {
  datePreset.value = preset
  const now = new Date()

  if (preset === 'today') {
    const today = now.toISOString().split('T')[0]
    fromDate.value = today
    toDate.value = today
    specificDay.value = null
    specificMonth.value = null
    specificYear.value = null
  } else if (preset === 'this_week') {
    const dayOfWeek = now.getDay()
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    const monday = new Date(now.setDate(diff))
    fromDate.value = monday.toISOString().split('T')[0]
    toDate.value = new Date().toISOString().split('T')[0]
    specificDay.value = null
    specificMonth.value = null
    specificYear.value = null
  } else if (preset === 'this_month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    fromDate.value = firstDay.toISOString().split('T')[0]
    toDate.value = now.toISOString().split('T')[0]
    specificDay.value = null
    specificMonth.value = null
    specificYear.value = null
  } else if (preset === 'this_year') {
    const firstDay = new Date(now.getFullYear(), 0, 1)
    fromDate.value = firstDay.toISOString().split('T')[0]
    toDate.value = now.toISOString().split('T')[0]
    specificDay.value = null
    specificMonth.value = null
    specificYear.value = null
  } else if (preset === 'all') {
    fromDate.value = null
    toDate.value = null
    specificDay.value = null
    specificMonth.value = null
    specificYear.value = null
  } else if (preset === 'custom') {
    specificDay.value = null
    specificMonth.value = null
    specificYear.value = null
  } else if (preset === 'specific_day') {
    fromDate.value = null
    toDate.value = null
    specificMonth.value = null
    specificYear.value = null
  } else if (preset === 'specific_month') {
    fromDate.value = null
    toDate.value = null
    specificDay.value = null
    specificYear.value = null
  } else if (preset === 'specific_year') {
    fromDate.value = null
    toDate.value = null
    specificDay.value = null
    specificMonth.value = null
  }
}

const handleClose = () => {
  emit('close')
}

// ─── Active filter count badge ─────────────────────────────────────────
const activeFilterCount = computed(() => {
  let count = 0
  if (datePreset.value !== 'all') count++
  if (selectedModules.value.length) count++
  if (selectedActions.value.length) count++
  if (status.value !== 'all') count++
  if (selectedTransactionTypes.value.length) count++
  if (createdByEmail.value) count++
  if (search.value) count++
  return count
})

defineExpose({ activeFilterCount })
</script>

<template>
  <v-dialog
    v-model="dialog"
    :max-width="mobile ? '100%' : '700'"
    scrollable
    @click:outside="handleClose"
    @keydown.esc="handleClose"
    @after-enter="handleOpen"
  >
    <v-card rounded="lg">
      <!-- Header -->
      <v-card-title class="d-flex align-center justify-space-between pa-4">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-tune-vertical-variant" color="primary" />
          <span class="text-h6 font-weight-bold">Advanced Filters</span>
        </div>
        <v-chip v-if="activeFilterCount > 0" color="primary" size="small" variant="tonal">
          {{ activeFilterCount }} active
        </v-chip>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <v-expansion-panels variant="accordion" multiple>
          <!-- ── Date Filters ──────────────────────────────────────────── -->
          <v-expansion-panel title="Date Range" value="date">
            <v-expansion-panel-text>
              <v-select
                v-model="datePreset"
                :items="datePresets"
                item-title="title"
                item-value="value"
                label="Date Preset"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-3"
                @update:model-value="handleDatePresetChange"
              />

              <!-- Custom Range -->
              <template v-if="datePreset === 'custom'">
                <div class="d-flex ga-2 flex-wrap">
                  <v-menu :close-on-content-click="false" class="flex-1-1">
                    <template #activator="{ props: menuProps }">
                      <v-text-field
                        v-model="fromDate"
                        v-bind="menuProps"
                        label="From Date"
                        variant="outlined"
                        density="compact"
                        hide-details
                        clearable
                        readonly
                        class="flex-1-1"
                      />
                    </template>
                    <v-date-picker v-model="fromDate" control-variant="modal" />
                  </v-menu>
                  <v-menu :close-on-content-click="false" class="flex-1-1">
                    <template #activator="{ props: menuProps }">
                      <v-text-field
                        v-model="toDate"
                        v-bind="menuProps"
                        label="To Date"
                        variant="outlined"
                        density="compact"
                        hide-details
                        clearable
                        readonly
                        class="flex-1-1"
                      />
                    </template>
                    <v-date-picker v-model="toDate" control-variant="modal" />
                  </v-menu>
                </div>
              </template>

              <!-- Specific Day -->
              <template v-if="datePreset === 'specific_day'">
                <v-menu :close-on-content-click="false">
                  <template #activator="{ props: menuProps }">
                    <v-text-field
                      v-model="specificDay"
                      v-bind="menuProps"
                      label="Select Day"
                      variant="outlined"
                      density="compact"
                      hide-details
                      clearable
                      readonly
                    />
                  </template>
                  <v-date-picker v-model="specificDay" control-variant="modal" />
                </v-menu>
              </template>

              <!-- Specific Month -->
              <template v-if="datePreset === 'specific_month'">
                <v-select
                  v-model="specificMonth"
                  :items="months"
                  item-title="title"
                  item-value="value"
                  label="Select Month"
                  variant="outlined"
                  density="compact"
                  hide-details
                  clearable
                />
              </template>

              <!-- Specific Year -->
              <template v-if="datePreset === 'specific_year'">
                <v-select
                  v-model="specificYear"
                  :items="years"
                  label="Select Year"
                  variant="outlined"
                  density="compact"
                  hide-details
                  clearable
                />
              </template>
            </v-expansion-panel-text>
          </v-expansion-panel>

          <!-- ── Module Filter ─────────────────────────────────────────── -->
          <v-expansion-panel title="Module" value="module">
            <v-expansion-panel-text>
              <v-autocomplete
                v-model="selectedModules"
                :items="availableModules"
                label="Filter by Module"
                variant="outlined"
                density="compact"
                hide-details
                multiple
                clearable
                chips
                closable-chips
                small-chips
                placeholder="Select modules..."
              />
            </v-expansion-panel-text>
          </v-expansion-panel>

          <!-- ── Action Filter ─────────────────────────────────────────── -->
          <v-expansion-panel title="Action" value="action">
            <v-expansion-panel-text>
              <v-autocomplete
                v-model="selectedActions"
                :items="availableActions"
                label="Filter by Action"
                variant="outlined"
                density="compact"
                hide-details
                multiple
                clearable
                chips
                closable-chips
                small-chips
                placeholder="Select actions..."
              />
            </v-expansion-panel-text>
          </v-expansion-panel>

          <!-- ── Status Filter ─────────────────────────────────────────── -->
          <v-expansion-panel title="Status" value="status">
            <v-expansion-panel-text>
              <v-select
                v-model="status"
                :items="statusOptions"
                item-title="title"
                item-value="value"
                label="Filter by Status"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-expansion-panel-text>
          </v-expansion-panel>

          <!-- ── Transaction Type Filter ───────────────────────────────── -->
          <v-expansion-panel title="Transaction Type" value="transaction_type">
            <v-expansion-panel-text>
              <v-autocomplete
                v-model="selectedTransactionTypes"
                :items="availableTransactionTypes"
                label="Filter by Transaction Type"
                variant="outlined"
                density="compact"
                hide-details
                multiple
                clearable
                chips
                closable-chips
                small-chips
                placeholder="Select transaction types..."
              />
            </v-expansion-panel-text>
          </v-expansion-panel>

          <!-- ── Created By Filter ─────────────────────────────────────── -->
          <v-expansion-panel title="Created By" value="created_by">
            <v-expansion-panel-text>
              <v-autocomplete
                v-model="createdByEmail"
                :items="availableEmails"
                label="Filter by Created By (Email)"
                variant="outlined"
                density="compact"
                hide-details
                clearable
                placeholder="Select user..."
              />
            </v-expansion-panel-text>
          </v-expansion-panel>

          <!-- ── Search Text ───────────────────────────────────────────── -->
          <v-expansion-panel title="Search Text" value="search">
            <v-expansion-panel-text>
              <v-text-field
                v-model="search"
                label="Search in description, action, module..."
                prepend-inner-icon="mdi-magnify"
                variant="outlined"
                density="compact"
                hide-details
                clearable
                placeholder="Type to search..."
              />
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>

      <v-divider />

      <!-- Actions -->
      <v-card-actions class="pa-4 d-flex justify-end ga-2">
        <v-btn
          variant="text"
          class="text-none"
          @click="clearFilters"
        >
          <v-icon start icon="mdi-close" />
          Clear All
        </v-btn>
        <v-btn
          variant="outlined"
          class="text-none"
          @click="handleClose"
        >
          Cancel
        </v-btn>
        <v-btn
          variant="flat"
          color="primary"
          class="text-none"
          @click="applyFilters"
        >
          <v-icon start icon="mdi-check" />
          Apply Filters
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.flex-1-1 {
  flex: 1 1 0;
  min-width: 0;
}
</style>
