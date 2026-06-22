<script setup lang="ts">
import { usePurchaseOrderList, headers } from '../composables/usePurchaseOrderList'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import ViewPODetailModal from './PODetailModal.vue'
import { onMounted } from 'vue'

const {
  search,
  filterStatus,
  showDetailModal,
  selectedPO,
  selectedPR,
  statusOptions,
  serverItems,
  itemsPerPage,
  totalItems,
  loading,
  loadItems,
  statusLabel,
  openDetail,
  getSupplierSummary,
  init,
} = usePurchaseOrderList()
onMounted(init)
</script>
<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <v-card class="mx-auto w-100 pa-0" max-width="1400" rounded="lg" elevation="1">
      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-5">
        <div class="d-flex align-center">
          <v-icon icon="mdi-clipboard-check-outline" size="36" class="mr-1 text-primary"></v-icon>
            <span class="text-h6 font-weight-bold">Purchase Order</span>
        </div>
        <div class="d-flex align-center" style="gap: 12px">
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
              <v-btn
                v-bind="props"
                variant="text"
                color="primary"
                class="text-none font-weight-bold"
                append-icon="mdi-chevron-down"
              >
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

      <v-data-table-server
        v-model:items-per-page="itemsPerPage"
        :headers="headers"
        :items="serverItems"
        :items-length="totalItems"
        :loading="loading"
        :search="search"
        hover
        loading-text="Loading purchase orders..."
        no-data-text="No purchase orders found."
        @update:options="loadItems"
      >
        <template #item.po_no="{ item }">
          <span class="text-body-2 font-weight-bold" style="white-space: nowrap">{{
            item.po_no
          }}</span>
        </template>
        
        <!-- Display if the items has more than one supplier -->
        <template #item.supplier_id="{ item }">
          <div>
            <span class="text-body-2">{{ getSupplierSummary(item.id).display }}</span>
            <v-tooltip v-if="getSupplierSummary(item.id).isMultiple" location="top">
              <template #activator="{ props }">
                <v-icon v-bind="props" size="14" class="ml-1 text-medium-emphasis">
                  mdi-information-outline
                </v-icon>
              </template>
              <div v-for="name in getSupplierSummary(item.id).names" :key="name">
                {{ name }}
              </div>
            </v-tooltip>
          </div>
        </template>

        <template #item.total_amount="{ item }">
          <span class="text-body-2">{{ formatCurrency(item.total_amount) }}</span>
        </template>

        <template #item.ship_via="{ item }">
          <span class="text-body-2">{{ item.ship_via ?? '—' }}</span>
        </template>

        <template #item.ship_method="{ item }">
          <span class="text-body-2">{{ item.ship_method ?? '—' }}</span>
        </template>

        <template #item.created_at="{ item }">
          <span class="text-body-2" style="white-space: nowrap">
            {{ item.created_at ? formatDatePR_ISO(item.created_at) : '—' }}
          </span>
        </template>

        <template #item.status="{ item }">
          <span
            class="status-chip text-caption font-weight-bold"
            :class="`status-chip--${item.status}`"
          >
            <span class="status-dot" />
            {{ statusLabel(item.status) }}
          </span>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex align-center" style="gap: 6px; white-space: nowrap">
            <v-btn variant="outlined" size="small" class="text-none" @click="openDetail(item)">
              View
            </v-btn>
            <v-chip v-if="item.status === 'complete'" color="green" size="small" variant="tonal" label>
              <v-icon start size="14">mdi-check-circle</v-icon>
              Delivered
            </v-chip>
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- Opened when clicking 'View' or 'Print' inside your table rows -->
    <ViewPODetailModal v-model="showDetailModal" :po="selectedPO" :pr="selectedPR" />
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
.status-chip--pending {
  color: #c2922e;
  background: rgba(194, 146, 46, 0.12);
}
.status-chip--pending .status-dot {
  background: #c2922e;
}
.status-chip--issued {
  color: #1565c0;
  background: rgba(21, 101, 192, 0.12);
}
.status-chip--issued .status-dot {
  background: #1565c0;
}
.status-chip--complete {
  color: #2e7d32;
  background: rgba(46, 125, 50, 0.12);
}
.status-chip--complete .status-dot {
  background: #2e7d32;
}

:deep(.v-table thead tr th) {
  background: rgba(0, 0, 0, 0.03) !important;
  padding: 12px 16px !important;
  letter-spacing: 0.04em;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
}
:deep(.v-table tbody tr td) {
  padding: 10px 7px !important;
  vertical-align: middle;
}
:deep(.v-table tbody tr:not(:last-child) td) {
  border-bottom: 1px solid rgba(0, 0, 0, 0.05) !important;
}
</style>
