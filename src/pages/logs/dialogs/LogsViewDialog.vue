<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import type { LogType } from '@/stores/logsData'
import type { ProductType } from '@/stores/productsData'
import {
  useTransactionItemsDataStore,
  type ProductMovementType,
} from '@/stores/transactionsItemsData'
import {
  getReferenceLabel,
  getActionColor,
  getModuleColor,
  getTimelineIcon,
  getTimelineDate,
  getTimelineTime,
} from '../composables/logsHelpers'

const props = defineProps<{
  modelValue: boolean
  logs: LogType[]
  product?: ProductType | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
}>()

const { mobile } = useDisplay()

const dialog = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const handleClose = () => {
  emit('close')
}

// ── Stock movement (product IN/OUT history) ────────────────────────────
// Kung ang dialog gi-abli nga naay product (gikan sa Products widget),
// i-fetch ang IN/OUT movements via RPC ug i-display sa usa ka timeline.
const movementsStore = useTransactionItemsDataStore()
const movements = ref<ProductMovementType[]>([])
const movementsLoading = ref(false)

const hasProduct = computed(() => props.product?.id != null)

// ── Search + pagination (5 items per page) ─────────────────────────────
const searchQuery = ref('')
const page = ref(1)
const itemsPerPage = 5

// I-filter ang movements base sa search — i-hitsuraan ang doc no., type,
// status, reason ug remarks.
const filteredMovements = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return movements.value
  return movements.value.filter((m) =>
    [m.document_no, m.transaction_type, m.status, m.reason, m.remarks, m.movement]
      .some((v) => v != null && String(v).toLowerCase().includes(q)),
  )
})

// I-filter sab ang logs (Logs page fallback) base sa action/module/description.
const filteredLogs = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.logs
  return props.logs.filter((log) =>
    [log.action, log.module, log.description, log.reference_no, log.requisition_no, log.po_no, log.created_by_email]
      .some((v) => v != null && String(v).toLowerCase().includes(q)),
  )
})

const pagedMovements = computed(() => {
  const start = (page.value - 1) * itemsPerPage
  return filteredMovements.value.slice(start, start + itemsPerPage)
})

const pagedLogs = computed(() => {
  const start = (page.value - 1) * itemsPerPage
  return filteredLogs.value.slice(start, start + itemsPerPage)
})

const movementPages = computed(() => Math.max(1, Math.ceil(filteredMovements.value.length / itemsPerPage)))
const logPages = computed(() => Math.max(1, Math.ceil(filteredLogs.value.length / itemsPerPage)))
const totalPages = computed(() => (hasProduct.value ? movementPages.value : logPages.value))

// Kung mausab ang search, balik sa page 1.
watch(searchQuery, () => {
  page.value = 1
})

// Total nga IN/OUT nga qty para sa summary chips (gikan sa filtered results).
const movementTotals = computed(() => {
  let inQty = 0
  let outQty = 0
  for (const m of filteredMovements.value) {
    const q = Number(m.qty ?? 0)
    if (m.movement === 'IN') inQty += q
    else outQty += q
  }
  return { inQty, outQty, count: filteredMovements.value.length }
})

async function fetchMovements() {
  const productId = props.product?.id
  if (!productId) {
    movements.value = []
    return
  }
  movementsLoading.value = true
  const { rows } = await movementsStore.fetchProductMovements({ productId })
  movements.value = rows
  movementsLoading.value = false
}

// Refetch kung ma-open ang dialog o mausab ang product; i-clear kung sirado.
watch(
  () => [props.modelValue, props.product?.id],
  ([open]) => {
    if (open && hasProduct.value) {
      searchQuery.value = ''
      page.value = 1
      void fetchMovements()
    } else if (!open) {
      movements.value = []
      page.value = 1
    }
  },
  { immediate: true },
)

