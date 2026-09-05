<script setup lang="ts">
import { useSalesDashboard } from '../composables/useSalesDashboard'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const {
  loading, filterWarehouseId, warehouseOptions, today, week, month,
  topProducts, byCashier, lowStockCount, recentSales, load,
} = useSalesDashboard()
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <div class="mx-auto w-100">

      <div class="d-flex justify-end mb-2">
        <v-select
          v-model="filterWarehouseId"
          :items="warehouseOptions"
          item-title="title"
          item-value="value"
          label="Branch"
          variant="outlined"
          density="compact"
          hide-details
          :style="mobile ? 'width: 100%' : 'min-width: 200px'"
          @update:model-value="load"
        />
      </div>

      <!-- Metric cards -->
      <v-row dense class="mb-1">
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" :class="mobile ? 'pa-3' : 'pa-4'">
            <div class="text-caption text-medium-emphasis">Today's Sales</div>
            <div class="font-weight-bold" :class="mobile ? 'text-h6' : 'text-h5'">{{ formatCurrency(today.total) }}</div>
            <div class="text-caption text-medium-emphasis">{{ today.count }} transaction(s)</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" :class="mobile ? 'pa-3' : 'pa-4'">
            <div class="text-caption text-medium-emphasis">Last 7 Days</div>
            <div class="font-weight-bold" :class="mobile ? 'text-h6' : 'text-h5'">{{ formatCurrency(week.total) }}</div>
            <div class="text-caption text-medium-emphasis">{{ week.count }} transaction(s)</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" :class="mobile ? 'pa-3' : 'pa-4'">
            <div class="text-caption text-medium-emphasis">This Month</div>
            <div class="font-weight-bold" :class="mobile ? 'text-h6' : 'text-h5'">{{ formatCurrency(month.total) }}</div>
            <div class="text-caption text-medium-emphasis">{{ month.count }} transaction(s)</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" :class="mobile ? 'pa-3' : 'pa-4'">
            <div class="text-caption text-medium-emphasis">Low / Out of Stock</div>
            <div class="font-weight-bold" :class="[mobile ? 'text-h6' : 'text-h5', lowStockCount > 0 ? 'text-warning' : '']">
              {{ lowStockCount }}
            </div>
            <div class="text-caption text-medium-emphasis">item(s) need restock</div>
          </v-card>
        </v-col>
      </v-row>

      <v-row dense>
        <!-- Top products -->
        <v-col cols="12" md="6">
          <v-card rounded="lg" elevation="1">
            <v-card-title class="text-subtitle-1 font-weight-bold pa-4">Top Products</v-card-title>
            <v-divider />
            <v-list lines="one" :loading="loading">
              <v-list-item v-for="p in topProducts" :key="p.name">
                <template #prepend>
                  <v-avatar color="primary" variant="tonal" size="32" class="text-caption font-weight-bold">
                    {{ p.qty }}
                  </v-avatar>
                </template>
                <v-list-item-title class="text-body-2">{{ p.name }}</v-list-item-title>
                <template #append>
                  <span class="font-weight-medium text-body-2">{{ formatCurrency(p.revenue) }}</span>
                </template>
              </v-list-item>
              <v-list-item v-if="!topProducts.length">
                <v-list-item-title class="text-medium-emphasis text-body-2">No sales yet.</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>

        <!-- Sales by cashier -->
        <v-col cols="12" md="6">
          <v-card rounded="lg" elevation="1">
            <v-card-title class="text-subtitle-1 font-weight-bold pa-4">Sales by Cashier</v-card-title>
            <v-divider />
            <v-list lines="one">
              <v-list-item v-for="c in byCashier" :key="c.name">
                <v-list-item-title class="text-body-2">{{ c.name }}</v-list-item-title>
                <template #append>
                  <span class="font-weight-medium text-body-2">{{ formatCurrency(c.total) }}</span>
                </template>
              </v-list-item>
              <v-list-item v-if="!byCashier.length">
                <v-list-item-title class="text-medium-emphasis text-body-2">No sales yet.</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>

        <!-- Recent sales -->
        <v-col cols="12">
          <v-card rounded="lg" elevation="1">
            <v-card-title class="text-subtitle-1 font-weight-bold pa-4">Recent Sales</v-card-title>
            <v-divider />

            <!-- Mobile: card list -->
            <v-list v-if="mobile" lines="two" :loading="loading">
              <v-list-item v-for="s in recentSales" :key="s.id">
                <template #prepend>
                  <v-avatar color="primary" variant="tonal" size="40" class="text-caption font-weight-bold">
                    {{ s.sale_no?.slice(-4) }}
                  </v-avatar>
                </template>
                <v-list-item-title class="text-body-2">
                  {{ s.customer?.name || 'Walk-in' }}
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption">
                  {{ s.warehouse?.name ?? '—' }} · {{ formatDatePR_ISO(s.created_at) }}
                </v-list-item-subtitle>
                <template #append>
                  <div class="text-right">
                    <div class="font-weight-bold text-body-2">{{ formatCurrency(s.total_amount ?? 0) }}</div>
                    <v-chip :color="s.status === 'voided' ? 'error' : 'success'" size="x-small" variant="tonal">
                      {{ s.status === 'voided' ? 'Voided' : 'Completed' }}
                    </v-chip>
                  </div>
                </template>
              </v-list-item>
              <v-list-item v-if="!recentSales.length">
                <v-list-item-title class="text-medium-emphasis text-body-2">No sales yet.</v-list-item-title>
              </v-list-item>
            </v-list>

            <!-- Desktop: table -->
            <v-table v-else density="compact">
              <thead>
                <tr>
                  <th class="text-left">Sale #</th>
                  <th class="text-left">Branch</th>
                  <th class="text-left">Date</th>
                  <th class="text-left">Customer</th>
                  <th class="text-right">Total</th>
                  <th class="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in recentSales" :key="s.id">
                  <td>{{ s.sale_no }}</td>
                  <td>{{ s.warehouse?.name ?? '—' }}</td>
                  <td class="text-medium-emphasis">{{ formatDatePR_ISO(s.created_at) }}</td>
                  <td>{{ s.customer?.name || '—' }}</td>
                  <td class="text-right">{{ formatCurrency(s.total_amount ?? 0) }}</td>
                  <td class="text-center">
                    <v-chip :color="s.status === 'voided' ? 'error' : 'success'" size="x-small" variant="tonal">
                      {{ s.status === 'voided' ? 'Voided' : 'Completed' }}
                    </v-chip>
                  </td>
                </tr>
                <tr v-if="!recentSales.length">
                  <td colspan="6" class="text-center text-medium-emphasis pa-4">No sales yet.</td>
                </tr>
              </tbody>
            </v-table>
          </v-card>
        </v-col>
      </v-row>
    </div>
  </v-container>
</template>