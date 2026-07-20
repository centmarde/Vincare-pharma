<script setup lang="ts">
import { useExecutiveDashboard } from '../composables/useExecutiveDashboard'
import { computed, ref } from 'vue'
import HeaderBar from './HeaderBar.vue'
import KpiCards from './KpiCards.vue'
import QuickStatsCards from './QuickStatsCards.vue'
import MonthlyChart from './MonthlyChart.vue'
import TopProducts from './TopProducts.vue'
import ActionRequired from './ActionRequired.vue'
import { useExecutiveStatic } from '../composables/executiveStatic'

const dash = useExecutiveDashboard()
const staticData = useExecutiveStatic()

const searchQuery = ref('')
const topProducts = computed(() => [...staticData.topProducts].sort((a, b) => b.revenue - a.revenue))
const rightPanelView = ref<'actionRequired' | 'topProducts'>('actionRequired')
</script>

<template>
  <v-container fluid class="pa-0 executive-widget">
    <HeaderBar v-model:search="searchQuery" />

    <KpiCards
      :cards="dash.kpiCards.value"
      :loading="dash.loading.value"
      :error="dash.error.value"
      :date-from="dash.dateFrom.value"
      :date-to="dash.dateTo.value"
      @apply="(from, to) => dash.applyDateRange(from, to)"
      @refresh="dash.resetToCurrentMonth()"
    />

    <QuickStatsCards
      :total-orders="staticData.totalOrders"
      :pending-orders="staticData.pendingOrders"
      :revenue-growth="dash.kpiCards.value[0]?.trendLabel.split(' ')[0] ?? '0%'"
    />

    <v-row class="ma-0" align="stretch">
      <v-col cols="12" lg="8" class="pa-2 d-flex">
        <MonthlyChart
          :monthly-data="staticData.monthlyData"
          :total-revenue="staticData.totalRevenue"
          :total-expenses="staticData.totalExpenses"
          class="flex-grow-1"
        />
      </v-col>

      <v-col cols="12" lg="4" class="pa-2 d-flex flex-column">
        <div class="d-flex align-center mb-3 bg-surface-variant rounded-lg pa-1 toggle-switch flex-shrink-0">
          <v-btn variant="text" size="small" class="text-none flex-grow-1"
            :class="{ 'toggle-active': rightPanelView === 'actionRequired' }"
            @click="rightPanelView = 'actionRequired'">
            <v-icon start size="16">mdi-bell-ring-outline</v-icon>
            Action Required
          </v-btn>
          <v-btn variant="text" size="small" class="text-none flex-grow-1"
            :class="{ 'toggle-active': rightPanelView === 'topProducts' }"
            @click="rightPanelView = 'topProducts'">
            <v-icon start size="16">mdi-package-variant-closed</v-icon>
            Top Products
          </v-btn>
        </div>

        <div class="flex-grow-1 d-flex">
          <ActionRequired v-if="rightPanelView === 'actionRequired'" class="flex-grow-1" />
          <TopProducts v-else :products="topProducts" class="flex-grow-1" />
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<style>
@import url('../css/executive.css');

.toggle-switch {
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.toggle-active {
  background: rgb(var(--v-theme-surface)) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-radius: 6px;
}
</style>