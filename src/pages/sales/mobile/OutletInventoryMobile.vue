<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { OutletStockType } from '@/stores/outletStockData'
import { rowStatus, type StockStatus } from '../composables/useOutletInventory'
import { formatCurrency } from '@/utils/helpers'

const router = useRouter()

defineProps<{
  loading: boolean
  rows: OutletStockType[]
  totalSkus: number
  totalValue: number
  lowCount: number
  outCount: number
  search: string
  filterStatus: StockStatus | 'all'
  statusOptions: { title: string; value: StockStatus | 'all' }[]
  selectedOutletId: number | null
  outletOptions: { title: string; value: number }[]
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:filterStatus': [value: StockStatus | 'all']
  'set-outlet': [id: number]
}>()

const statusMeta = {
  out: { label: 'Out', color: 'error' },
  low: { label: 'Low', color: 'warning' },
  ok: { label: 'OK', color: 'success' },
} as const
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <!-- Summary cards -->
    <v-row class="ma-0 mb-2">
      <v-col cols="6" class="pa-1">
        <v-card class="rounded-xl quick-stat-card" elevation="0" variant="outlined">
          <v-card-text class="pa-3 text-center">
            <v-icon icon="mdi-cube-outline" color="primary" size="22" class="mb-1" />
            <div class="text-h6 font-weight-bold text-primary">{{ totalSkus }}</div>
            <div class="text-caption font-weight-medium text-primary text-opacity-70">
              Total SKUs
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" class="pa-1">
        <v-card class="rounded-xl quick-stat-card" elevation="0" variant="outlined">
          <v-card-text class="pa-3 text-center">
            <v-icon icon="mdi-cash" color="primary" size="22" class="mb-1" />
            <div class="text-h6 font-weight-bold text-primary">{{ formatCurrency(totalValue) }}</div>
            <div class="text-caption font-weight-medium text-primary text-opacity-70">
              Stock Value
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" class="pa-1">
        <v-card class="rounded-xl quick-stat-card" elevation="0" variant="outlined">
          <v-card-text class="pa-3 text-center">
            <v-icon icon="mdi-alert-circle-outline" color="warning" size="22" class="mb-1" />
            <div class="text-h6 font-weight-bold text-warning">{{ lowCount }}</div>
            <div class="text-caption font-weight-medium text-warning text-opacity-70">
              Low Stock
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" class="pa-1">
        <v-card class="rounded-xl quick-stat-card" elevation="0" variant="outlined">
          <v-card-text class="pa-3 text-center">
            <v-icon icon="mdi-cancel" color="error" size="22" class="mb-1" />
            <div class="text-h6 font-weight-bold text-error">{{ outCount }}</div>
            <div class="text-caption font-weight-medium text-error text-opacity-70">
              Out of Stock
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Toolbar / filters -->
    <v-card class="mx-auto w-100 mb-3" rounded="lg" elevation="1">
      <v-card-text class="pa-3 d-flex flex-column" style="gap: 10px">
        <v-select
          :model-value="selectedOutletId"
          :items="outletOptions"
          item-title="title"
          item-value="value"
          label="Branch"
          variant="outlined"
          density="compact"
          hide-details
          @update:model-value="emit('set-outlet', $event)"
        />
        <v-text-field
          :model-value="search"
          placeholder="Search product or SKU..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          @update:model-value="emit('update:search', $event)"
        />
        <v-select
          :model-value="filterStatus"
          :items="statusOptions"
          variant="outlined"
          density="compact"
          hide-details
          @update:model-value="emit('update:filterStatus', $event)"
        />
        <v-btn
          color="primary"
          variant="outlined"
          block
          class="text-none font-weight-bold"
          prepend-icon="mdi-truck-fast"
          @click="router.push('/sales/stock-transfers')"
        >
          Request Transfer
        </v-btn>
      </v-card-text>
    </v-card>

    <!-- Inventory card list -->
    <div v-if="loading" class="text-center pa-6">
      <v-progress-circular indeterminate color="primary" size="32" />
      <div class="text-body-2 text-medium-emphasis mt-2">Loading inventory...</div>
    </div>

    <div v-else-if="rows.length === 0" class="text-center pa-6">
      <v-icon size="48" color="grey-lighten-1">mdi-package-variant-closed</v-icon>
      <div class="text-body-2 text-medium-emphasis mt-2">
        No inventory yet. Transfer stock into this branch first.
      </div>
    </div>

    <template v-else>
      <v-card
        v-for="row in rows"
        :key="row.id"
        class="mx-auto w-100 mb-2"
        variant="outlined"
        rounded="lg"
        elevation="0"
      >
        <v-card-item>
          <template #prepend>
            <v-chip
              :color="statusMeta[rowStatus(row)].color"
              size="small"
              variant="tonal"
              class="font-weight-bold mr-2"
            >
              {{ statusMeta[rowStatus(row)].label }}
            </v-chip>
          </template>
          <v-card-title class="text-body-1 font-weight-bold pa-0">
            {{ row.product?.product_name ?? '—' }}
          </v-card-title>
          <v-card-subtitle class="text-caption pa-0">
            SKU: {{ row.product?.sku ?? '—' }}
          </v-card-subtitle>

          <template #append>
            <div class="text-right">
              <div class="text-h6 font-weight-bold">
                {{ row.quantity }}
              </div>
              <div class="text-caption text-medium-emphasis">on hand</div>
            </div>
          </template>
        </v-card-item>

        <v-divider />

        <v-card-text class="pa-3">
          <v-row no-gutters class="text-center">
            <v-col cols="4">
              <div class="text-caption text-grey-darken-1">Unit Price</div>
              <div class="text-body-2 font-weight-medium">
                {{ formatCurrency(row.product?.selling_price ?? 0) }}
              </div>
            </v-col>
            <v-col cols="4">
              <div class="text-caption text-grey-darken-1">Value</div>
              <div class="text-body-2 font-weight-medium">
                {{ formatCurrency(row.quantity * (row.product?.selling_price ?? 0)) }}
              </div>
            </v-col>
            <v-col cols="4">
              <div class="text-caption text-grey-darken-1">Expiry</div>
              <div class="text-body-2 text-medium-emphasis">
                {{ row.product?.expiry_date ?? '—' }}
              </div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </template>
  </v-container>
</template>

<style scoped>
.quick-stat-card {
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgb(var(--v-theme-surface)) !important;
  transition: transform 0.2s ease;
}
.quick-stat-card:hover {
  transform: translateY(-2px);
}
</style>

