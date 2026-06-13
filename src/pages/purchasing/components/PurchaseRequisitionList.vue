<script setup lang="ts">
import PRDetailModal from './PRDetailModal.vue'
import IssuePOModal from './IssuePOModal.vue'
import { usePurchaseRequisitionList, headers } from '../composables/usePurchaseRequisitionList'
import { formatCurrency,formatDatePR_ISO } from '@/utils/helpers'

const {
  loading,
  selectedPR,
  filterStatus,
  filteredPRs,
  totalQty,
  totalCost,
  itemSummary,
  statusConfig,
  statusOptions,
  showModal,
  search,
  showPOModal,
  selectedPRForPO,
  confirmDialog,
  openDetail,
  openConfirm,
  closeConfirm,
  handleConfirm,
  openPurchaseOrder,
} = usePurchaseRequisitionList()
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
      <v-card class="mx-auto w-100" max-width="1400" rounded="lg" elevation="1">

        <!-- Header -->
        <v-card-title class="d-flex justify-space-between align-center pa-5">
          <span class="text-h6 font-weight-bold">Purchase Requisitions</span>
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
                  <v-btn
                    v-bind="props"
                    variant="text"
                    class="text-none font-weight-bold"
                    color="primary"
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

        <!-- Table -->
        <v-data-table
          :headers="headers"
          :items="filteredPRs"
          :search="search"
          :loading="loading"
          fixed-header
          hover
          loading-text="Loading purchase requisitions..."
          no-data-text="No purchase requisitions found."
        >

          <!-- PR # -->
          <template #item.pr_number="{ item }">
            <span class="text-body-2 font-weight-bold" style="white-space: nowrap;">
              {{ item.pr_number }}
            </span>
          </template>

          <!-- Items -->
          <template #item.items="{ item }">
            <div style="white-space: normal; word-break: break-word; min-width: 160px;">
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
          <template #item.total_cost="{ item }">
            <span class="text-body-2">{{ formatCurrency(totalCost(item.items)) }}</span>
          </template>

          <!-- Requested By -->
          <template #item.requester_name="{ item }">
            <span class="text-body-2">{{ item.requester_name }}</span>
          </template>

          <!-- Created Date -->
          <template #item.created_at="{ item }">
            <span class="text-body-2">{{ formatDatePR_ISO(item.created_at) }}</span>
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

          <!-- Reviewed Date -->
          <template #item.reviewed_at="{ item }">
            <span class="text-body-2">{{ item.reviewed_by ? formatDatePR_ISO(item.reviewed_at) : '' }}</span>
          </template>

          <!-- Actions -->
          <template #item.actions="{ item }">
            <div class="d-flex actions-gap ml-4" style="white-space: nowrap;">
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

        </v-data-table>
      </v-card>

      <!-- 3. Add the Modal Component -->
      <IssuePOModal v-model="showPOModal" :pr="selectedPRForPO" />

      <!-- Detail Modal -->
      <PRDetailModal v-if="selectedPR" v-model="showModal" :pr="selectedPR" />

      <!-- Confirm Dialog -->
      <v-dialog v-model="confirmDialog.show" max-width="420" persistent>
        <v-card rounded="lg">
          <v-card-title class="d-flex align-center ga-2 pt-5 px-5">
            <v-icon
              :color="confirmDialog.action === 'APPROVE' ? 'green-darken-2' : 'red-darken-2'"
              size="22"
            >
              {{ confirmDialog.action === 'APPROVE' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline' }}
            </v-icon>
            <span class="text-body-1 font-weight-bold">
              {{ confirmDialog.action === 'APPROVE' ? 'Approve' : 'Reject' }} Purchase Requisition
            </span>
          </v-card-title>

          <v-card-text class="px-5 pb-2 text-body-2 text-medium-emphasis">
            Are you sure you want to
            <strong>{{ confirmDialog.action }}</strong>&nbsp;-
            <strong>({{ confirmDialog.prNumber }})</strong>?
            This action cannot be undone.
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
}

.status-chip--pending_approval {
  color: #c2922e;
  background: rgba(194, 146, 46, 0.12);
}
.status-chip--pending_approval .status-dot { background: #c2922e; }

.status-chip--approved {
  color: #2e7d32;
  background: rgba(46, 125, 50, 0.12);
}
.status-chip--approved .status-dot { background: #4caf50; }

.status-chip--rejected {
  color: #c62828;
  background: rgba(198, 40, 40, 0.12);
}
.status-chip--rejected .status-dot { background: #ef5350; }

/* ─── Table ───────────────────────────────────────────────────── */
.actions-gap { gap: 6px; }

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
</style>