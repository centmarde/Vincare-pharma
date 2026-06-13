<script setup lang="ts">
import ViewPODetailModal from './PODetailModal.vue'
import { usePurchaseOrderList, headers } from '../composables/usePurchaseOrderList'
import { usePurchaseOrderStore } from '@/stores/purchaseOrderData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const poStore = usePurchaseOrderStore()
const {
  search,
  filterStatus,
  showDetailModal,
  selectedPO,
  selectedPR,
  confirmDialog,
  statusOptions,
  filteredPOs,
  resolveSupplier,
  statusLabel,
  openDetail,
  openConfirm,
  handleMarkReceived,
} = usePurchaseOrderList()
</script>
<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <v-card class="mx-auto w-100" max-width="1400" rounded="lg" elevation="1">

      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-5">
        <span class="text-h6 font-weight-bold">Purchase Orders</span>
        <div class="d-flex align-center" style="gap: 12px;">
          <v-text-field
            v-model="search"
            placeholder="Search..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            style="min-width: 240px"
          />
          <v-menu>
            <template #activator="{ props }">
              <v-btn v-bind="props" variant="text" color="primary" class="text-none font-weight-bold" append-icon="mdi-chevron-down">
                Filter
              </v-btn>
            </template>
            <v-list density="compact" min-width="180">
              <v-list-item
                v-for="opt in statusOptions"
                :key="String(opt.value)"
                :title="opt.title"
                :active="filterStatus === opt.value"
                active-color="primary"
                @click="filterStatus = opt.value"
              />
            </v-list>
          </v-menu>
        </div>
      </v-card-title>

      <v-divider />

      <v-data-table
        :headers="headers"
        :items="filteredPOs"
        :search="search"
        :loading="poStore.loading"
        fixed-header
        hover
        loading-text="Loading purchase orders..."
        no-data-text="No purchase orders found."
      >

        <template #item.po_number="{ item }">
          <span class="text-body-2 font-weight-bold" style="white-space: nowrap;">{{ item.po_number }}</span>
        </template>

        <template #item.supplier_id="{ item }">
          <span class="text-body-2">{{ resolveSupplier(item.supplier_id) }}</span>
        </template>

        <template #item.declared_value="{ item }">
          <span class="text-body-2">{{ formatCurrency(item.declared_value) }}</span>
        </template>

        <template #item.ship_via="{ item }">
          <span class="text-body-2">{{ item.ship_via ?? '—' }}</span>
        </template>

        <template #item.ship_method="{ item }">
          <span class="text-body-2">{{ item.ship_method ?? '—' }}</span>
        </template>

        <template #item.issued_at="{ item }">
          <span class="text-body-2">{{ item.issued_at ? formatDatePR_ISO(item.issued_at) : '—' }}</span>
        </template>

        <template #item.status="{ item }">
          <span class="status-chip text-caption font-weight-bold" :class="`status-chip--${item.status}`">
            <span class="status-dot" />
            {{ statusLabel(item.status) }}
          </span>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex align-center" style="gap: 6px; white-space: nowrap;">
            <v-btn variant="outlined" size="small" class="text-none" @click="openDetail(item)">
              View
            </v-btn>
            <v-btn
              v-if="item.status === 'issued'"
              variant="flat"
              size="small"
              color="success"
              class="text-none"
              :loading="poStore.loading"
              @click="openConfirm(item)"
            >
              Mark Received
            </v-btn>
            <v-chip v-if="item.is_delivered" color="success" size="small" variant="tonal" label>
              <v-icon start size="14">mdi-check-circle</v-icon>
              Delivered
            </v-chip>
            <!-- <v-btn
              variant="outlined"
              size="small"
              class="text-none"
              prepend-icon="mdi-printer-outline"
              @click="openDetail(item)"
            >
              Print
            </v-btn> -->
          </div>
        </template>

      </v-data-table>
    </v-card>

    <!-- Opened when clicking 'View' or 'Print' inside your table rows -->
    <ViewPODetailModal v-model="showDetailModal" :po="selectedPO" :pr="selectedPR"/>

    <!-- Confirm Mark as Received -->
    <v-dialog v-model="confirmDialog.show" max-width="420" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center ga-2 pt-5 px-5">
          <v-icon color="success" size="22">mdi-check-circle-outline</v-icon>
          <span class="text-body-1 font-weight-bold">Mark as Received</span>
        </v-card-title>
        <v-card-text class="px-5 pb-2 text-body-2 text-medium-emphasis">
          Confirm that <strong>{{ confirmDialog.poNumber }}</strong> has been received and delivered?
          This will update the status to <strong>Received</strong>.
        </v-card-text>
        <v-card-actions class="px-5 pb-5 pt-3 justify-end ga-2">
          <v-btn variant="outlined" class="text-none" :disabled="poStore.loading" @click="confirmDialog.show = false">
            Cancel
          </v-btn>
          <v-btn variant="flat" color="success" class="text-none" :loading="poStore.loading" @click="handleMarkReceived">
            Yes, Mark Received
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </v-container>
</template>



<style scoped>
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  white-space: nowrap;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-chip--pending  { color: #c2922e; background: rgba(194,146,46,0.12); }
.status-chip--pending  .status-dot { background: #c2922e; }
.status-chip--issued   { color: #1565c0; background: rgba(21,101,192,0.12); }
.status-chip--issued   .status-dot { background: #1565c0; }
.status-chip--received { color: #2e7d32; background: rgba(46,125,50,0.12); }
.status-chip--received .status-dot { background: #4caf50; }

:deep(.v-table thead tr th) {
  background: rgba(0,0,0,0.03) !important;
  padding: 12px 16px !important;
  letter-spacing: 0.04em;
  border-bottom: 1px solid rgba(0,0,0,0.08) !important;
}
:deep(.v-table tbody tr td) {
  padding: 10px 7px !important;
  vertical-align: middle;
}
:deep(.v-table tbody tr:not(:last-child) td) {
  border-bottom: 1px solid rgba(0,0,0,0.05) !important;
}
</style>