<script setup lang="ts">
import { formatCurrency } from '@/utils/helpers'
import type { MonthlyData } from '../composables/executiveStatic'

const props = defineProps<{
  monthlyData: MonthlyData[]
  totalRevenue: number
  totalExpenses: number
}>()

const maxMonthlyValue = Math.max(...props.monthlyData.map((m) => Math.max(m.revenue, m.expenses)))

// Scale to 0-100 where maxMonthlyValue = 100%
const revenuePercent = (value: number) => (value / maxMonthlyValue) * 100
const expensePercent = (value: number) => (value / maxMonthlyValue) * 100
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
            <span class="legend-dot legend-dot--orders" />
            <span>Orders</span>
          </div>
        </div>
      </div>

      <!-- 1-100 scale bar chart (200px height = 100%) -->
      <div class="chart-scroll-wrapper">
        <div class="chart-container">
          <div v-for="(month, idx) in monthlyData" :key="idx" class="chart-column">
            <div class="chart-bars">
              <div
                class="bar bar--revenue"
                :style="{ height: revenuePercent(month.revenue) + '%' }"
                :title="'Revenue: ₱' + month.revenue.toLocaleString()"
              />
              <div
                class="bar bar--expenses"
                :style="{ height: expensePercent(month.expenses) + '%' }"
                :title="'Expenses: ₱' + month.expenses.toLocaleString()"
              />
            </div>
            <div class="chart-month-label text-caption">{{ month.month }}</div>
            <div class="chart-order-count text-caption text-medium-emphasis">
              {{ month.orders }}
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
            <div class="text-caption font-weight-medium text-medium-emphasis">Net Profit</div>
            <div class="text-body-1 font-weight-bold">
              {{ formatCurrency(totalRevenue - totalExpenses) }}
            </div>
          </div>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>