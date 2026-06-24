<script setup lang="ts">
import { onMounted } from 'vue'
import { useInhouseOrders, headers } from '../composables/useInhouseOrders'
import RaiseOrderDialog from './RaiseOrderDialog.vue'
import OrderDetailDialog from './OrderDetailDialog.vue'
import { formatCurrency } from '@/utils/helpers'

const {
  loading, search, filterStatus, statusOptions,
  filtered, showRaise, showDetail, selected,
  statusLabel, statusColor, deliveryPct,
  openRaise, openDetail, handleRaised, handleChanged, init,
} = useInhouseOrders()

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <v-card class="mx-auto w-100" max-width="1400" rounded="lg" elevation="1">
      <v-card-title class="d-flex justify-space-between align-center pa-5 flex-wrap" style="gap:12px">
        <span class="text-h6 font-weight-bold">In-House Orders</span>
        <div class="d-flex align-center flex-wrap" style="gap:12px">
          <v-text-field v-model="search" placeholder="Search order / PO / customer..." prepend-inner-icon="mdi-magnify"
            variant="outlined" density="compact" hide-details style="min-width:240px" />
          <v-select v-model="filterStatus" :items="statusOptions" variant="outlined" density="compact" hide-details style="min-width:170px" />
          <v-btn color="primary" class="text-none font-weight-bold" elevation="0" prepend-icon="mdi-plus" @click="openRaise">Raise Order</v-btn>
        </div>
      </v-card-title>
      <v-divider />

      <v-data-table :headers="headers" :items="filtered" :loading="loading" no-data-text="No in-house orders yet." hover>
        <template #item.order_no="{ item }"><span class="font-weight-medium">{{ item.order_no }}</span></template>
        <template #item.govt_po_no="{ item }">{{ item.govt_po_no ?? '—' }}</template>
        <template #item.customer="{ item }">{{ item.customer?.name ?? '—' }}</template>
        <template #item.total_amount="{ item }">{{ formatCurrency(item.total_amount ?? 0) }}</template>
        <template #item.delivered="{ item }">
          <div style="min-width:90px">
            <v-progress-linear :model-value="deliveryPct(item)" height="6" rounded color="teal" />
            <span class="text-caption">{{ deliveryPct(item) }}%</span>
          </div>
        </template>
        <template #item.status="{ item }">
          <v-chip :color="statusColor(item.status)" size="small" variant="tonal" class="font-weight-bold">{{ statusLabel(item.status) }}</v-chip>
        </template>
        <template #item.actions="{ item }">
          <v-btn variant="text" size="small" color="primary" class="text-none" @click="openDetail(item)">Open</v-btn>
        </template>
      </v-data-table>
    </v-card>

    <RaiseOrderDialog v-model="showRaise" @created="handleRaised" />
    <OrderDetailDialog v-model="showDetail" :order="selected" @changed="handleChanged" />
  </v-container>
</template>

<style scoped>
:deep(.v-data-table thead th) { background:#f5f5f5 !important; font-weight:700 !important; font-size:.75rem !important; color:#616161 !important; }
</style>
