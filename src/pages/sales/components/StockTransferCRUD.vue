<script setup lang="ts">
import { onMounted } from 'vue'
import { useStockTransfers, headers } from '../composables/useStockTransfers'
import StockTransferRequestDialog from './StockTransferRequestDialog.vue'
import StockTransferDetailDialog from './StockTransferDetailDialog.vue'
import { formatDatePR_ISO } from '@/utils/helpers'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()

withDefaults(defineProps<{ mode?: 'warehouse' | 'outlet' }>(), { mode: 'outlet' })

const {
  loading, search, filterStatus, filterOutletId,
  statusOptions, outletOptions,
  showRequestDialog, showDetailDialog, selectedTransfer,
  filteredTransfers,
  statusLabel, statusColor,
  init, openRequestDialog, openDetailDialog,
  handleRequestCreated, handleDialogChanged,
} = useStockTransfers()

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">

      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-5 flex-wrap ga-3">
        <span class="text-h6 font-weight-bold">Stock Transfers</span>
        <div class="d-flex align-center flex-wrap ga-3" :class="mobile ? 'w-100' : ''">
          <v-text-field
            v-model="search"
            placeholder="Search transfer #..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            :style="mobile ? 'width: 100%' : 'min-width: 220px'"
          />
          <v-select
            v-model="filterOutletId"
            :items="outletOptions"
            variant="outlined"
            density="compact"
            hide-details
            :style="mobile ? 'width: 100%' : 'min-width: 180px'"
          />
          <v-select
            v-model="filterStatus"
            :items="statusOptions"
            variant="outlined"
            density="compact"
            hide-details
            :style="mobile ? 'width: 100%' : 'min-width: 180px'"
          />
          <v-btn
            v-if="mode === 'outlet'"
            color="primary"
            class="text-none font-weight-bold"
            elevation="0"
            prepend-icon="mdi-plus"
            :block="mobile"
            @click="openRequestDialog"
          >
            New Request
          </v-btn>
        </div>
      </v-card-title>

      <v-divider />

      <!-- Mobile: card list -->
      <v-list v-if="mobile" lines="two" :loading="loading">
        <v-list-item v-for="t in filteredTransfers" :key="t.id" @click="openDetailDialog(t)">
          <template #prepend>
            <v-avatar color="primary" variant="tonal" size="40" class="text-caption font-weight-bold">
              {{ t.transfer_no?.slice(-4) }}
            </v-avatar>
          </template>
          <v-list-item-title class="text-body-2 font-weight-medium">
            {{ t.transfer_no }}
          </v-list-item-title>
          <v-list-item-subtitle class="text-caption">
            {{ t.outlet?.name ?? '—' }} · {{ formatDatePR_ISO(t.created_at) }}
          </v-list-item-subtitle>
          <template #append>
            <v-chip :color="statusColor(t.status)" size="x-small" variant="tonal" class="font-weight-bold">
              {{ statusLabel(t.status) }}
            </v-chip>
          </template>
        </v-list-item>
        <v-list-item v-if="!filteredTransfers.length && !loading">
          <v-list-item-title class="text-medium-emphasis text-body-2">No stock transfers yet.</v-list-item-title>
        </v-list-item>
      </v-list>

      <!-- Desktop: table -->
      <v-data-table
        v-else
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
          {{ item.outlet?.name ?? '—' }}
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