<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useOutletInventory, headers, rowStatus } from '../composables/useOutletInventory'
import { formatCurrency } from '@/utils/helpers'

const router = useRouter()
const {
  loading, search, filterStatus, statusOptions,
  selectedOutletId, outletOptions, setOutlet,
  filteredRows, totalSkus, totalValue, lowCount, outCount,
} = useOutletInventory()

const statusMeta = {
  out: { label: 'Out',  color: 'error' },
  low: { label: 'Low',  color: 'warning' },
  ok:  { label: 'OK',   color: 'success' },
} as const
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <div class="w-100" style="max-width: 1400px; margin: 0 auto">

      <!-- Summary cards -->
      <v-row dense class="mb-1">
        <v-col cols="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Total SKUs</div>
            <div class="text-h5 font-weight-bold">{{ totalSkus }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Stock Value</div>
            <div class="text-h5 font-weight-bold">{{ formatCurrency(totalValue) }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Low Stock</div>
            <div class="text-h5 font-weight-bold text-warning">{{ lowCount }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Out of Stock</div>
            <div class="text-h5 font-weight-bold text-error">{{ outCount }}</div>
          </v-card>
        </v-col>
      </v-row>

      <v-card rounded="lg" elevation="1">
        <v-card-title class="d-flex justify-space-between align-center pa-5 flex-wrap" style="gap: 12px">
          <span class="text-h6 font-weight-bold">Branch Inventory</span>
          <div class="d-flex align-center flex-wrap" style="gap: 12px">
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
            <div class="text-caption text-medium-emphasis">{{ item.product?.sku ?? '—' }}</div>
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
            <span class="text-body-2 text-medium-emphasis">{{ item.product?.expiry_date ?? '—' }}</span>
          </template>

          <template #item.status="{ item }">
            <v-chip :color="statusMeta[rowStatus(item)].color" size="small" variant="tonal" class="font-weight-bold">
              {{ statusMeta[rowStatus(item)].label }}
            </v-chip>
          </template>
        </v-data-table>
      </v-card>
    </div>
  </v-container>
</template>

<style scoped>
:deep(.v-data-table thead th) {
  background: #f5f5f5 !important;
  font-weight: 700 !important;
  font-size: 0.75rem !important;
  letter-spacing: 0.04em;
  color: #616161 !important;
}
</style>
