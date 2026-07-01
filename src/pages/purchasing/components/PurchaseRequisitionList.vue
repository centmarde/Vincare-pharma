<script setup lang="ts">
import { usePurchaseRequisitionList, headers } from '../composables/usePurchaseRequisitionList'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import PRDetailModal from './dialogs/PRDetailModal.vue'
import IssuePOModal from './dialogs/IssuePOModal.vue'
import { computed, onMounted } from 'vue'
import { useDisplay } from 'vuetify'

const {
  init,
  loading,
  selectedPR,
  filterStatus,
  serverItems,
  loadItems,
  totalQty,
  totalCost,
  itemSummary,
  statusConfig,
  page,
  totalItems,
  itemsPerPage,
  statusOptions,
  showModal,
  search,
  showPOModal,
  selectedPRForPO,
  confirmDialog,
  searchInput, 
  commitSearch, 
  clearSearch,
  openDetail,
  openConfirm,
  closeConfirm,
  handleConfirm,
  openPurchaseOrder,
} = usePurchaseRequisitionList()
const { mobile } = useDisplay()
onMounted(() => {
  init()
  if (mobile.value) {
      loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
    }
})
const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / itemsPerPage.value)))
function goToPage(p: number) {
  // window.scrollTo({ top: 100, behavior: 'smooth' as ScrollBehavior })
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  loadItems({ page: p, itemsPerPage: itemsPerPage.value, sortBy: [] })
}
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">
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
              Purchase Requisition
            </span>
          </div>

          <!-- Desktop: search + filter -->
          <div v-if="!mobile" class="d-flex align-center" style="gap: 12px">
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
            v-model="searchInput"
            placeholder="Search..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            style="flex: 1; min-width: 0"
            @keyup.enter="commitSearch"
            @click:clear="clearSearch"

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

      <!-- Table -->
      <template v-if="!mobile">
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
          <!-- PR # -->
          <template #item.requisition_no="{ item }">
            <span class="text-body-2 font-weight-bold" style="white-space: nowrap">
              {{ item.requisition_no }}
            </span>
          </template>

          <!-- Items -->
          <template #item.items="{ item }">
            <div style="white-space: normal; word-break: break-word; min-width: 160px">
              <div class="text-body-2">{{ itemSummary(item.items) }}</div>
              <div class="text-caption text-medium-emphasis">
                {{ item.items.length }} line {{ item.items.length === 1 ? 'item' : 'items' }}
              </div>
            </div>
          </template>

          <!-- Total Qty -->
          <template #item.total_qty="{ item }">
            <span class="text-body-2">{{ totalQty(item.items).toLocaleString() }}</span>
          </template>

          <!-- Total Cost -->
          <template #item.total_amount="{ item }">
            <span class="text-body-2">{{ formatCurrency(totalCost(item.items)) }}</span>
          </template>

          <!-- Requested By -->
          <template #item.requester_name="{ item }">
            <span class="text-body-2">{{ item.requester_name }}</span>
          </template>

          <!-- Created Date -->
          <template #item.created_at="{ item }">
            <span class="text-body-2" style="white-space: nowrap">
              {{ formatDatePR_ISO(item.created_at) }}
            </span>
          </template>

          <!-- Status -->
          <template #item.status="{ item }">
            <span
              class="status-chip text-caption font-weight-bold"
              :class="`status-chip--${item.status}`"
            >
              <span class="status-dot" />
              {{ statusConfig(item.status).label }}
            </span>
          </template>

          <!-- Reviewed By -->
          <template #item.reviewer_name="{ item }">
            <span class="text-body-2">{{ item.reviewer_name }}</span>
          </template>

          <!-- Actions -->
          <template #item.actions="{ item }">
            <div class="d-flex actions-gap" style="white-space: nowrap">
              <v-btn variant="outlined" size="small" class="text-none" @click="openDetail(item)">
                View
              </v-btn>
              <template v-if="item.status === 'pending_approval'">
                <v-btn
                  color="green-darken-2"
                  size="small"
                  class="text-none"
                  elevation="0"
                  @click="openConfirm('APPROVE', item)"
                >
                  Approve
                </v-btn>
                <v-btn
                  variant="outlined"
                  size="small"
                  color="red-darken-2"
                  class="text-none"
                  @click="openConfirm('REJECT', item)"
                >
                  Reject
                </v-btn>
              </template>
              <template v-if="item.status === 'approved'">
                <v-btn
                  variant="outlined"
                  size="small"
                  class="text-none"
                  prepend-icon="mdi-printer-outline"
                  @click="openPurchaseOrder(item)"
                >
                  Issue PO
                </v-btn>
              </template>
            </div>
          </template>
        </v-data-table-server>
      </template>

      <!-- ── MOBILE: card list ───────────────────────────────── -->
      <template v-else>
        <v-progress-linear v-if="loading" indeterminate color="primary" />
        <div v-if="!loading && serverItems.length === 0" class="text-center pa-8 text-medium-emphasis">
          No purchase requisitions found.
        </div>

        <div class="pa-3" style="display: flex; flex-direction: column; gap: 10px">
          <v-card
            v-for="item in serverItems"
            :key="item.requisition_no"
            rounded="lg"
            border
            elevation="0"
            class="pr-mobile-card"
          >
            <!-- Card header: PR number + status -->
            <div class="d-flex justify-space-between align-center px-4 pt-3 pb-1">
              <span class="text-body-2 font-weight-bold text-primary">
                {{ item.requisition_no }}
              </span>
              <span
                class="status-chip text-caption font-weight-bold"
                :class="`status-chip--${item.status}`"
              >
                <span class="status-dot" />
                {{ statusConfig(item.status).label }}
              </span>
            </div>

            <v-divider class="mx-4 mb-2" />

            <!-- Card body: key details -->
            <div class="px-4 pb-2" style="display: flex; flex-direction: column; gap: 6px">
              <!-- Items summary -->
              <div class="d-flex align-start" style="gap: 8px">
                <v-icon size="16" class="mt-1 text-medium-emphasis flex-shrink-0">mdi-pill</v-icon>
                <div>
                  <div class="text-body-2">{{ itemSummary(item.items) }}</div>
                  <div class="text-caption text-medium-emphasis">
                    {{ item.items.length }} line
                    {{ item.items.length === 1 ? 'item' : 'items' }} &bull; Qty:
                    {{ totalQty(item.items).toLocaleString() }}
                  </div>
                </div>
              </div>

              <!-- Amount -->
              <div class="d-flex align-center" style="gap: 8px">
                <v-icon size="16" class="text-medium-emphasis flex-shrink-0"
                  >mdi-currency-php</v-icon
                >
                <span class="text-body-2 font-weight-medium">{{
                  formatCurrency(totalCost(item.items))
                }}</span>
              </div>

              <!-- Requester + Date -->
              <div class="d-flex align-center justify-space-between">
                <div class="d-flex align-center" style="gap: 6px">
                  <v-icon size="16" class="text-medium-emphasis">mdi-account-outline</v-icon>
                  <span class="text-caption text-medium-emphasis">{{ item.requester_name }}</span>
                </div>
                <span class="text-caption text-medium-emphasis">
                  {{ formatDatePR_ISO(item.created_at) }}
                </span>
              </div>

              <!-- Reviewed by (only if present) -->
              <div v-if="item.reviewer_name" class="d-flex align-center" style="gap: 6px">
                <v-icon size="16" class="text-medium-emphasis">mdi-account-check-outline</v-icon>
                <span class="text-caption text-medium-emphasis"
                  >Reviewed by {{ item.reviewer_name }}</span
                >
              </div>
            </div>

            <!-- Card actions -->
            <div class="px-4 pb-3 pt-1 d-flex flex-column" style="gap: 6px">
              <v-btn
                variant="outlined"
                size="small"
                class="text-none"
                block
                @click="openDetail(item)"
              >
                View Details
              </v-btn>

              <template v-if="item.status === 'pending_approval'">
                <div class="d-flex" style="gap: 6px">
                  <v-btn
                    color="green-darken-2"
                    size="small"
                    class="text-none"
                    elevation="0"
                    style="flex: 1"
                    @click="openConfirm('APPROVE', item)"
                  >
                    Approve
                  </v-btn>
                  <v-btn
                    variant="outlined"
                    size="small"
                    color="red-darken-2"
                    class="text-none"
                    style="flex: 1"
                    @click="openConfirm('REJECT', item)"
                  >
                    Reject
                  </v-btn>
                </div>
              </template>

              <template v-if="item.status === 'approved'">
                <v-btn
                  variant="outlined"
                  size="small"
                  class="text-none"
                  prepend-icon="mdi-printer-outline"
                  block
                  @click="openPurchaseOrder(item)"
                >
                  Issue PO
                </v-btn>
              </template>
            </div>
          </v-card>
        </div>

        <!-- Mobile pagination -->
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

    <!-- 3. Add the Modal Component -->
    <IssuePOModal v-model="showPOModal" :pr="selectedPRForPO" />

    <!-- Detail Modal -->
    <PRDetailModal v-if="selectedPR" v-model="showModal" :pr="selectedPR" />

    <!-- Confirm Dialog -->
    <v-dialog v-model="confirmDialog.show" :max-width="mobile ? '100%' : '400'" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center ga-2 pt-5 px-5">
          <v-icon
            :color="confirmDialog.action === 'APPROVE' ? 'green-darken-2' : 'red-darken-2'"
            size="22"
          >
            {{
              confirmDialog.action === 'APPROVE'
                ? 'mdi-check-circle-outline'
                : 'mdi-close-circle-outline'
            }}
          </v-icon>
          <span class="text-body-1 font-weight-bold">
            {{ confirmDialog.action === 'APPROVE' ? 'Approve' : 'Reject' }} Purchase Requisition
          </span>
        </v-card-title>

        <v-card-text class="px-5 pb-2 text-body-2 text-medium-emphasis">
          Are you sure you want to
          <strong>{{ confirmDialog.action }}</strong
          >&nbsp;- <strong>({{ confirmDialog.prNumber }})</strong>? This action cannot be undone.
        </v-card-text>

        <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
          <v-btn variant="outlined" class="text-none" :disabled="loading" @click="closeConfirm">
            Cancel
          </v-btn>
          <v-btn
            :color="confirmDialog.action === 'APPROVE' ? 'green-darken-2' : 'red-darken-2'"
            :variant="confirmDialog.action === 'APPROVE' ? 'flat' : 'outlined'"
            class="text-none"
            :loading="loading"
            @click="handleConfirm"
          >
            Yes, {{ confirmDialog.action === 'APPROVE' ? 'Approve' : 'Reject' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
/* ─── Status chip ─────────────────────────────────────────────────
   CSS variables handle both light and dark automatically.
   No inline hex colors needed in the template. */
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

/* ─── Table ───────────────────────────────────────────────────── */
.actions-gap {
  gap: 6px;
}

.pr-row:hover td {
  background: rgba(0, 0, 0, 0.03);
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

.pr-mobile-card {
  transition: box-shadow 0.15s ease;
}
.pr-mobile-card:active {
  box-shadow: 0 0 0 2px rgba(var(v-theme-primary), 0.3) !important;
}
</style>
