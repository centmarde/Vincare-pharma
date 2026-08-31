<script setup lang="ts">
import { usePRDetailModal } from '../../composables/usePRDetailModal'
import { formatCurrency, formatDatePR_ISO, formatExpiryMonthYear } from '@/utils/helpers'
import type { PR } from '@/stores/purchaseRequisitionData'
import { useDisplay } from 'vuetify'
import { ref } from 'vue'
import PREditDialog from './PREditDialog.vue'
import { useConfirmDialog } from '@/composables/useConfirmDialog'

const { mobile } = useDisplay()

const props = defineProps<{ pr: PR }>()
const model = defineModel<boolean>()
const emit = defineEmits<{
  approve: [pr: PR]
  reject: [pr: PR]
  unapprove: [pr: PR, reason: string]
  update: [data: { pr: PR; items: any[]; remarks: string }]
}>()

const showEditDialog = ref<boolean>(false)

const { statusConfig, companyCostTotal } = usePRDetailModal(props)

const { confirmDialog: showUnapproveDialog, inputValue } = useConfirmDialog()

function onApprove() {
  model.value = false
  emit('approve', props.pr)
}

function onReject() {
  model.value = false
  emit('reject', props.pr)
}

async function onUnapprove() {
  const confirmed = await showUnapproveDialog(
    `This undo_PR request for (${props.pr.requisition_no}) will revert the PR back to "Pending Approval" status. A change request record will be created for audit trail.\n\nPlease provide a reason for undoing this PR.`,
    {
      title: 'Submit Unapprove Request',
      confirmText: 'Submit Request',
      cancelText: 'Cancel',
      inputLabel: 'Reason for undoing this PR',
    },
  )
  if (confirmed) {
    model.value = false
    emit('unapprove', props.pr, inputValue.value)
  }
}
</script>

