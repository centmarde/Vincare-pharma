<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref, watch } from 'vue'
import type { KpiCard } from '../composables/useExecutiveDashboard'
import { formatCurrency } from '@/utils/helpers'
import QuickStatsCards from '../components/QuickStatsCards.vue'
import { useExecutiveStatic } from '../composables/executiveStatic'

const staticData = useExecutiveStatic()

const props = defineProps<{
  cards: KpiCard[]
  loading?: boolean
  error?: string
  dateFrom?: string
  dateTo?: string
  revenueGrowth?: string
}>()

const emit = defineEmits<{
  apply: [dateFrom: string, dateTo: string]
  refresh: []
}>()

const router = useRouter()

// Draft copies of the date inputs. Typing here does NOT fetch anything —
// only clicking "Apply" (or "Refresh") does.
const draftDateFrom = ref(props.dateFrom ?? '')
const draftDateTo = ref(props.dateTo ?? '')

// If the committed dates change from outside (e.g. the Refresh button
// resets them to "this month"), keep the draft fields in sync too.
watch(
  () => props.dateFrom,
  (value) => {
    draftDateFrom.value = value ?? ''
  },
)
watch(
  () => props.dateTo,
  (value) => {
    draftDateTo.value = value ?? ''
  },
)

function applyDateRange() {
  emit('apply', draftDateFrom.value, draftDateTo.value)
}

function refreshToCurrentMonth() {
  emit('refresh')
}

// Turns a raw value into what should be shown on screen.
// Numbers marked as currency get formatted; everything else is shown as-is.
function displayValue(value: number | string, isCurrency?: boolean) {
  if (typeof value === 'string') return value
  return isCurrency ? formatCurrency(value) : String(value)
}

function trendIcon(trend: 'up' | 'down' | 'neutral') {
  if (trend === 'up') return 'mdi-trending-up'
  if (trend === 'down') return 'mdi-trending-down'
  return 'mdi-minus'
}

function trendColor(trend: 'up' | 'down' | 'neutral') {
  if (trend === 'up') return 'green'
  if (trend === 'down') return 'error'
  return 'grey'
}

// ── Sparkline drawing helpers ────────────────────────────────────────────
// The sparkline is a tiny line chart. We draw it in a 60x24 box.
// Step 1: scale every point so the tallest one touches the top of the box.
// Step 2: connect the points with a line (an SVG "path").

const SPARKLINE_WIDTH = 60
const SPARKLINE_HEIGHT = 24

function scalePoint(value: number, maxValue: number) {
  // 0 = bottom of the box, SPARKLINE_HEIGHT = top of the box
  return SPARKLINE_HEIGHT - (value / maxValue) * SPARKLINE_HEIGHT
}

function sparklinePath(points: number[]) {
  if (!points.length) return ''

  const maxValue = Math.max(...points, 0.01)
  const stepX = SPARKLINE_WIDTH / (points.length - 1)

  return points
    .map((point, index) => {
      const x = index * stepX
      const y = scalePoint(point, maxValue)
      return index === 0 ? `M${x},${y}` : `L${x},${y}`
    })
    .join(' ')
}

// Where the little dot at the end of the sparkline should sit
function sparklineDotY(points: number[]) {
  if (!points.length) return 0
  const maxValue = Math.max(...points, 0.01)
  const lastValue = points[points.length - 1]
  return scalePoint(lastValue, maxValue)
}

function cardStyle(kpi: KpiCard) {
  return kpi.route ? { cursor: 'pointer' as const } : undefined
}

function goToRoute(kpi: KpiCard) {
  if (kpi.route) router.push(kpi.route)
}
</script>

