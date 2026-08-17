<script setup lang="ts">
import { computed } from 'vue'
import { formatCurrency } from '@/utils/helpers'
import type { MonthlyPnL } from '@/stores/executiveData'

const props = defineProps<{
  monthlyData: MonthlyPnL[]
  loading?: boolean
}>()

// The largest absolute value across all three series drives the scale, so a
// loss month (negative net) can still be drawn without clipping — revenue and
// expenses are always positive, but net income can dip below zero.
const maxAbsValue = computed(() =>
  Math.max(
    ...props.monthlyData.flatMap((m) => [Math.abs(m.revenue), Math.abs(m.expenses), Math.abs(m.net)]),
    1,
  ),
)

// Percent (0–50) of the container — the half above the baseline can reach at
// most 50% of the container's height, so a value equal to maxAbsValue fills
// exactly the top (or bottom) half.
const barPercent = (value: number) => (Math.abs(value) / maxAbsValue.value) * 50

// Positive bars grow up from the baseline; negative ones hang below it.
const barStyle = (value: number) => {
  const pct = barPercent(value)
  if (value >= 0) {
    return { height: pct + '%', bottom: '50%' }
  }
  return { height: pct + '%', top: '50%' }
}

// Summary totals are derived from the live monthly rows.
const totalRevenue = computed(() => props.monthlyData.reduce((sum, m) => sum + m.revenue, 0))
const totalExpenses = computed(() => props.monthlyData.reduce((sum, m) => sum + m.expenses, 0))
const totalNet = computed(() => props.monthlyData.reduce((sum, m) => sum + m.net, 0))
</script>

<template>
  <v-card class="rounded-xl" elevation="0">
    <v-card-text class="pa-4 pa-md-6">
      <div class="d-flex align-center mb-5">
        <v-icon icon="mdi-chart-bar" color="primary" size="22" class="mr-2" />
        <span class="text-h6 font-weight-bold">Monthly Financial Overview</span>
        <v-spacer />
        <div class="d-flex align-center ga-3 text-caption">
          <div class="d-flex align-center ga-1">
            <span class="legend-dot legend-dot--revenue" />
            <span>Revenue</span>
          </div>
          <div class="d-flex align-center ga-1">
            <span class="legend-dot legend-dot--expenses" />
            <span>Expenses</span>
          </div>
          <div class="d-flex align-center ga-1">
            <span class="legend-dot legend-dot--net" />
            <span>Net Income</span>
          </div>
        </div>
      </div>

      <v-skeleton-loader v-if="loading" type="image" class="rounded-lg" height="260" />

      <!-- Zero-baseline bar chart (200px height = 100%) -->
      <div v-else class="chart-scroll-wrapper">
        <div class="chart-container">
          <div v-for="(month, idx) in monthlyData" :key="idx" class="chart-column">
            <div class="chart-bars">
              <div class="chart-baseline" />
              <div
                class="bar bar--revenue"
                :style="barStyle(month.revenue)"
                :title="'Revenue: ' + formatCurrency(month.revenue)"
              />
              <div
                class="bar bar--expenses"
                :style="barStyle(month.expenses)"
                :title="'Expenses: ' + formatCurrency(month.expenses)"
              />
              <div
                class="bar bar--net"
                :class="{ 'bar--net-loss': month.net < 0 }"
                :style="barStyle(month.net)"
                :title="'Net Income: ' + formatCurrency(month.net)"
              />
            </div>
            <div class="chart-month-label text-caption">{{ month.month }}</div>
            <div class="chart-net-label text-caption" :class="month.net < 0 ? 'text-error' : 'text-success'">
              {{ formatCurrency(month.net) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Summary Totals -->
      <v-row class="mt-4 pt-2" dense>
        <v-col cols="6" sm="4" class="pa-1">
          <div class="rounded-lg pa-3 text-center summary-tile summary-tile--revenue">
            <div class="text-caption font-weight-medium text-medium-emphasis">Total Revenue</div>
            <div class="text-body-1 font-weight-bold">{{ formatCurrency(totalRevenue) }}</div>
          </div>
        </v-col>
        <v-col cols="6" sm="4" class="pa-1">
          <div class="rounded-lg pa-3 text-center summary-tile summary-tile--expenses">
            <div class="text-caption font-weight-medium text-medium-emphasis">Total Expenses</div>
            <div class="text-body-1 font-weight-bold">{{ formatCurrency(totalExpenses) }}</div>
          </div>
        </v-col>
        <v-col cols="12" sm="4" class="pa-1">
          <div class="rounded-lg pa-3 text-center summary-tile summary-tile--net">
            <div class="text-caption font-weight-medium text-medium-emphasis">Net Income</div>
            <div class="text-body-1 font-weight-bold" :class="totalNet < 0 ? 'text-error' : ''">
              {{ formatCurrency(totalNet) }}
            </div>
          </div>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>