<template>
  <v-dialog v-model="model" :max-width="mobile ? '95%' : '900'" scrollable>
    <v-card rounded="lg">
      <v-card-text :class="mobile ? 'pa-3 pb-2' : 'pa-6 pb-2'">
        <!-- Close button -->
        <div class="d-flex justify-end mb-2">
          <v-btn icon="mdi-close" variant="text" size="small" color="grey" @click="model = false" />
        </div>

        <!-- Header -->
        <h2
          :class="
            mobile ? 'text-subtitle-1 font-weight-bold mb-2' : 'text-h6 font-weight-bold mb-2'
          "
        >
          Purchase Requisition: {{ pr.requisition_no }}
          <span>&nbsp; - &nbsp;Status: </span>
          <span
            class="status-chip text-caption font-weight-bold"
            :class="`status-chip--${pr.status}`"
          >
            <span class="status-dot" />
            {{ statusConfig(pr.status).label }}
          </span>
        </h2>

        <!-- Meta row -->
        <div :class="mobile ? 'text-caption' : 'text-body-2'" class="mb-4">
          <div>
            Requested by <strong>{{ pr.requester_name ?? '—' }}</strong> &middot;
            {{ formatDatePR_ISO(pr.created_at) }}
          </div>
          <template
            v-if="
              pr.status === 'approved' ||
              pr.status === 'rejected' ||
              pr.status === 'ordered' ||
              pr.status === 'complete'
            "
          >
            <div>
              {{ pr.status === 'rejected' ? 'Rejected' : 'Approved' }} by
              <strong>{{ pr.reviewer_name ?? '—' }}</strong> &middot;
              {{ formatDatePR_ISO(pr.updated_at) }}
            </div>
          </template>
        </div>

        <!-- ── Desktop: Items Table ──────────────────────────── -->
        <v-table v-if="!mobile" density="compact" class="items-table rounded-lg mb-4">
          <thead>
            <tr class="bg-blue-darken-3">
              <th class="table-header text-caption">#</th>
              <th class="table-header text-caption">UNIT</th>
              <th class="table-header text-caption">ITEM DESCRIPTION</th>
              <th class="table-header text-caption">QTY</th>
              <th class="table-header text-caption">SUPPLIER</th>
              <th class="table-header text-caption">EXPIRY</th>
              <th class="table-header text-caption">COST/UNIT</th>
              <th class="table-header text-caption">COST TOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in pr.items" :key="item.id">
              <td class="text-body-2">{{ item.no ?? 0 }}</td>
              <td class="text-body-2">{{ item.unit }}</td>
              <td class="text-body-2">{{ item.item_description }}</td>
              <td class="text-body-2">{{ item.qty.toLocaleString() }}</td>
              <td class="text-body-2">{{ item.supplier_name ?? '—' }}</td>
              <td class="text-body-2">{{ formatExpiryMonthYear(item.expiry_date) }}</td>
              <td class="text-body-2">{{ formatCurrency(item.cost_per_unit ?? 0) }}</td>
              <td class="text-body-2">
                {{ formatCurrency(item.qty * (item.cost_per_unit ?? 0)) }}
              </td>
            </tr>
          </tbody>
        </v-table>

        <!-- ── Mobile: Items as Cards ────────────────────────── -->
        <div v-else class="mb-4">
          <div class="text-caption font-weight-bold text-medium-emphasis mb-2">ITEMS</div>
          <v-card
            v-for="item in pr.items"
            :key="item.id"
            class="mb-2"
            variant="outlined"
            rounded="lg"
          >
            <v-card-text class="pa-3">
              <div class="d-flex justify-space-between align-start mb-1">
                <div class="d-flex ga-2 align-center">
                  <span class="text-caption font-weight-bold text-primary"
                    >#{{ item.no ?? 0 }}</span
                  >
                  <span class="text-caption font-weight-medium">{{ item.item_description }}</span>
                </div>
              </div>
              <v-divider class="my-1" />
              <div class="d-flex flex-wrap ga-3 text-caption">
                <div><span class="text-medium-emphasis">Unit: </span>{{ item.unit }}</div>
                <div>
                  <span class="text-medium-emphasis">Qty: </span>{{ item.qty.toLocaleString() }}
                </div>
                <div>
                  <span class="text-medium-emphasis">Supplier: </span
                  >{{ item.supplier_name ?? '—' }}
                </div>
                <div>
                  <span class="text-medium-emphasis">Expiry: </span
                  >{{ formatExpiryMonthYear(item.expiry_date) }}
                </div>
                <div>
                  <span class="text-medium-emphasis">Cost/Unit: </span
                  >{{ formatCurrency(item.cost_per_unit ?? 0) }}
                </div>
                <div>
                  <span class="text-medium-emphasis">Cost Total: </span
                  ><span class="font-weight-medium">{{
                    formatCurrency(item.qty * (item.cost_per_unit ?? 0))
                  }}</span>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </div>

        <!-- Summary Card -->
        <div :class="mobile ? '' : 'd-flex justify-end mb-4'">
          <v-card
            variant="tonal"
            rounded="lg"
            :class="mobile ? 'pa-3 border' : 'pa-4 border'"
            :min-width="mobile ? '100%' : '340'"
          >
            <div class="d-flex justify-space-between align-center">
              <span
                :class="
                  mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'
                "
                >Total Cost</span
              >
              <span
                :class="mobile ? 'text-body-2 font-weight-bold' : 'text-body-1 font-weight-bold'"
                >{{ formatCurrency(companyCostTotal) }}</span
              >
            </div>
          </v-card>
        </div>

        <!-- Justification -->
        <div
          v-if="pr.remarks"
          :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'"
        >
          <strong>Justification:</strong> {{ pr.remarks }}
        </div>
      </v-card-text>

      <!-- Footer -->
      <v-card-actions
        :class="mobile ? 'px-3 pb-3 pt-2 d-flex justify-end align-center' : 'px-6 pb-5 pt-2 d-flex justify-end align-center'"
      >
        <div class="d-flex" style="gap: 16px">
          <template
            v-if="
              pr.status !== 'approved' &&
              pr.status !== 'rejected' &&
              pr.status !== 'ordered' &&
              pr.status !== 'complete' &&
              pr.status !== 'change_request'
            "
          >
            <v-btn
              variant="outlined"
              size="small"
              color="amber-darken-2"
              class="text-none"
              prepend-icon="mdi-file-document-edit-outline"
              @click="showEditDialog = true"
            >
              Edit
            </v-btn>
          </template>

          <template v-else-if="pr.status === 'approved'">
            <v-btn
              variant="outlined"
              size="small"
              color="orange-darken-2"
              class="text-none"
              prepend-icon="mdi-undo-variant"
              elevation="1"
              @click="onUnapprove"
            >
              Unapprove
            </v-btn>
          </template>

          <v-btn variant="outlined" size="small" class="text-none" @click="model = false">
            Close
          </v-btn>
        </div>
      </v-card-actions>

      <!-- Edit/Undo Dialog -->
      <PREditDialog
        v-model="showEditDialog"
        :pr="pr"
        @save="(data) => emit('update', { pr: props.pr, ...data })"
      />
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Status chip — same as PRList, rgba backgrounds adapt to dark */
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

/* Table header — uses primary color with readable white text in both modes */
:deep(.items-table thead tr th.table-header) {
  color: #ffffff !important;
  font-weight: 600;
}
</style>
