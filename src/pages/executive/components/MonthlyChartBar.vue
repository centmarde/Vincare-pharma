<script setup lang="ts">
import { computed } from 'vue'
import { Chart } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  BarController,
  LineController,
} from 'chart.js'
import { useDisplay } from 'vuetify'
import { formatCurrency } from '@/utils/helpers'
import type { MonthlyPnL } from '@/stores/executiveData'

ChartJS.register(
  Title, Tooltip, Legend,
  BarElement, LineElement, PointElement,
  CategoryScale, LinearScale,
  BarController, LineController,
)

const props = defineProps<{
  monthlyData: MonthlyPnL[]
  loading?: boolean
}>()

const { xs } = useDisplay()

// Reads Vuetify theme CSS vars at render time so chart colors stay in sync
// with the active theme (same "rgba(var(--v-theme-x), alpha)" pattern
// already used in executive.css).
function themeColor(varName: string, alpha = 1) {
  if (typeof window === 'undefined') return `rgba(0,0,0,${alpha})`
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return raw ? `rgba(${raw}, ${alpha})` : `rgba(0,0,0,${alpha})`
}

function compactTick(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(value)
}

const chartData = computed(() => ({
  labels: props.monthlyData.map(m => m.month),
  datasets: [
    {
      type: 'bar' as const,
      label: 'Revenue',
      data: props.monthlyData.map(m => m.revenue),
      backgroundColor: themeColor('--v-theme-primary', 0.85),
      borderRadius: 4,
      order: 2,
    },
    {
      type: 'bar' as const,
      label: 'Expenses',
      data: props.monthlyData.map(m => m.expenses),
      backgroundColor: themeColor('--v-theme-warning', 0.7),
      borderRadius: 4,
      order: 2,
    },
    {
      type: 'bar' as const,
      label: 'Net Income',
      data: props.monthlyData.map(m => m.net),
      backgroundColor: props.monthlyData.map(m =>
        m.net < 0 ? themeColor('--v-theme-error', 0.85) : themeColor('--v-theme-success', 0.85),
      ),
      borderRadius: 4,
      order: 2,
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: {
      position: 'top' as const,
      labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: xs.value ? 10 : 12 } },
    },
    tooltip: {
      callbacks: {
        label: (ctx: any) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    x: {
      ticks: { font: { size: xs.value ? 10 : 12 }, maxRotation: xs.value ? 45 : 0 },
      grid: { display: false },
    },
    y: {
      ticks: { font: { size: xs.value ? 10 : 12 }, callback: (val: any) => compactTick(Number(val)) },
      grid: { color: 'rgba(0,0,0,0.06)' },
    },
  },
}))

const totalRevenue = computed(() => props.monthlyData.reduce((sum, m) => sum + m.revenue, 0))
const totalExpenses = computed(() => props.monthlyData.reduce((sum, m) => sum + m.expenses, 0))
const totalNet = computed(() => props.monthlyData.reduce((sum, m) => sum + m.net, 0))
</script>

<template>
  <v-card class="rounded-xl" elevation="0">
    <v-card-text class="pa-4 pa-md-6">
      <div class="d-flex align-center mb-5 flex-wrap ga-2">
        <v-icon icon="mdi-chart-bar" color="primary" size="22" class="mr-2" />
        <span class="text-h6 font-weight-bold">Monthly Financial Overview</span>
      </div>

      <v-skeleton-loader v-if="loading" type="image" class="rounded-lg" height="260" />

      <div v-else class="chart-wrapper">
        <Chart type="bar" :data="chartData" :options="chartOptions" />
      </div>

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

<style scoped>
.chart-wrapper {
  position: relative;
  height: 300px;
  width: 100%;
}
@media (max-width: 600px) {
  .chart-wrapper { height: 240px; }
}
</style>