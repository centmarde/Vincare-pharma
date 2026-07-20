<script setup lang="ts">
import { usePurchaseRequisitionList, headers } from '../composables/usePurchaseRequisitionList'
import type { ReorderPrefillItem } from '../composables/usePurchaseRequisition'
import PurchaseRequisitionDialog from './dialogs/PurchaseRequisitionDialog.vue'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import { useProductsDataStore } from '@/stores/productsData'
import PRDetailModal from './dialogs/PRDetailModal.vue'
import IssuePOModal from './dialogs/IssuePOModal.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { useDisplay } from 'vuetify'

const selectedReorderIds = ref<number[]>([])
const prefillItemsForDialog = ref<ReorderPrefillItem[]>([])
const productsStore = useProductsDataStore()

const {
  stats,
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
  itemNames,
  showPOModal,
  selectedPRForPO,
  confirmDialog,
  confirmLoading,
  searchInput,
  commitSearch,
  clearSearch,
  openDetail,
  openConfirm,
  closeConfirm,
  handleConfirm,
  openPurchaseOrder,
  openReorderDialog,
  reorderRequests,
  showReorderDialog,
  reorderCount,
} = usePurchaseRequisitionList()
const { mobile } = useDisplay()
onMounted(() => {
  init()
  if (mobile.value) {
      loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
    }
})
const showNewPRDialog = ref(false)

// Clear prefill items when the dialog is closed without submitting
watch(showNewPRDialog, (isOpen) => {
  if (!isOpen) {
    prefillItemsForDialog.value = []
  }
})

// Clear reorder selection when the reorder dialog is closed
watch(() => showReorderDialog.value, (isOpen) => {
  if (!isOpen) {
    selectedReorderIds.value = []
  }
})

const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / itemsPerPage.value)))
function goToPage(p: number) {
  // window.scrollTo({ top: 100, behavior: 'smooth' as ScrollBehavior })
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  loadItems({ page: p, itemsPerPage: itemsPerPage.value, sortBy: [] })
}

function createPRFromReorder() {
  prefillItemsForDialog.value = reorderRequests.value
    .filter(r => selectedReorderIds.value.includes(r.id))
    .filter(r => r.product) // guard against orphaned rows
    .map(r => {
      const shortfall = (r.product.reorder_level ?? 0) - (r.product.current_stock ?? 0)
      return {
        reorder_request_id: r.id,
        product_id:         r.product.id,
        item_description:   r.product.product_name ?? '',
        unit:                r.product.unit ?? 'Box',
        supplier_id:         r.product.supplier_id ?? null,
        cost_per_unit:       r.product.cost_price ?? 0,
        offer_per_unit:      r.product.selling_price ?? 0,
        suggested_qty:       Math.max(shortfall, 1),
      }
    })

  showReorderDialog.value = false
  showNewPRDialog.value = true
}

