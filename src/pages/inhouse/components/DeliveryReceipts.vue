<script setup lang="ts">
import { useDeliveryReceipts, drHeaders } from '../composables/useDeliveryReceipts'
import DeliveryReceiptDialog from '@/components/deliveryReceipts/DeliveryReceiptDialog.vue'
import { formatDatePR_ISO } from '@/utils/helpers'

const {
  loading, filtered, search,
  showReceipt, selected,
  openReceipt,
} = useDeliveryReceipts()
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <v-card class="mx-auto w-100" max-width="1400" rounded="lg" elevation="1">
      <v-card-title class="d-flex justify-space-between align-center pa-5 flex-wrap" style="gap:12px">
        <span class="text-h6 font-weight-bold">Delivery Receipts</span>
        <v-text-field v-model="search" placeholder="Search DR / order / customer..." prepend-inner-icon="mdi-magnify"
          variant="outlined" density="compact" hide-details style="min-width:240px" />
      </v-card-title>
      <v-divider />

      <v-data-table :headers="drHeaders" :items="filtered" :loading="loading" no-data-text="No delivery receipts yet." hover>
        <template #item.dr_no="{ item }"><span class="font-weight-medium">{{ item.dr_no }}</span></template>
        <template #item.source="{ item }">
          <v-chip size="small" variant="tonal" :color="item.source === 'ethical_order' ? 'teal' : 'indigo'">
            {{ item.source === 'ethical_order' ? 'Ethical' : item.source === 'inhouse_order' ? 'In-House' : '—' }}
          </v-chip>
        </template>
        <template #item.order_no="{ item }">{{ item.order_no ?? '—' }}</template>
        <template #item.customer_name="{ item }">{{ item.customer_name ?? '—' }}</template>
        <template #item.created_at="{ item }">{{ formatDatePR_ISO(item.created_at) }}</template>
        <template #item.received_by="{ item }">{{ item.received_by ?? '—' }}</template>
        <template #item.items="{ item }">{{ item.items.length }}</template>
        <template #item.actions="{ item }">
          <v-btn variant="text" size="small" color="primary" class="text-none" prepend-icon="mdi-eye" @click="openReceipt(item)">View</v-btn>
        </template>
      </v-data-table>
    </v-card>

    <DeliveryReceiptDialog v-model="showReceipt" :receipt="selected" />
  </v-container>
</template>

<style scoped>
:deep(.v-data-table thead th) { background:#f5f5f5 !important; font-weight:700 !important; font-size:.75rem !important; color:#616161 !important; }
</style>
