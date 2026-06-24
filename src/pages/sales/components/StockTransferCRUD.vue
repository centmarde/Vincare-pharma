<script setup lang="ts">
import { onMounted } from 'vue'
import { useStockTransfers, headers } from '../composables/useStockTransfers'
import StockTransferRequestDialog from './StockTransferRequestDialog.vue'
import StockTransferDetailDialog from './StockTransferDetailDialog.vue'
import { formatDatePR_ISO } from '@/utils/helpers'

// 'outlet' = requesting side (create + confirm receipt);
// 'warehouse' = reviewing side (approve/reject).
withDefaults(defineProps<{ mode?: 'warehouse' | 'outlet' }>(), { mode: 'outlet' })

const {
  loading, search, filterStatus, filterOutlet,
  statusOptions, outletOptions,
  showRequestDialog, showDetailDialog, selectedTransfer,
  filteredTransfers,
  statusLabel, statusColor, outletName,
  init, openRequestDialog, openDetailDialog,
  handleRequestCreated, handleDialogChanged,
} = useStockTransfers()

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <v-card class="mx-auto w-100" max-width="1400" rounded="lg" elevation="1">

      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-5 flex-wrap" style="gap: 12px">
        <span class="text-h6 font-weight-bold">Stock Transfers</span>
        <div class="d-flex align-center flex-wrap" style="gap: 12px">
          <v-text-field
            v-model="search"
            placeholder="Search transfer #..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 220px"
          />
          <v-select
            v-model="filterOutlet"
            :items="outletOptions"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 180px"
          />
          <v-select
            v-model="filterStatus"
            :items="statusOptions"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 180px"
          />
          <v-btn
            v-if="mode === 'outlet'"
            color="primary"
            class="text-none font-weight-bold"
            elevation="0"
            prepend-icon="mdi-plus"
            @click="openRequestDialog"
          >
            New Request
          </v-btn>
        </div>
      </v-card-title>

      <v-divider />

      <!-- Table -->
      <v-data-table
        :headers="headers"
        :items="filteredTransfers"
        :loading="loading"
        loading-text="Loading stock transfers..."
        no-data-text="No stock transfers yet."
        hover
      >
        <template #item.transfer_no="{ item }">
          <span class="font-weight-medium">{{ item.transfer_no }}</span>
        </template>

        <template #item.outlet="{ item }">
          {{ outletName(item.outlet) }}
        </template>

        <template #item.created_at="{ item }">
          <span class="text-body-2 text-medium-emphasis">{{ formatDatePR_ISO(item.created_at) }}</span>
        </template>

        <template #item.status="{ item }">
          <v-chip :color="statusColor(item.status)" size="small" variant="tonal" class="font-weight-bold">
            {{ statusLabel(item.status) }}
          </v-chip>
        </template>

        <template #item.actions="{ item }">
          <v-btn
            variant="text"
            size="small"
            color="primary"
            class="text-none"
            @click="openDetailDialog(item)"
          >
            View
          </v-btn>
        </template>
      </v-data-table>

    </v-card>

    <StockTransferRequestDialog
      v-model="showRequestDialog"
      @created="handleRequestCreated"
    />

    <StockTransferDetailDialog
      v-model="showDetailDialog"
      :transfer="selectedTransfer"
      :mode="mode"
      @changed="handleDialogChanged"
    />

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
:deep(.v-data-table td) {
  text-align: center !important;
}
</style>
