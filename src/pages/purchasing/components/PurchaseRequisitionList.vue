<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisition'
import PRDetailModal from './PRDetailModal.vue'
import { formatCurrency, formatDate } from '@/utils/helpers'

const store = usePurchaseRequisitionStore()
const {
  loading,
  selectedPR,
  filterStatus,
  filteredPRs,
} = storeToRefs(store)

const {
  fetchPurchaseRequisition,
  approvePR,
  rejectPR,
  totalQty,
  totalCost,
  itemSummary,
  statusConfig,
  statusOptions,
} = store

// ─── Local UI State ───────────────────────────────────────────────────────────

const showModal = ref(false)

const confirmDialog = ref({
  show: false,
  action: '' as 'approve' | 'reject',
  prId: 0 as number,
  prNumber: '' as string,
})


function openDetail(pr: typeof selectedPR.value) {
  selectedPR.value = pr
  showModal.value = true
}

function openConfirm(action: 'approve' | 'reject', pr: { id: number; pr_number: string }) {
  confirmDialog.value = {
    show: true,
    action,
    prId: pr.id,
    prNumber: pr.pr_number,
  }
}

function closeConfirm() {
  confirmDialog.value.show = false
}

async function handleConfirm() {
  const { action, prId } = confirmDialog.value
  if (action === 'approve') {
    await approvePR(prId)
  } else {
    await rejectPR(prId)
  }
  closeConfirm()
}

onMounted(fetchPurchaseRequisition)
</script>

