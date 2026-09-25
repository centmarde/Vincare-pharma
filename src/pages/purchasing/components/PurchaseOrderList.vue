<script setup lang="ts">
import { usePurchaseOrderList, headers } from '../composables/usePurchaseOrderList'
import PODetailPrintTarget from './dialogs/PODetailPrintTarget.vue'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import ViewPODetailModal from './dialogs/PODetailModal.vue'
import PurchaseOrderListMobile from '../mobile/PurchaseOrderListMobile.vue'
import { onMounted, ref } from 'vue'
import { useDisplay } from 'vuetify'

const {
  stats,
  filterStatus,
  showDetailModal,
  selectedPO,
  selectedPR,
  poStatusOptions,
  serverItems,
  page,
  itemsPerPage,
  totalItems,
  loading,
  searchInput,
  commitSearch,
  clearSearch,
  loadItems,
  statusLabel,
  openDetail,
  getSupplierSummary,
  init,
  refresh,
} = usePurchaseOrderList()
const { mobile } = useDisplay()
const printTargetRef = ref<InstanceType<typeof PODetailPrintTarget> | null>(null)
  
onMounted(() => {
  init()
  if (mobile.value) {
    loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
  }
})

function goToPage(p: number) {
  page.value = p
  loadItems({ page: p, itemsPerPage: itemsPerPage.value, sortBy: [] })
}
function handlePrintRequested() {
  printTargetRef.value?.handlePrint()
}
</script>
<template>
  <v-container fluid class="pa-2 fill-height align-start">

      <div class="stats-grid mb-2">
        <v-card elevation="1" class="stat-card rounded-xl" 
          @click="filterStatus = null">
          <v-card-text class="d-flex align-center" style="gap: 12px">
            <v-avatar color="indigo" variant="tonal" size="40">
              <v-icon icon="mdi-file-document-multiple-outline" />
            </v-avatar>
            <div>
              <div class="text-subtitle-2">Total POs</div>
              <div class="text-h6 font-weight-bold text-indigo">{{ stats.total.toLocaleString() }}</div>
            </div>
          </v-card-text>
        </v-card>

        <v-card elevation="1" class="stat-card rounded-xl"
          :class="{ 'stat-card--active': filterStatus === 'ordered' }"
          @click="filterStatus = 'ordered'"
          @click:clear="clearSearch">
          <v-card-text class="d-flex align-center" style="gap: 12px">
            <v-avatar color="#1565c0" variant="tonal" size="40">
              <v-icon icon="mdi-truck-outline" />
            </v-avatar>
            <div>
              <div class="text-subtitle-2">Pending / Ordered</div>
              <div class="text-h6 font-weight-bold">{{ stats.pending.toLocaleString() }}</div>
            </div>
          </v-card-text>
        </v-card>

        <v-card elevation="1" class="stat-card rounded-xl"
          :class="{ 'stat-card--active': filterStatus === 'complete' }"
          @click="filterStatus = 'complete'"
          @click:clear="clearSearch">
          <v-card-text class="d-flex align-center" style="gap: 12px">
            <v-avatar color="#2e7d32" variant="tonal" size="40">
              <v-icon icon="mdi-check-circle-outline" />
            </v-avatar>
            <div>
              <div class="text-subtitle-2">Complete</div>
              <div class="text-h6 font-weight-bold">{{ stats.complete.toLocaleString() }}</div>
            </div>
          </v-card-text>
        </v-card>

        <v-card elevation="1" class="stat-card rounded-xl">
          <v-card-text class="d-flex align-center" style="gap: 12px">
            <v-avatar color="green" variant="tonal" size="40">
              <span class="text-h6 font-weight-bold">₱</span>
            </v-avatar>
            <div>
              <div class="text-subtitle-2">Total Orders</div>
              <div class="text-h6 font-weight-bold">{{ formatCurrency(stats.totalCost) }}</div>
            </div>
          </v-card-text>
        </v-card>
      </div>
    <v-card v-if="!mobile" class="mx-auto w-100 pa-0" rounded="lg" elevation="1">
      <!-- Header -->
      <v-card-title class="pa-4 pa-sm-5">
        <div class="d-flex justify-space-between align-center">
          <div class="d-flex align-center">
            <v-icon icon="mdi-package-check" size="36" class="mr-1 text-primary" />
            <span class="text-h6 font-weight-bold">Purchase Order</span>
          </div>

          <!-- Desktop: search + filter -->
          <div class="d-flex align-center" style="gap: 12px">
            <v-text-field
              v-model="searchInput"
              placeholder="Search... (press Enter)"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              style="min-width: 240px"
              @keyup.enter="commitSearch"
              @click:clear="clearSearch"
            />
            <v-menu>
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  variant="text"
                  class="text-none font-weight-bold"
                  color="primary"
                  append-icon="mdi-chevron-down"
                  >Filter</v-btn
                >
              </template>
              <v-list density="compact" min-width="180">
                <v-list-item
                  v-for="opt in poStatusOptions"
                  :key="String(opt.value)"
                  :title="opt.title"
                  :active="filterStatus === opt.value"
                  active-color="primary"
                  @click="filterStatus = opt.value"
                />
              </v-list>
            </v-menu>
            <v-btn
              icon="mdi-refresh"
              variant="text"
              class="text-none"
              color="primary"
              :disabled="loading"
              :loading="loading"
              @click="refresh"
            />
          </div>
        </div>
      </v-card-title>

      <v-divider />

      <v-data-table-server
        v-model:items-per-page="itemsPerPage"
        :headers="headers"
        :items="serverItems"
        :items-length="totalItems"
        :loading="loading"

        :items-per-page-options="[5, 10, 15, 20, 25, 50, 100]"
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
            <v-chip
              v-if="item.status === 'complete'"
              color="green"
              size="small"
              variant="tonal"
              label
            >
              <v-icon start size="14">mdi-check-circle</v-icon>
              Delivered
            </v-chip>
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <PurchaseOrderListMobile
      v-else
      v-model:search-input="searchInput"
      v-model:filter-status="filterStatus"
      :items="serverItems"
      :loading="loading"
      :page="page"
      :total-items="totalItems"
      :items-per-page="itemsPerPage"
      :status-label="statusLabel"
      :get-supplier-summary="getSupplierSummary"
      @commit-search="commitSearch"
      @clear-search="clearSearch"
      @refresh="refresh"
      @view-detail="openDetail"
      @change-page="goToPage"
    />

    <!-- Opened when clicking 'View' or 'Print' inside your table rows -->
    <ViewPODetailModal v-model="showDetailModal" :po="selectedPO" :pr="selectedPR" @print-requested="handlePrintRequested" />
    <!-- <ViewPODetailModal v-model="showDetailModal" :po="selectedPO" :pr="selectedPR" /> -->
    <PODetailPrintTarget ref="printTargetRef" :po="selectedPO" :pr="selectedPR" />
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
  background: currentColor;
}

.status-chip--pending_approval { color: #A16207; background: rgba(183, 121, 31, 0.12); }
.status-chip--approved { color: #2563EB; background: rgba(51, 102, 204, 0.12); }
.status-chip--rejected { color: #DC2626; background: rgba(197, 48, 48, 0.12); }
.status-chip--ordered { color: #7C3AED; background: rgba(79, 70, 229, 0.12); }
.status-chip--complete { color: #15803D; background: rgba(47, 133, 90, 0.12); }
.status-chip--change_request    { color: #fb8c00; background: rgba(255, 152, 0,  0.12); }

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
.stat-card {
  min-height: 96px;
  display: flex;
  align-items: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  border: 3px solid rgba(0, 0, 0, 0.06);
}
.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
}
.stat-card--active {
  border-color: #3F51B5;
  background-color: rgba(50, 75, 219, 0.08);
  box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.2);
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  width: 100%;
}
</style>
