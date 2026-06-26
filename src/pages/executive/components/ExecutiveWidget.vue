<script setup lang="ts">
import { useExecutiveStatic } from '../composables/executiveStatic'
import { computed, ref } from 'vue'
import HeaderBar from './HeaderBar.vue'
import KpiCards from './KpiCards.vue'
import QuickStatsCards from './QuickStatsCards.vue'
import MonthlyChart from './MonthlyChart.vue'
import TopProducts from './TopProducts.vue'
import ActionRequired from './ActionRequired.vue'

const dashboard = useExecutiveStatic()

// Search query (shared via v-model to HeaderBar)
const searchQuery = ref('')

// Top products sorted by revenue descending
const topProducts = computed(() => [...dashboard.topProducts].sort((a, b) => b.revenue - a.revenue))

const revenueGrowth = dashboard.kpiCards[0].trendLabel.split(' ')[0]

// Toggle between 'actionRequired' (default) and 'topProducts'
const rightPanelView = ref<'actionRequired' | 'topProducts'>('actionRequired')
</script>

<template>
  <v-container fluid class="pa-0 executive-widget">
    <HeaderBar v-model:search="searchQuery" />

    <KpiCards :cards="dashboard.kpiCards" />

    <QuickStatsCards
      :total-orders="dashboard.totalOrders"
      :pending-orders="dashboard.pendingOrders"
      :revenue-growth="revenueGrowth"
    />

    <v-row class="ma-0" align="stretch">
      <v-col cols="12" lg="8" class="pa-2 d-flex">
        <MonthlyChart
          :monthly-data="dashboard.monthlyData"
          :total-revenue="dashboard.totalRevenue"
          :total-expenses="dashboard.totalExpenses"
          class="flex-grow-1"
        />
      </v-col>

      <v-col cols="12" lg="4" class="pa-2 d-flex flex-column">
        <!-- Toggle Switch -->
        <div class="d-flex align-center mb-3 bg-surface-variant rounded-lg pa-1 toggle-switch flex-shrink-0">
          <v-btn
            variant="text"
            size="small"
            class="text-none flex-grow-1"
            :class="{ 'toggle-active': rightPanelView === 'actionRequired' }"
            @click="rightPanelView = 'actionRequired'"
          >
            <v-icon start size="16">mdi-bell-ring-outline</v-icon>
            Action Required
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            class="text-none flex-grow-1"
            :class="{ 'toggle-active': rightPanelView === 'topProducts' }"
            @click="rightPanelView = 'topProducts'"
          >
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