<template>
  <v-container fluid class="pa-6 bg-grey-lighten-4 fill-height align-start">
    <v-card class="mx-auto w-100" max-width="1400" rounded="lg" elevation="1">

      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-5">
        <span class="text-h6 font-weight-bold">Purchase Requisitions</span>
        <v-menu>
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              variant="text"
              class="text-none font-weight-bold"
              color="#c2922e"
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
              active-color="#c2922e"
              @click="filterStatus = opt.value"
            />
          </v-list>
        </v-menu>
      </v-card-title>

      <v-divider />

      <!-- Loading -->
      <div v-if="loading" class="pa-8 text-center">
        <v-progress-circular indeterminate color="#c2922e" />
      </div>

      <!-- Empty -->
      <div v-else-if="filteredPRs.length === 0" class="pa-8 text-center text-grey-darken-1">
        No purchase requisitions found.
      </div>

      <!-- Table -->
      <v-table v-else fixed-header>
        <thead>
          <tr>
            <th class="text-caption font-weight-bold text-grey-darken-2">PR #</th>
            <th class="text-caption font-weight-bold text-grey-darken-2">ITEMS</th>
            <th class="text-caption font-weight-bold text-grey-darken-2">TOTAL QTY</th>
            <th class="text-caption font-weight-bold text-grey-darken-2">TOTAL COST</th>
            <th class="text-caption font-weight-bold text-grey-darken-2">REQUESTED BY</th>
            <th class="text-caption font-weight-bold text-grey-darken-2">DATE</th>
            <th class="text-caption font-weight-bold text-grey-darken-2">STATUS</th>
            <th class="text-caption font-weight-bold text-grey-darken-2">REVIEWED BY</th>
            <th class="text-caption font-weight-bold text-grey-darken-2">DATE</th>
            <th class="text-caption font-weight-bold text-grey-darken-2">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="pr in filteredPRs" :key="pr.id" class="pr-row">

            <!-- PR # -->
            <td class="text-body-2 font-weight-bold" style="white-space: nowrap">
              {{ pr.pr_number }}
            </td>

            <!-- Items -->
            <td>
              <div class="text-body-2">{{ itemSummary(pr.items) }}</div>
              <div class="text-caption text-grey-darken-1">
                {{ pr.items.length }} line {{ pr.items.length === 1 ? 'item' : 'items' }}
              </div>
            </td>

            <!-- Total Qty -->
            <td class="text-body-2">{{ totalQty(pr.items).toLocaleString() }}</td>

            <!-- Total Cost -->
            <td class="text-body-2" style="white-space: nowrap">
              {{ formatCurrency(totalCost(pr.items)) }}
            </td>

            <!-- Requested By -->
            <td class="text-body-2" style="white-space: nowrap">
              {{ pr.requester_name }}
            </td>

            <!-- Date -->
            <td class="text-body-2" style="white-space: nowrap">
              {{ formatDate(pr.created_at) }}
            </td>

            <!-- Status -->
            <td style="white-space: nowrap">
              <span
                class="status-chip text-caption font-weight-bold"
                :style="{
                  color: statusConfig(pr.status).color,
                  background: statusConfig(pr.status).bg,
                }"
              >
                <span
                  class="status-dot"
                  :style="{ background: statusConfig(pr.status).dot }"
                />
                {{ statusConfig(pr.status).label }}
              </span>
            </td>

            <!-- Approved By -->
            <td class="text-body-2" style="white-space: nowrap">
              {{ pr.reviewer_name }}
            </td>

            <!-- Date -->
            <td class="text-body-2" style="white-space: nowrap">
              {{ pr.reviewed_by ? formatDate(pr.reviewed_at) : '' }}
            </td>

            <!-- Actions -->
            <td style="white-space: nowrap">
              <div class="d-flex align-center actions-gap">
                <v-btn
                  variant="outlined"
                  size="small"
                  class="text-none"
                  @click="openDetail(pr)"
                >
                  View
                </v-btn>

                <template v-if="pr.status === 'pending_approval'">
                  <v-btn
                    color="grey-darken-4"
                    size="small"
                    class="text-none"
                    elevation="0"
                    @click="openConfirm('approve', pr)"
                  >
                    Approve
                  </v-btn>
                  <v-btn
                    variant="outlined"
                    size="small"
                    color="red-darken-1"
                    class="text-none"
                    @click="openConfirm('reject', pr)"
                  >
                    Reject
                  </v-btn>
                </template>

                <template v-if="pr.status === 'approved'">
                  <v-btn
                    variant="outlined"
                    size="small"
                    class="text-none"
                    prepend-icon="mdi-printer-outline"
                  >
                    Issue PO
                  </v-btn>
                </template>
              </div>
            </td>

          </tr>
        </tbody>
      </v-table>

    </v-card>

    <!-- Detail Modal -->
    <PRDetailModal
      v-if="selectedPR"
      v-model="showModal"
      :pr="selectedPR"
    />

    <!-- Confirm Dialog -->
    <v-dialog v-model="confirmDialog.show" max-width="420" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center ga-2 pt-5 px-5">
          <v-icon
            :color="confirmDialog.action === 'approve' ? 'grey-darken-4' : 'red-darken-1'"
            size="22"
          >
            {{ confirmDialog.action === 'approve' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline' }}
          </v-icon>
          <span class="text-body-1 font-weight-bold">
            {{ confirmDialog.action === 'approve' ? 'Approve' : 'Reject' }} Purchase Requisition
          </span>
        </v-card-title>

        <v-card-text class="px-5 pb-2 text-body-2 text-grey-darken-2">
          Are you sure you want to
          <strong>{{ confirmDialog.action }}</strong>
          PR <strong>{{ confirmDialog.prNumber }}</strong>?
          This action cannot be undone.
        </v-card-text>

        <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
          <v-btn
            variant="outlined"
            class="text-none"
            :disabled="loading"
            @click="closeConfirm"
          >
            Cancel
          </v-btn>
          <v-btn
            :color="confirmDialog.action === 'approve' ? 'grey-darken-4' : 'red-darken-1'"
            :variant="confirmDialog.action === 'approve' ? 'flat' : 'outlined'"
            class="text-none"
            :loading="loading"
            @click="handleConfirm"
          >
            Yes, {{ confirmDialog.action === 'approve' ? 'Approve' : 'Reject' }}
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
.actions-gap {
  gap: 6px;
}
.pr-row:hover td {
  background: #fafafa;
}
:deep(.v-table thead tr th) {
  background: #f5f5f5 !important;
  padding: 12px 16px !important;
  letter-spacing: 0.04em;
  border-bottom: 1px solid #e0e0e0 !important;
}
:deep(.v-table tbody tr td) {
  padding: 14px 16px !important;
  vertical-align: middle;
}
:deep(.v-table tbody tr:not(:last-child) td) {
  border-bottom: 1px solid #f0f0f0 !important;
}
</style>