<template>
  <!-- Error Banner -->
  <v-alert
    v-if="error"
    type="error"
    variant="tonal"
    density="compact"
    class="ma-2 mb-0 rounded-lg"
    closable
    :text="error"
  />

  <!-- Quick Stats (mobile-friendly, tighter spacing) -->
  <QuickStatsCards
    :total-orders="staticData.totalOrders"
    :pending-orders="staticData.pendingOrders"
    :revenue-growth="revenueGrowth ?? '0%'"
  />

  <!-- Date Range Filter (stacked for mobile: From on top, To below) -->
  <div class="px-2 pb-2 date-range-mobile">
    <v-text-field
      v-model="draftDateFrom"
      type="date"
      density="compact"
      variant="outlined"
      hide-details
      label="From"
      class="mb-2 date-field-mobile"
      append-inner-icon="mdi-calendar"
    />
    <v-text-field
      v-model="draftDateTo"
      type="date"
      density="compact"
      variant="outlined"
      hide-details
      label="To"
      class="mb-2 date-field-mobile"
      append-inner-icon="mdi-calendar"
    />
    <div class="d-flex align-center ga-2">
      <v-btn
        color="primary"
        variant="flat"
        size="small"
        class="text-none flex-grow-1"
        :loading="loading"
        @click="applyDateRange"
      >
        Apply
      </v-btn>
      <v-btn
        variant="tonal"
        size="small"
        icon="mdi-calendar-refresh"
        :loading="loading"
        title="Reset to this month"
        @click="refreshToCurrentMonth"
      />
    </div>
  </div>

  <!-- Loading Skeleton -->
  <div v-if="loading" class="pa-2 d-flex flex-column" style="gap: 10px">
    <v-card v-for="i in 4" :key="i" class="rounded-xl" elevation="0">
      <v-card-text class="pa-4">
        <div class="d-flex align-start justify-space-between mb-3">
          <div style="flex: 1">
            <v-skeleton-loader type="text" class="mb-1" width="60%" />
            <v-skeleton-loader type="heading" width="40%" />
          </div>
          <v-skeleton-loader type="avatar" width="40" height="40" />
        </div>
        <v-skeleton-loader type="text" width="80%" />
      </v-card-text>
    </v-card>
  </div>

  <!-- Cards (stacked full-width for mobile) -->
  <div v-else class="pa-2 d-flex flex-column" style="gap: 10px">
    <v-card
      v-for="(kpi, i) in cards"
      :key="i"
      class="kpi-card rounded-xl"
      elevation="0"
      :class="[`kpi-card--${kpi.color}`, { 'kpi-card--clickable': !!kpi.route }]"
      :style="cardStyle(kpi)"
      @click="goToRoute(kpi)"
    >
      <v-card-text class="pa-3 d-flex flex-column">
        <div class="d-flex align-start justify-space-between mb-2">
          <div class="kpi-header-text">
            <div class="text-caption font-weight-medium text-medium-emphasis">
              {{ kpi.title }}
            </div>
            <div
              class="font-weight-bold kpi-value mt-1"
              :title="displayValue(kpi.value, kpi.isCurrency)"
            >
              {{ displayValue(kpi.value, kpi.isCurrency) }}
            </div>
          </div>
          <div class="d-flex flex-column align-end ga-1 kpi-icon-col">
            <v-avatar
              size="40"
              rounded="lg"
              class="kpi-avatar"
              :color="kpi.color"
              variant="tonal"
            >
              <v-icon :icon="kpi.icon" :color="kpi.color" size="22" />
            </v-avatar>
            <svg
              v-if="kpi.sparkline?.length"
              :width="60"
              :height="24"
              viewBox="0 0 60 24"
              class="mt-1"
            >
              <path
                :d="sparklinePath(kpi.sparkline)"
                fill="none"
                :stroke="`rgb(var(--v-theme-${kpi.color}))`"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle
                :cx="60"
                :cy="sparklineDotY(kpi.sparkline)"
                r="2"
                :fill="`rgb(var(--v-theme-${kpi.color}))`"
              />
            </svg>
          </div>
        </div>

        <div class="d-flex align-center ga-2 mb-2">
          <v-icon :icon="trendIcon(kpi.trend)" :color="trendColor(kpi.trend)" size="16" />
          <span class="text-caption font-weight-medium" :class="`text-${trendColor(kpi.trend)}`">
            {{ kpi.trendLabel }}
          </span>
          <span class="text-caption text-medium-emphasis ml-auto">{{ kpi.subtitle }}</span>
        </div>

        <!-- Badges -->
        <div v-if="kpi.badges?.length" class="d-flex flex-wrap ga-1 mt-1">
          <v-chip
            v-for="(badge, bi) in kpi.badges"
            :key="bi"
            size="x-small"
            :color="badge.color ?? 'grey'"
            variant="tonal"
            label
            class="text-caption"
          >
            <span class="font-weight-medium">{{ badge.label }}:</span>
            <span class="ms-1">{{ displayValue(badge.value, badge.isCurrency) }}</span>
          </v-chip>
        </div>

        <!-- Click-to-view hint pinned to bottom right -->
        <div v-if="kpi.route" class="text-right mt-auto d-flex align-center justify-end ga-1 pt-2">
          <span class="text-caption text-medium-emphasis">click to view details</span>
          <v-icon size="14" color="grey">mdi-arrow-right-thin</v-icon>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<style>
.kpi-card--clickable {
  transition: box-shadow 0.2s ease;
}
.kpi-card--clickable:active {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
}
.kpi-value {
  font-size: clamp(1.1rem, 4vw, 1.8rem);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.kpi-header-text {
  min-width: 0; /* allows this flex item to shrink below its content's natural width */
  flex: 1 1 auto;
}
.kpi-icon-col {
  flex-shrink: 0; /* keeps the avatar + sparkline fixed size, never pushed off-card */
}

/* ── Date range filter (mobile) ───────────────────────────────────────── */
/* The visible calendar icon is Vuetify's appended mdi-calendar icon, which
   is always pinned to the far right of the field. The native browser icon
   is hidden (opacity 0) but stretched over that same right-side area so
   tapping the icon still opens the native date picker on mobile. */
.date-field-mobile input[type='date'] {
  min-width: 0;
}

.date-field-mobile input[type='date']::-webkit-calendar-picker-indicator {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 36px; /* roughly the append-icon tap area */
  height: 100%;
  margin: 0;
  padding: 0;
  opacity: 0; /* hide the native icon, keep it clickable */
  cursor: pointer;
}
</style>