function movementDate(m: ProductMovementType): string {
  if (!m.movement_at) return ''
  return new Date(m.movement_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function movementTime(m: ProductMovementType): string {
  if (!m.movement_at) return ''
  return new Date(m.movement_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Readable nga label sa transaction_type para sa movement chips.
const TYPE_LABELS: Record<string, string> = {
  stock_in: 'Stock In',
  stock_transfer: 'Stock Transfer',
  sales_return: 'Sales Return',
  sale: 'POS Sale',
  ethical_order: 'Ethical Order',
  inhouse_order: 'In-House Order',
  disposal: 'Disposal',
}
const typeLabel = (t: string | null) =>
  t ? TYPE_LABELS[t] ?? t.replace(/_/g, ' ') : '—'

const movementColor = (m: ProductMovementType) => (m.movement === 'IN' ? 'success' : 'error')
const movementIcon = (m: ProductMovementType) =>
  m.movement === 'IN' ? 'mdi-arrow-down-bold' : 'mdi-arrow-up-bold'
const movementSign = (m: ProductMovementType) => (m.movement === 'IN' ? '+' : '-')
</script>

<template>
  <v-dialog
    v-model="dialog"
    :max-width="mobile ? '100%' : '900'"
    scrollable
    @click:outside="handleClose"
    @keydown.esc="handleClose"
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center justify-space-between pa-4">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-text-box-search-outline" color="primary" />
          <span class="text-h6 font-weight-bold">Stock Movement</span>
        </div>
        <div class="d-flex align-center ga-2">
          <span v-if="hasProduct" class="text-caption text-medium-emphasis d-none d-sm-flex">
            {{ props.product?.product_name }}
          </span>
          <span
            v-if="!hasProduct && filteredLogs.length > 0"
            class="text-caption text-medium-emphasis"
          >
            {{ filteredLogs.length }} log{{ filteredLogs.length === 1 ? '' : 's' }} found
          </span>
        </div>
      </v-card-title>

      <v-divider />

      <!-- Search bar — i-filter ang active view (movement/logs) -->
      <v-card-text class="pb-1 pt-2">
        <v-text-field
          v-model="searchQuery"
          :label="hasProduct ? 'Search movements...' : 'Search logs...'"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          @click:clear="searchQuery = ''"
        />
      </v-card-text>

      <!-- Kung naay product -> Stock Movement timeline; kung wala (Logs page)
           -> logs timeline isip fallback. Wala nay tab switcher. -->
      <template v-if="!hasProduct">
        <v-card-text v-if="pagedLogs.length > 0" class="pa-0">
          <!-- Custom Timeline — vertical line grows from bottom (oldest) to top (most recent) -->
          <div class="custom-timeline pa-6">
          <div
            v-for="(log, index) in pagedLogs"
            :key="log.id"
            class="timeline-item"
          >
            <!-- Left side: date & time -->
            <div class="timeline-opposite">
              <div class="text-caption font-weight-medium text-primary">
                {{ getTimelineDate(log) }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ getTimelineTime(log) }}
              </div>
            </div>

            <!-- Center: line (above dot) + dot -->
            <div class="timeline-line-wrapper">
              <!-- Line extends above the dot for all items except the most recent (top) -->
              <div
                v-if="index !== 0"
                class="timeline-line"
              />
              <!-- Spacer so line doesn't collapse on the first item -->
              <div
                v-else
                class="timeline-line-spacer"
              />
              <div
                class="timeline-dot"
                :style="{ backgroundColor: `rgb(var(--v-theme-${page === 1 && index === 0 ? 'success' : getActionColor(log.action)}))` }"
              >
                <v-icon
                  :icon="page === 1 && index === 0 ? 'mdi-check-circle' : getTimelineIcon(log.action)"
                  size="16"
                  color="white"
                />
              </div>
            </div>

            <!-- Right side: content card -->
            <div class="timeline-content">
              <v-card
                :elevation="page === 1 && index === 0 ? 3 : 1"
                :border="page === 1 && index === 0 ? 'primary' : undefined"
                rounded="md"
                class="pa-3"
              >
                <!-- Action + Module chips row -->
                <div class="d-flex align-center ga-2 mb-2">
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
                  <v-spacer />
                  <span class="text-caption text-medium-emphasis">#{{ log.id }}</span>
                </div>

                <!-- Description -->
                <div class="text-body-2 mb-2">{{ log.description || '—' }}</div>

                <v-divider class="mb-2" />

                <!-- Footer metadata -->
                <div class="d-flex flex-wrap align-center ga-3 text-caption text-medium-emphasis">
                  <div class="d-flex align-center ga-1">
                    <v-icon size="12">mdi-account</v-icon>
                    <span>{{ log.created_by_email || '—' }}</span>
                  </div>
                  <div v-if="getReferenceLabel(log)" class="d-flex align-center ga-1">
                    <v-icon size="12">mdi-hash</v-icon>
                    <span>{{ getReferenceLabel(log) }}</span>
                  </div>
                </div>
              </v-card>
            </div>
          </div>
          </div>
        </v-card-text>
        <v-card-text v-else class="text-center pa-8 text-medium-emphasis">
          <v-icon icon="mdi-text-box-search-outline" size="48" color="grey-lighten-1" class="mb-3" />
          <div>No logs found for this transaction</div>
        </v-card-text>
      </template>

      <!-- ═══ Stock Movement timeline (product-only) ═══ -->
      <template v-else>
        <v-card-text class="pa-0">
          <div v-if="movementsLoading" class="pa-8 text-center">
            <v-progress-circular indeterminate color="primary" size="32" />
          </div>

          <div v-else-if="pagedMovements.length === 0" class="text-center pa-8 text-medium-emphasis">
            <v-icon icon="mdi-swap-vertical" size="48" color="grey-lighten-1" class="mb-3" />
            <div>No stock movement found for this product</div>
          </div>

          <template v-else>
            <!-- Summary chips: total IN / OUT qty -->
            <div class="d-flex flex-wrap align-center ga-2 px-6 pt-4">
              <v-chip color="success" variant="tonal" size="small" prepend-icon="mdi-arrow-down-bold">
                IN {{ movementTotals.inQty.toLocaleString() }}
              </v-chip>
              <v-chip color="error" variant="tonal" size="small" prepend-icon="mdi-arrow-up-bold">
                OUT {{ movementTotals.outQty.toLocaleString() }}
              </v-chip>
              <v-chip variant="text" size="small">
                {{ movementTotals.count }} movement{{ movementTotals.count === 1 ? '' : 's' }}
              </v-chip>
            </div>

            <!-- Movement timeline — parehas nga layout sa logs timeline -->
            <div class="custom-timeline pa-6">
              <div
                v-for="(m, index) in pagedMovements"
                :key="`${m.transaction_id}-${m.id}-${m.movement}`"
                class="timeline-item"
              >
                <!-- Left side: movement date & time -->
                <div class="timeline-opposite">
                  <div class="text-caption font-weight-medium text-primary">
                    {{ movementDate(m) }}
                  </div>
                  <div class="text-caption text-medium-emphasis">
                    {{ movementTime(m) }}
                  </div>
                </div>

                <!-- Center: line + dot (green = IN, red = OUT) -->
                <div class="timeline-line-wrapper">
                  <div v-if="index !== 0" class="timeline-line" />
                  <div v-else class="timeline-line-spacer" />
                  <div
                    class="timeline-dot"
                    :style="{ backgroundColor: `rgb(var(--v-theme-${movementColor(m)}))` }"
                  >
                    <v-icon :icon="movementIcon(m)" size="16" color="white" />
                  </div>
                </div>

                <!-- Right side: content card -->
                <div class="timeline-content">
                  <v-card
                    :elevation="page === 1 && index === 0 ? 3 : 1"
                    :border="page === 1 && index === 0 ? 'primary' : undefined"
                    rounded="md"
                    class="pa-3"
                  >
                    <div class="d-flex align-center ga-2 mb-2">
                      <v-chip
                        :color="movementColor(m)"
                        size="x-small"
                        variant="tonal"
                        class="font-weight-bold"
                      >
                        {{ m.movement }}
                      </v-chip>
                      <v-chip
                        color="primary"
                        size="x-small"
                        variant="outlined"
                        class="text-capitalize"
                      >
                        {{ typeLabel(m.transaction_type) }}
                      </v-chip>
                      <v-spacer />
                      <span
                        class="text-caption font-weight-bold"
                        :class="m.movement === 'IN' ? 'text-success' : 'text-error'"
                      >
                        {{ movementSign(m) }}{{ Number(m.qty ?? 0).toLocaleString() }}
                      </span>
                    </div>

                    <div class="text-body-2 mb-2">{{ m.reason || '—' }}</div>

                    <v-divider class="mb-2" />

                    <!-- Footer metadata -->
                    <div class="d-flex flex-wrap align-center ga-3 text-caption text-medium-emphasis">
                      <div v-if="m.document_no" class="d-flex align-center ga-1">
                        <v-icon size="12">mdi-hash</v-icon>
                        <span>{{ m.document_no }}</span>
                      </div>
                      <div v-if="m.status" class="d-flex align-center ga-1">
                        <v-icon size="12">mdi-information-outline</v-icon>
                        <span class="text-capitalize">{{ (m.status || '').replace(/_/g, ' ') }}</span>
                      </div>
                      <div v-if="m.remarks" class="d-flex align-center ga-1">
                        <v-icon size="12">mdi-note-text-outline</v-icon>
                        <span>{{ m.remarks }}</span>
                      </div>
                    </div>
                  </v-card>
                </div>
              </div>
            </div>
          </template>
        </v-card-text>
      </template>

      <!-- Pagination — 5 ka items kada page -->
      <v-card-text v-if="totalPages > 1" class="d-flex justify-center pb-0 pt-2">
        <v-pagination
          v-model="page"
          :length="totalPages"
          :total-visible="mobile ? 3 : 5"
          density="compact"
        />
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4 d-flex justify-end">
        <v-btn variant="outlined" class="text-none" @click="handleClose">
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* ── Custom Timeline Layout ────────────────────────────────────── */
.custom-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  position: relative;
}

/* Left side: date/time column */
.timeline-opposite {
  width: 90px;
  flex-shrink: 0;
  text-align: right;
  padding-right: 16px;
  padding-top: 6px;
}

/* Center: vertical line + dot */
.timeline-line-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 36px;
  position: relative;
}

.timeline-line {
  width: 2px;
  flex: 1;
  min-height: 24px;
  background: linear-gradient(
    to bottom,
    rgba(var(--v-border-color), 0.38),
    rgba(var(--v-border-color), 0.12)
  );
}

.timeline-line-spacer {
  flex: 1;
  min-height: 24px;
}

.timeline-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  flex-shrink: 0;
  margin: 4px 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

/* Right side: content card */
.timeline-content {
  flex: 1;
  min-width: 0;
  padding-left: 16px;
  padding-bottom: 20px;
}

/* ── Mobile responsive ─────────────────────────────────────────── */
@media (max-width: 600px) {
  .custom-timeline {
    padding: 16px 12px !important;
  }

  .timeline-opposite {
    width: 60px;
    padding-right: 8px;
  }

  .timeline-line-wrapper {
    width: 28px;
  }

  .timeline-dot {
    width: 22px;
    height: 22px;
  }

  .timeline-dot :deep(.v-icon) {
    font-size: 12px !important;
  }

  .timeline-content {
    padding-left: 8px;
  }
}
</style>
