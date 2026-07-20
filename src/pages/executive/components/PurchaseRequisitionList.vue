<script setup lang="ts">
import { usePurchaseRequisitionList, headers } from '../composables/usePurchaseRequisitionList'
import PRMobileList from '../mobile/MobilePurchaseRequisitionList.vue'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import PRDetailModal from '../dialogs/PRDetailModal.vue'
import { computed, onMounted } from 'vue'
import { useDisplay } from 'vuetify'

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
        
        <v-card rounded="lg" elevation="1" class="stat-card rounded-xl"
          :class="{ 'stat-card--active': filterStatus === 'complete' }"
          @click="filterStatus = 'complete'">
          <v-card-text class="d-flex align-center" style="gap: 12px">
            <v-avatar color="#15803D" variant="tonal" size="40">
              <v-icon icon="mdi-check-circle-outline" />
            </v-avatar>
            <div>
              <div class="text-subtitle-2">Complete</div>
              <div class="text-h6 font-weight-bold">{{ stats.complete.toLocaleString() }}</div>
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
              <v-btn variant="outlined"  size="small" class="text-none" @click="openDetail(item)">
                <v-icon color="primary" start>mdi-eye</v-icon>
                View
              </v-btn>
              <!-- <template v-if="item.status === 'approved'">
                <v-btn
                  variant="outlined"
                  size="small"
                  class="text-none"
                  prepend-icon="mdi-printer-outline"
                  @click="openPurchaseOrder(item)"
                >
                  Issue PO
                </v-btn>
              </template> -->
            </div>
          </template>
        </v-data-table-server>
      </template>

      <!-- ── MOBILE: card list ───────────────────────────────── -->
      <template v-else>
        <!-- Replaces the entire card-list + pagination markup that was here before -->
        <PRMobileList
          :items="serverItems"
          :loading="loading"
          :page="page"
          :total-pages="totalPages"
          @view-detail="openDetail"
          @issue-po="openPurchaseOrder"
          @change-page="goToPage"
        />
      </template>
    </v-card>

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
