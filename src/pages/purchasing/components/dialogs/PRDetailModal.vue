<script setup lang="ts">
import { usePRDetailModal } from '../../composables/usePRDetailModal'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import type { PR } from '@/stores/purchaseRequisitionData'
import { useDisplay } from 'vuetify'
import { ref } from 'vue'
import PREditDialog from './PREditDialog.vue'

const { mobile } = useDisplay()

const props = defineProps<{ pr: PR }>()
const model = defineModel<boolean>()
const emit = defineEmits<{
  approve: [pr: PR]
  reject: [pr: PR]
  update: [data: { pr: PR; items: any[]; remarks: string }]
}>()

const showEditDialog = ref<boolean>(false)

const {
  statusConfig,
  customerOfferTotal,
  companyCostTotal,
  profit,
  isProfitable,
  offerCostRatio,
  marginPercent,
} = usePRDetailModal(props)

function onApprove() {
  model.value = false
  emit('approve', props.pr)
}

function onReject() {
  model.value = false
  emit('reject', props.pr)
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
              pr.status === 'issued' ||
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
              <th class="table-header text-caption">OFFER/UNIT</th>
              <th class="table-header text-caption">OFFER TOTAL</th>
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
              <td class="text-body-2">{{ formatCurrency(item.offer_per_unit ?? 0) }}</td>
              <td class="text-body-2">
                {{ formatCurrency(item.qty * (item.offer_per_unit ?? 0)) }}
              </td>
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
                  <span class="text-medium-emphasis">Offer/Unit: </span
                  >{{ formatCurrency(item.offer_per_unit ?? 0) }}
                </div>
                <div>
                  <span class="text-medium-emphasis">Offer Total: </span
                  >{{ formatCurrency(item.qty * (item.offer_per_unit ?? 0)) }}
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
            <div class="d-flex justify-space-between align-center mb-2">
              <span
                :class="
                  mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'
                "
                >Customer Offer Total</span
              >
              <span
                :class="mobile ? 'text-body-2 font-weight-bold' : 'text-body-1 font-weight-bold'"
                >{{ formatCurrency(customerOfferTotal) }}</span
              >
            </div>

            <div class="d-flex justify-space-between align-center mb-3">
              <span
                :class="
                  mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'
                "
                >Company Cost Total</span
              >
              <span
                :class="mobile ? 'text-body-2 font-weight-bold' : 'text-body-1 font-weight-bold'"
                >{{ formatCurrency(companyCostTotal) }}</span
              >
            </div>

            <v-divider class="mb-3" />

            <div class="d-flex justify-space-between align-center mb-2">
              <span
                :class="
                  mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'
                "
                >Profit / (Loss)</span
              >
              <div class="d-flex align-center ga-2">
                <span
                  :class="[
                    mobile ? 'text-caption font-weight-bold' : 'text-body-1 font-weight-bold',
                    isProfitable ? 'text-green-darken-2' : 'text-red-darken-2',
                  ]"
                >
                  {{ formatCurrency(profit) }}
                </span>
                <v-chip
                  :color="isProfitable ? 'green' : 'red'"
                  variant="tonal"
                  size="x-small"
                  class="font-weight-bold"
                >
                  {{ isProfitable ? '● Profitable' : '● Loss' }}
                </v-chip>
              </div>
            </div>

            <div class="d-flex justify-space-between align-center">
              <span
                :class="
                  mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'
                "
                >Offer : Cost Ratio</span
              >
              <span
                :class="mobile ? 'text-caption font-weight-bold' : 'text-body-2 font-weight-bold'"
              >
                {{ offerCostRatio }}x · {{ marginPercent }}% margin
              </span>
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
        :class="mobile ? 'px-3 pb-3 pt-2 d-flex justify-end' : 'px-6 pb-5 pt-2 d-flex justify-end'"
      >
        <div v-if="pr.status === 'pending_approval'" class="d-flex" style="gap: 16px">
          <v-btn
            variant="outlined"
            size="small"
            color="red-darken-2"
            class="text-none"
            elevation="1"
            @click="onReject"
          >
            <v-icon>mdi-close</v-icon>
            Reject
          </v-btn>
          <v-btn
            variant="tonal"
            prepend-icon="mdi-check-circle-outline"
            color="green-lighten-1"
            size="small"
            class="text-none"
            elevation="3"
            @click="onApprove"
          >
            Approve
          </v-btn>

          <v-btn
            variant="outlined"
            size="small"
            color="amber-darken-2"
            class="text-none"
            prepend-icon="mdi-file-document-edit-outline"
            @click="showEditDialog = true"
          >
            Undo/Edit
          </v-btn>
        </div>

        <v-btn variant="outlined" size="small" class="text-none" @click="model = false">
          Close
        </v-btn>
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

/* Table header — uses primary color with readable white text in both modes */
:deep(.items-table thead tr th.table-header) {
  color: #ffffff !important;
  font-weight: 600;
}
</style>
