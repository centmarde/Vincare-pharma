<script setup lang="ts">
import { usePurchaseOrderList, headers, headersWarehouse } from '@/pages/purchasing/composables/usePurchaseOrderList'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import PODetailSkuModal from '../dialogs/PODetailViewModal.vue'
import PODetailViewModal from '../dialogs/PODetailModal.vue'
import { ref, computed, onMounted } from 'vue'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()

const {
  search,
  filterStatus,
  showDetailModal,
  selectedPO,
  selectedPR,
  confirmDialog,
  showSkuEditModal,
  serverItems,
  itemsPerPage,
  totalItems,
  loading,
  loadItems,
  getSupplierSummary,
  statusLabel,
  openDetail,
  handleMarkReceived,
  openDetailForSku,
  openConfirm,
  page,
  init,
} = usePurchaseOrderList()

const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / itemsPerPage.value)))

// Local filter options: always show All / Issued / Complete
const statusFilterOptions = [
  { title: 'All', value: null },
  { title: 'Issued', value: 'issued' },
  { title: 'Complete', value: 'complete' },
]
const searchInput = ref(search.value)

function commitSearch() {
  search.value = searchInput.value
}

function clearSearch() {
  searchInput.value = ''
  search.value = ''
}

onMounted(() => {
  init()
  if (mobile.value) {
    loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
  }
})

function openMarkReceivedDialog(item: any) {
  openDetailForSku(item)
}

function onMarkReceived(poId: number) {
  showSkuEditModal.value = false
  const po = serverItems.value.find((item) => item.id === poId)
  if (po) openConfirm(po)
}

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  loadItems({ page: p, itemsPerPage: itemsPerPage.value, sortBy: [] })
}
</script>
<template>
  <div class="pa-2 fill-height align-start">
    <v-card class="mx-auto w-100 pa-0" rounded="lg" elevation="1">
      <!-- Header -->
      <v-card-title class="pa-5">
        <div
          class="d-flex flex-wrap align-center"
          :class="mobile ? 'flex-column ga-3' : 'justify-space-between'"
        >
          <span class="text-h6 font-weight-bold" :class="mobile ? 'w-100' : ''"
            >Warehouse Dashboard</span
          >
          <div class="d-flex align-center" :class="mobile ? 'w-100' : ''" style="gap: 12px">
            <v-text-field
              v-model="searchInput"
              placeholder="Search..."
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              :style="mobile ? 'flex: 1; min-width: 0' : 'min-width: 240px'"
              @keyup.enter="commitSearch"
              @click:clear="clearSearch"
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
                  v-for="opt in statusFilterOptions"
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
      </v-card-title>

      <v-divider />

      <!-- ── Desktop: Data Table ──────────────────────────────────── -->
      <v-data-table-server
        v-if="!mobile"
        v-model:items-per-page="itemsPerPage"
        :items-per-page-options="[5, 10, 15, 25, 50, 100]"
        :headers="headersWarehouse"
        :items="serverItems"
        :items-length="totalItems"
        :loading="loading"
        hover
        loading-text="Loading purchase orders..."
        no-data-text="No purchase orders found."
        @update:options="loadItems"
      >
        <template #item.po_number="{ item }">
          <span class="text-body-2 font-weight-bold" style="white-space: nowrap">{{
            item.reference_no
          }}</span>
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
          <span class="text-body-2">{{
            item.created_at ? formatDatePR_ISO(item.created_at) : '—'
          }}</span>
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
          <div class="d-flex align-center justify-center ga-2">
            <v-btn variant="outlined" size="small" class="text-none" @click="openDetail(item)">
              View
            </v-btn>
            <div style="width: 150px;">
              <v-btn
                v-if="item.status !== 'complete'"
                size="small"
                color="primary"
                @click="openMarkReceivedDialog(item)"
              >
                Mark as Received
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
          </div>
        </template>
      </v-data-table-server>

      <!-- ── Mobile: Card List ─────────────────────────────────────── -->
      <div v-else class="pa-4">
        <div v-if="loading" class="text-center py-6 text-medium-emphasis">
          Loading purchase orders...
        </div>
        <div v-else-if="!serverItems.length" class="text-center py-6 text-medium-emphasis">
          No purchase orders found.
        </div>
        <template v-else>
          <v-card
            v-for="item in serverItems"
            :key="item.id"
            class="mb-3"
            rounded="lg"
            variant="outlined"
          >
            <v-card-text class="pa-4">
              <div class="d-flex justify-space-between align-start mb-2">
                <div>
                  <span class="text-body-1 font-weight-bold">{{ item.reference_no }}</span>
                  <div class="text-body-2 text-medium-emphasis mt-1">
                    {{ getSupplierSummary(item.id).display }}
                  </div>
                </div>
                <span
                  class="status-chip text-caption font-weight-bold flex-shrink-0"
                  :class="`status-chip--${item.status}`"
                >
                  <span class="status-dot" />
                  {{ statusLabel(item.status) }}
                </span>
              </div>

              <v-divider class="my-2" />

              <div class="d-flex flex-wrap ga-4 text-body-2">
                <div>
                  <span class="text-medium-emphasis">Total: </span>
                  <span class="font-weight-medium">{{ formatCurrency(item.total_amount) }}</span>
                </div>
                <div>
                  <span class="text-medium-emphasis">Ship Via: </span>
                  <span>{{ item.ship_via ?? '—' }}</span>
                </div>
                <div>
                  <span class="text-medium-emphasis">Ship Method: </span>
                  <span>{{ item.ship_method ?? '—' }}</span>
                </div>
                <div>
                  <span class="text-medium-emphasis">Issued: </span>
                  <span>{{ item.created_at ? formatDatePR_ISO(item.created_at) : '—' }}</span>
                </div>
              </div>
            </v-card-text>

            <v-card-actions class="pa-4 pt-0">
              <v-btn variant="outlined" size="small" class="text-none" @click="openDetail(item)">
                View
              </v-btn>
              <v-btn
                v-if="item.status !== 'complete'"
                size="small"
                color="primary"
                class="text-none"
                @click="openMarkReceivedDialog(item)"
              >
                Mark as Received
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
            </v-card-actions>
          </v-card>

          <!-- Mobile Pagination -->
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
      </div>
    </v-card>

    <!-- Opened when clicking 'View' or 'Print' inside your table rows -->
    <PODetailViewModal v-model="showDetailModal" :po="selectedPO" :pr="selectedPR" />

    <PODetailSkuModal
      v-model="showSkuEditModal"
      :po="selectedPO"
      :pr="selectedPR"
      :sku-edit-mode="true"
      @mark-received="onMarkReceived"
    />

    <!-- Confirm Mark as Received -->
    <v-dialog v-model="confirmDialog.show" max-width="420" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center ga-2 pt-5 px-5">
          <v-icon color="success" size="22">mdi-check-circle-outline</v-icon>
          <span class="text-body-1 font-weight-bold">Mark as Received</span>
        </v-card-title>
        <v-card-text class="px-5 pb-2 text-body-2 text-medium-emphasis">
          Confirm that <strong>{{ confirmDialog.poNumber }}</strong> has been received and
          delivered? This will update the status to <strong>Received</strong>.
        </v-card-text>
        <v-card-actions class="px-5 pb-5 pt-3 justify-end ga-2">
          <v-btn
            variant="outlined"
            class="text-none"
            :disabled="loading"
            @click="confirmDialog.show = false"
          >
            Cancel
          </v-btn>
          <v-btn
            variant="flat"
            color="success"
            class="text-none"
            :loading="loading"
            @click="handleMarkReceived"
          >
            Yes, Mark Received
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
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
