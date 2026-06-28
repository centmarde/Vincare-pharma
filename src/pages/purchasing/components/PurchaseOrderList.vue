<script setup lang="ts">
import { usePurchaseOrderList, headers } from '../composables/usePurchaseOrderList'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import ViewPODetailModal from './dialogs/PODetailModal.vue'
import { useDisplay } from 'vuetify'
import { onMounted } from 'vue'

const {
  search,
  filterStatus,
  showDetailModal,
  selectedPO,
  selectedPR,
  statusOptions,
  serverItems,
  page,
  itemsPerPage,
  totalItems,
  loading,
  loadItems,
  statusLabel,
  openDetail,
  getSupplierSummary,
  init,
} = usePurchaseOrderList()
const { mobile } = useDisplay()
onMounted(() => {
  init()
  if (mobile.value) {
    loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
  }
})

const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / itemsPerPage.value)))

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  loadItems({ page: p, itemsPerPage: itemsPerPage.value, sortBy: [] })
}
</script>
<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <v-card class="mx-auto w-100 pa-0" rounded="lg" elevation="1">
      <!-- Header -->
      <v-card-title class="pa-4 pa-sm-5">
        <div class="d-flex justify-space-between align-center" :class="mobile ? 'mb-3' : ''">
          <div class="d-flex align-center">
            <v-icon
              icon="mdi-file-clock-outline"
              :size="mobile ? 28 : 36"
              class="mr-1 text-primary"
            />
            <span :class="mobile ? 'text-subtitle-1' : 'text-h6'" class="font-weight-bold">
              Purchase Order
            </span>
          </div>

          <!-- Desktop: search + filter -->
          <div v-if="!mobile" class="d-flex align-center" style="gap: 12px">
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
                  class="text-none font-weight-bold"
                  color="primary"
                  append-icon="mdi-chevron-down"
                  >Filter</v-btn
                >
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
        </div>

        <!-- Mobile: search + icon filter (reuses same list) -->
        <div v-if="mobile" class="d-flex align-center" style="gap: 8px">
          <v-text-field
            v-model="search"
            placeholder="Search..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            style="flex: 1; min-width: 0"
          />
          <v-menu>
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                variant="outlined"
                icon="mdi-filter-outline"
                density="compact"
                color="primary"
                size="40"
              />
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

      <template v-if="!mobile">
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
      </template>

      <template v-else>
        <v-progress-linear v-if="loading" indeterminate color="primary" />
        <div
          v-if="!loading && serverItems.length === 0"
          class="text-center pa-8 text-medium-emphasis"
        >
          No purchase orders found.
        </div>

        <div class="pa-3" style="display: flex; flex-direction: column; gap: 10px">
          <v-card
            v-for="item in serverItems"
            :key="item.po_no"
            rounded="lg"
            border
            elevation="0"
            class="po-mobile-card"
          >
            <!-- Card header: PO number + status -->
            <div class="d-flex justify-space-between align-center px-4 pt-3 pb-1">
              <span class="text-body-2 font-weight-bold text-primary">
                {{ item.po_no }}
              </span>
              <span
                class="status-chip text-caption font-weight-bold"
                :class="`status-chip--${item.status}`"
              >
                <span class="status-dot" />
                {{ statusLabel(item.status) }}
              </span>
            </div>

            <v-divider class="mx-4 mb-2" />

            <!-- Card body -->
            <div class="px-4 pb-2" style="display: flex; flex-direction: column; gap: 6px">
              <!-- Supplier -->
              <div class="d-flex align-start" style="gap: 8px">
                <v-icon size="16" class="mt-1 text-medium-emphasis flex-shrink-0">
                  mdi-domain
                </v-icon>
                <div class="d-flex align-center flex-wrap" style="gap: 4px">
                  <span class="text-body-2">{{ getSupplierSummary(item.id).display }}</span>
                  <v-tooltip v-if="getSupplierSummary(item.id).isMultiple" location="top">
                    <template #activator="{ props }">
                      <v-icon v-bind="props" size="14" class="text-medium-emphasis">
                        mdi-information-outline
                      </v-icon>
                    </template>
                    <div v-for="name in getSupplierSummary(item.id).names" :key="name">
                      {{ name }}
                    </div>
                  </v-tooltip>
                </div>
              </div>

              <!-- Amount -->
              <div class="d-flex align-center" style="gap: 8px">
                <v-icon size="16" class="text-medium-emphasis flex-shrink-0">
                  mdi-currency-php
                </v-icon>
                <span class="text-body-2 font-weight-medium">
                  {{ formatCurrency(item.total_amount) }}
                </span>
              </div>

              <!-- Ship via + method -->
              <div
                v-if="item.ship_via || item.ship_method"
                class="d-flex align-center"
                style="gap: 8px"
              >
                <v-icon size="16" class="text-medium-emphasis flex-shrink-0">
                  mdi-truck-outline
                </v-icon>
                <span class="text-caption text-medium-emphasis">
                  {{ [item.ship_via, item.ship_method].filter(Boolean).join(' · ') }}
                </span>
              </div>

              <!-- Date -->
              <div class="d-flex align-center justify-space-between">
                <div class="d-flex align-center" style="gap: 6px">
                  <v-icon size="16" class="text-medium-emphasis">mdi-calendar-outline</v-icon>
                  <span class="text-caption text-medium-emphasis">
                    {{ item.created_at ? formatDatePR_ISO(item.created_at) : '—' }}
                  </span>
                </div>
                <v-chip
                  v-if="item.status === 'complete'"
                  color="green"
                  size="x-small"
                  variant="tonal"
                  label
                >
                  <v-icon start size="12">mdi-check-circle</v-icon>
                  Delivered
                </v-chip>
              </div>
            </div>

            <!-- Card action -->
            <div class="px-4 pb-3 pt-1">
              <v-btn
                variant="outlined"
                size="small"
                class="text-none"
                block
                @click="openDetail(item)"
              >
                View Details
              </v-btn>
            </div>
          </v-card>
        </div>

        <!-- Pagination -->
        <div class="d-flex align-center justify-center ga-2 py-4">
          <v-btn
            icon="mdi-chevron-left"
            variant="text"
            size="small"
            :disabled="page <= 1 || loading"
            @click="goToPage(page - 1)"
          />
          <span
            class="text-body-2 text-medium-emphasis mx-2"
            style="min-width: 80px; text-align: center"
          >
            Page {{ page }} of {{ totalPages }}
          </span>
          <v-btn
            icon="mdi-chevron-right"
            variant="text"
            size="small"
            :disabled="page >= totalPages || loading"
            @click="goToPage(page + 1)"
          />
        </div>
      </template>
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
  background: currentColor;
}

.status-chip--pending_approval {
  color: #c2922e;
  background: rgba(194, 146, 46, 0.12);
}
.status-chip--pending {
  color: #c2922e;
  background: rgba(194, 146, 46, 0.12);
}
.status-chip--approved {
  color: #2e7d32;
  background: rgba(46, 125, 50, 0.12);
}
.status-chip--complete {
  color: #2e7d32;
  background: rgba(46, 125, 50, 0.12);
}
.status-chip--rejected {
  color: #c62828;
  background: rgba(198, 40, 40, 0.12);
}
.status-chip--issued {
  color: #1565c0;
  background: rgba(21, 101, 192, 0.12);
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