function onPRSubmitted() {
  page.value = 1
  loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
  // CHANGED — resolving reorder requests no longer happens at PR-submission
  // time; it now happens when the PR is approved/rejected (see
  // purchaseRequisitionData.approvePR/rejectPR).
  selectedReorderIds.value = []
  prefillItemsForDialog.value = []
}
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">

    <div class="stats-grid mb-2">
        <v-card elevation="1" class="stat-card rounded-xl" @click="filterStatus = null">
          <v-card-text class="d-flex align-center" style="gap: 12px">
            <v-avatar color="purple" variant="tonal" size="40">
              <v-icon icon="mdi-file-document-multiple-outline" />
            </v-avatar>
            <div>
              <div class="text-subtitle-2">Total PRs</div>
              <div class="text-h6 font-weight-bold text-purple">{{ stats.total.toLocaleString() }}</div>
            </div>
          </v-card-text>
        </v-card>

        <v-card elevation="1" class="stat-card rounded-xl" @click="openReorderDialog">
          <v-card-text class="d-flex align-center" style="gap: 12px">
            <v-avatar color="teal" variant="tonal" size="40">
              <v-icon icon="mdi-cart-arrow-down" />
            </v-avatar>
            <div>
              <div class="text-subtitle-2">Reorder Requests</div>
              <div class="text-h6 font-weight-bold text-teal">{{ reorderCount.toLocaleString() }}</div>
            </div>
          </v-card-text>
        </v-card>

        <v-card elevation="1" class="stat-card rounded-xl"
          :class="{ 'stat-card--active': filterStatus === 'pending_approval' }"
          @click="filterStatus = 'pending_approval'"
        >
          <v-card-text class="d-flex align-center" style="gap: 12px">
            <v-avatar color="#c2922e" variant="tonal" size="40">
              <v-icon icon="mdi-clock-alert-outline" />
            </v-avatar>
            <div>
              <div class="text-subtitle-2">Pending Approval</div>
              <div class="text-h6 font-weight-bold">{{ stats.pending.toLocaleString() }}</div>
            </div>
          </v-card-text>
        </v-card>

        <v-card elevation="1" class="stat-card rounded-xl"
          :class="{ 'stat-card--active': filterStatus === 'approved' }"
          @click="filterStatus = 'approved'"
          >
          <v-card-text class="d-flex align-center" style="gap: 12px">
            <v-avatar color="#2563EB" variant="tonal" size="40">
              <v-icon icon="mdi-check-circle-outline" />
            </v-avatar>
            <div>
              <div class="text-subtitle-2">Approved</div>
              <div class="text-h6 font-weight-bold">{{ stats.approved.toLocaleString() }}</div>
            </div>
          </v-card-text>
        </v-card>

        <v-card rounded="lg" elevation="1" class="stat-card rounded-xl"
          :class="{ 'stat-card--active': filterStatus === 'rejected' }"
          @click="filterStatus = 'rejected'">
          <v-card-text class="d-flex align-center" style="gap: 12px">
            <v-avatar color="#DC2626" variant="tonal" size="40">
              <v-icon icon="mdi-close-circle-outline" />
            </v-avatar>
            <div>
              <div class="text-subtitle-2">Rejected</div>
              <div class="text-h6 font-weight-bold">{{ stats.rejected.toLocaleString() }}</div>
            </div>
          </v-card-text>
        </v-card>
      </div>  

    <!-- V-Data-Table -->
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">
      <!-- Header -->
      <v-card-title class="pa-4 pa-sm-5">
        <div class="d-flex justify-space-between align-center" :class="mobile ? 'mb-3' : ''">
          <div class="d-flex align-center">
            <v-icon
              icon="mdi-clipboard-list-outline"
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
            <v-btn
              color="primary"
              class="text-none font-weight-bold"
              prepend-icon="mdi-plus"
              elevation="0"
              @click="showNewPRDialog = true"
            >
              New Requisition
            </v-btn>
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
          <v-btn
            variant="flat"
            icon="mdi-plus"
            density="compact"
            color="primary"
            size="40"
            @click="showNewPRDialog = true"
          />
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
            <div>
              <span class="text-body-2">
                {{ itemSummary(item.items) }}
              </span>

              <v-tooltip v-if="item.items.length > 1" location="top">
                <template #activator="{ props }">
                  <v-icon
                    v-bind="props"
                    size="14"
                    class="ml-1 text-medium-emphasis"
                  >
                    mdi-information-outline
                  </v-icon>
                </template>

                <div
                  v-for="name in itemNames(item.items)"
                  :key="name"
                >
                  {{ name }}
                </div>
              </v-tooltip>
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

    <!-- New Purchase Requisition -->
    <PurchaseRequisitionDialog v-model="showNewPRDialog" :prefill-items="prefillItemsForDialog" @submitted="onPRSubmitted" />

    <!-- 3. Add the Modal Component -->
    <IssuePOModal v-model="showPOModal" :pr="selectedPRForPO" />

    <!-- Detail Modal -->
    <PRDetailModal v-if="selectedPR" v-model="showModal" :pr="selectedPR" 
    @approve="openConfirm('APPROVE', $event)" @reject="openConfirm('REJECT', $event)"/>

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
          <v-btn variant="outlined" class="text-none" :disabled="confirmLoading" @click="closeConfirm">
            Cancel
          </v-btn>
          <v-btn
            :color="confirmDialog.action === 'APPROVE' ? 'green-darken-2' : 'red-darken-2'"
            :variant="confirmDialog.action === 'APPROVE' ? 'flat' : 'outlined'"
            class="text-none"
            :loading="confirmLoading"
            :disabled="confirmLoading"
            @click="handleConfirm"
          >
            Yes, {{ confirmDialog.action === 'APPROVE' ? 'Approve' : 'Reject' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showReorderDialog" max-width="600">
      <v-card>
        <v-card-title class="d-flex align-center pa-4">
          <v-icon icon="mdi-cart-arrow-down" color="teal" class="mr-2"></v-icon>
          <span class="text-h6 font-weight-bold">Reorder Requests</span>
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" variant="text" size="small" @click="showReorderDialog = false"></v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text class="pa-0" style="max-height: 400px; overflow-y: auto;">
          <v-list v-if="reorderRequests.length" density="comfortable">
            <v-list-item v-for="r in reorderRequests" :key="r.id">
              <template #prepend>
                <v-checkbox-btn
                  :model-value="selectedReorderIds.includes(r.id)"
                  @update:model-value="(val) => {
                    if (val) selectedReorderIds.push(r.id)
                    else selectedReorderIds = selectedReorderIds.filter(id => id !== r.id)
                  }"
                />
              </template>
              <v-list-item-title class="font-weight-medium">
                {{ r.product?.product_name }}
              </v-list-item-title>
              <v-list-item-subtitle>
                Stock: {{ r.product?.current_stock ?? 0 }}
                <span v-if="r.product?.reorder_level != null"> · reorder at {{ r.product.reorder_level }}</span>
                · Flagged by {{ r.requester_name }}
              </v-list-item-subtitle>
              <template #append>
                <v-chip
                  size="small"
                  :color="r.transaction_type === 'reorder_outofstock' ? 'error' : r.transaction_type === 'reorder_lowstock' ? 'warning' : 'orange'"
                  variant="tonal"
                >
                  {{ r.transaction_type.replace('reorder_', '').replace('_', ' ') }}
                </v-chip>
              </template>
            </v-list-item>
          </v-list>
          <div v-else class="text-center py-8 text-medium-emphasis">
            No pending reorder requests
          </div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-4 d-flex justify-end">
          <v-btn
            color="primary"
            class="text-none font-weight-bold"
            :disabled="!selectedReorderIds.length"
            @click="createPRFromReorder"
          >
            Create Purchase Requisition ({{ selectedReorderIds.length }})
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
  color: #A16207;
  background: rgba(183, 121, 31, 0.12);
}
.status-chip--approved {
  color: #2563EB;
  background: rgba(51, 102, 204, 0.12);
}
.status-chip--rejected {
  color: #DC2626;
  background: rgba(197, 48, 48, 0.12);
}
.status-chip--issued {
  color: #7C3AED;
  background: rgba(79, 70, 229, 0.12);
}
.status-chip--complete {
  color: #15803D;
  background: rgba(47, 133, 90, 0.12);
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
  border-color: #A63EB8;
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
