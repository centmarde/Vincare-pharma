<script setup lang="ts">
import type { PR } from '@/stores/purchaseRequisition'
import { usePRDetailModal, formatCurrency, formatDate } from '../composables/usePRDetailModal'

const props = defineProps<{ pr: PR }>()
const model = defineModel<boolean>()

const {
  statusConfig,
  customerOfferTotal,
  companyCostTotal,
  profit,
  isProfitable,
  offerCostRatio,
  marginPercent,
} = usePRDetailModal(props)
</script>

<template>
  <v-dialog v-model="model" max-width="760" scrollable>
    <v-card rounded="lg">

      <v-card-text class="pa-6 pb-2">

        <!-- Header -->
        <h2 class="text-h6 font-weight-bold mb-2">
          Purchase Requisition {{ pr.pr_number }}
        </h2>

        <!-- Meta row -->
        <div class="d-flex align-center flex-wrap gap-2 text-body-2 mb-4">
          <span>Requested by <strong>{{ pr.requester_name ?? '—' }}</strong></span>
          <span>&nbsp; - &nbsp;</span>
          <span>{{ formatDate(pr.created_at) }}</span>
          <span>&nbsp; ● &nbsp;<strong>Status:</strong> </span>
          <span
            class="status-chip text-caption font-weight-bold"
            :class="`status-chip--${pr.status}`"
          >
            <span class="status-dot" />
            {{ statusConfig(pr.status).label }}
          </span>
          <template v-if="pr.reviewed_by">
            <div class="w-100" />
            <span>
              {{ pr.status === 'approved' ? 'Approved' : 'Rejected' }} by
              <strong>{{ pr.reviewer_name ?? '—' }}</strong>&nbsp; - &nbsp;{{ formatDate(pr.reviewed_at) }}
            </span>
          </template>
        </div>

        <!-- Items Table -->
        <v-table density="compact" class="items-table rounded-lg mb-4">
          <thead>
            <tr class="bg-blue-darken-3">
              <th class="table-header text-caption">#</th>
              <th class="table-header text-caption">UNIT</th>
              <th class="table-header text-caption">ITEM DESCRIPTION</th>
              <th class="table-header text-caption">QTY</th>
              <th class="table-header text-caption">OFFER/UNIT</th>
              <th class="table-header text-caption">OFFER TOTAL</th>
              <th class="table-header text-caption">COST/UNIT</th>
              <th class="table-header text-caption">COST TOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in pr.items" :key="item.id">
              <td class="text-body-2">{{ item.no }}</td>
              <td class="text-body-2">{{ item.unit }}</td>
              <td class="text-body-2">{{ item.item_description }}</td>
              <td class="text-body-2">{{ item.qty.toLocaleString() }}</td>
              <td class="text-body-2">{{ formatCurrency(item.offer_per_unit) }}</td>
              <td class="text-body-2">{{ formatCurrency(item.qty * item.offer_per_unit) }}</td>
              <td class="text-body-2">{{ formatCurrency(item.cost_per_unit) }}</td>
              <td class="text-body-2">{{ formatCurrency(item.qty * item.cost_per_unit) }}</td>
            </tr>
          </tbody>
        </v-table>

        <!-- Summary Card -->
        <div class="d-flex justify-end mb-4">
          <v-card
            variant="tonal"
            rounded="lg"
            class="pa-4 border"
            min-width="340"
          >
            <div class="d-flex justify-space-between align-center mb-2">
              <span class="text-body-2 text-medium-emphasis">Customer Offer Total</span>
              <span class="text-body-1 font-weight-bold">{{ formatCurrency(customerOfferTotal) }}</span>
            </div>

            <div class="d-flex justify-space-between align-center mb-3">
              <span class="text-body-2 text-medium-emphasis">Company Cost Total</span>
              <span class="text-body-1 font-weight-bold">{{ formatCurrency(companyCostTotal) }}</span>
            </div>

            <v-divider class="mb-3" />

            <div class="d-flex justify-space-between align-center mb-2">
              <span class="text-body-2 text-medium-emphasis">Profit / (Loss)</span>
              <div class="d-flex align-center gap-2">
                <span
                  class="text-body-1 font-weight-bold"
                  :class="isProfitable ? 'text-green-darken-2' : 'text-red-darken-2'"
                >
                  {{ formatCurrency(profit) }}
                </span>
                <v-chip
                  :color="isProfitable ? 'green' : 'red'"
                  variant="tonal"
                  size="small"
                  class="font-weight-bold"
                >
                  {{ isProfitable ? '● Profitable' : '● Loss' }}
                </v-chip>
              </div>
            </div>

            <div class="d-flex justify-space-between align-center">
              <span class="text-body-2 text-medium-emphasis">Offer : Cost Ratio</span>
              <span class="text-body-2 font-weight-bold">
                {{ offerCostRatio }}x · {{ marginPercent }}% margin
              </span>
            </div>
          </v-card>
        </div>

        <!-- Justification -->
        <div v-if="pr.justification" class="text-body-2 text-medium-emphasis">
          <strong>Justification:</strong> {{ pr.justification }}
        </div>

      </v-card-text>

      <!-- Footer -->
      <v-card-actions class="px-6 pb-5 pt-2 justify-end">
        <v-btn variant="outlined" class="text-none" @click="model = false">
          Close
        </v-btn>
      </v-card-actions>

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

/* Table header — uses primary color with readable white text in both modes */
:deep(.items-table thead tr th.table-header) {
  color: #ffffff !important;
  font-weight: 600;
}
</style>