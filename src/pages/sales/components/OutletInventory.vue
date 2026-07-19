<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useOutletInventory, headers, rowStatus } from '../composables/useOutletInventory'
import { formatCurrency } from '@/utils/helpers'

const router = useRouter()
const {
  loading,
  search,
  filterStatus,
  statusOptions,
  selectedOutletId,
  outletOptions,
  setOutlet,
  filteredRows,
  totalSkus,
  totalValue,
  lowCount,
  outCount,
} = useOutletInventory()

const statusMeta = {
  out: { label: 'Out', color: 'error' },
  low: { label: 'Low', color: 'warning' },
  ok: { label: 'OK', color: 'success' },
} as const
</script>

<template>
  <v-container fluid class="pa-2 fill-height">
    <v-row>
      <v-col>
        <!-- Summary cards — LogsCard design -->
        <v-row class="ma-0 mb-4">
          <v-col cols="6" md="3" class="pa-2">
            <v-card class="rounded-xl quick-stat-card" elevation="0" variant="outlined">
              <v-card-text class="pa-3 text-center">
                <v-icon icon="mdi-cube-outline" color="primary" size="24" class="mb-1" />
                <div class="text-h6 font-weight-bold text-primary">
                  {{ totalSkus }}
                </div>
                <div class="text-caption font-weight-medium text-primary text-opacity-70">
                  Total SKUs
                </div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6" md="3" class="pa-2">
            <v-card class="rounded-xl quick-stat-card" elevation="0" variant="outlined">
              <v-card-text class="pa-3 text-center">
                <v-icon icon="mdi-cash" color="primary" size="24" class="mb-1" />
                <div class="text-h6 font-weight-bold text-primary">
                  {{ formatCurrency(totalValue) }}
                </div>
                <div class="text-caption font-weight-medium text-primary text-opacity-70">
                  Stock Value
                </div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6" md="3" class="pa-2">
            <v-card class="rounded-xl quick-stat-card" elevation="0" variant="outlined">
              <v-card-text class="pa-3 text-center">
                <v-icon icon="mdi-alert-circle-outline" color="warning" size="24" class="mb-1" />
                <div class="text-h6 font-weight-bold text-warning">
                  {{ lowCount }}
                </div>
                <div class="text-caption font-weight-medium text-warning text-opacity-70">
                  Low Stock
                </div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6" md="3" class="pa-2">
            <v-card class="rounded-xl quick-stat-card" elevation="0" variant="outlined">
              <v-card-text class="pa-3 text-center">
                <v-icon icon="mdi-cancel" color="error" size="24" class="mb-1" />
                <div class="text-h6 font-weight-bold text-error">
                  {{ outCount }}
                </div>
                <div class="text-caption font-weight-medium text-error text-opacity-70">
                  Out of Stock
                </div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col>
            <v-card rounded="lg" elevation="1">
              <v-card-title class="d-flex justify-space-between align-center pa-5 flex-wrap ga-3">
                <span class="text-h6 font-weight-bold">Branch Inventory</span>
                <div class="d-flex align-center flex-wrap ga-3">
                  <v-select
                    :model-value="selectedOutletId"
                    :items="outletOptions"
                    item-title="title"
                    item-value="value"
                    label="Branch"
                    variant="outlined"
                    density="compact"
                    hide-details
                    style="min-width: 200px"
                    @update:model-value="setOutlet"
                  />
                  <v-text-field
                    v-model="search"
                    placeholder="Search product or SKU..."
                    prepend-inner-icon="mdi-magnify"
                    variant="outlined"
                    density="compact"
                    hide-details
                    style="min-width: 220px"
                  />
                  <v-select
                    v-model="filterStatus"
                    :items="statusOptions"
                    variant="outlined"
                    density="compact"
                    hide-details
                    style="min-width: 170px"
                  />
                  <v-btn
                    color="primary"
                    variant="outlined"
                    class="text-none font-weight-bold"
                    prepend-icon="mdi-truck-fast"
                    @click="router.push('/sales/stock-transfers')"
                  >
                    Request Transfer
                  </v-btn>
                </div>
              </v-card-title>

              <v-divider />

              <v-data-table
                :headers="headers"
                :items="filteredRows"
                :loading="loading"
                loading-text="Loading inventory..."
                no-data-text="No inventory yet. Transfer stock into this branch first."
                hover
              >
                <template #item.product_name="{ item }">
                  <div class="font-weight-medium">{{ item.product?.product_name ?? '—' }}</div>
                  <div class="text-caption text-medium-emphasis">
                    {{ item.product?.sku ?? '—' }}
                  </div>
                </template>

                <template #item.quantity="{ item }">
                  <span class="font-weight-bold">{{ item.quantity }}</span>
                </template>

                <template #item.unit_price="{ item }">
                  {{ formatCurrency(item.product?.selling_price ?? 0) }}
                </template>

                <template #item.value="{ item }">
                  {{ formatCurrency(item.quantity * (item.product?.selling_price ?? 0)) }}
                </template>

                <template #item.expiry="{ item }">
                  <span class="text-body-2 text-medium-emphasis">{{
                    item.product?.expiry_date ?? '—'
                  }}</span>
                </template>

                <template #item.status="{ item }">
                  <v-chip
                    :color="statusMeta[rowStatus(item)].color"
                    size="small"
                    variant="tonal"
                    class="font-weight-bold"
                  >
                    {{ statusMeta[rowStatus(item)].label }}
                  </v-chip>
                </template>
              </v-data-table>
            </v-card>
          </v-col>
        </v-row>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
/* Matching executive QuickStatsCards design — from LogsCard */
.quick-stat-card {
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgb(var(--v-theme-surface)) !important;
  transition: transform 0.2s ease;
}
.quick-stat-card:hover {
  transform: translateY(-2px);
}

:deep(.v-data-table thead th) {
  background: #f5f5f5 !important;
  font-weight: 700 !important;
  font-size: 0.75rem !important;
  letter-spacing: 0.04em;
  color: #616161 !important;
}
</style>
