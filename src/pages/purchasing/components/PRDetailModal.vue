<script setup lang="ts">
import { computed } from 'vue'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisition'
import type { PR } from '@/stores/purchaseRequisition'

const store = usePurchaseRequisitionStore()
const { statusConfig } = store

// ─── Props ────────────────────────────────────────────────────────────────────

const props = defineProps<{ pr: PR }>()
const model = defineModel<boolean>()

// ─── Computed ─────────────────────────────────────────────────────────────────

const customerOfferTotal = computed(() =>
  props.pr.items.reduce((sum, i) => sum + i.qty * i.offer_per_unit, 0)
)

const companyCostTotal = computed(() =>
  props.pr.items.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)
)

const profit = computed(() => customerOfferTotal.value - companyCostTotal.value)
const isProfitable = computed(() => profit.value > 0)

const offerCostRatio = computed(() => {
  if (companyCostTotal.value === 0) return '0.00'
  return (customerOfferTotal.value / companyCostTotal.value).toFixed(2)
})

const marginPercent = computed(() => {
  if (customerOfferTotal.value === 0) return '0'
  return Math.floor((profit.value / customerOfferTotal.value) * 100)
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value).replace('PHP', '₱')

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })
}
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
        <div class="d-flex align-center flex-wrap gap-2 text-body-2 text-grey-darken-1 mb-4">
          <span>Requested by <strong>{{ pr.requester_name ?? '—' }}</strong></span>
          <span>·</span>
          <span>{{ formatDate(pr.created_at) }}</span>
          <span>·</span>
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
          <template v-if="pr.reviewed_by">
            <span>·</span>
            <span>
              {{ pr.status === 'approved' ? 'Approved' : 'Rejected' }} by
              <strong>{{ pr.reviewer_name ?? '—' }}</strong>
              on {{ formatDate(pr.reviewed_at) }}
            </span>
          </template>
        </div>

        <!-- Items Table -->
        <v-table density="compact" class="items-table rounded-lg mb-4">
          <thead>
            <tr class="bg-blue-darken-3">
              <th class="text-white text-caption">#</th>
              <th class="text-white text-caption">UNIT</th>
              <th class="text-white text-caption">ITEM DESCRIPTION</th>
              <th class="text-white text-caption">QTY</th>
              <th class="text-white text-caption">OFFER/UNIT</th>
              <th class="text-white text-caption">OFFER TOTAL</th>
              <th class="text-white text-caption">COST/UNIT</th>
              <th class="text-white text-caption">COST TOTAL</th>
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
            variant="flat"
            color="#f9f9f7"
            rounded="lg"
            class="pa-4 border"
            min-width="340"
          >
            <div class="d-flex justify-space-between align-center mb-2">
              <span class="text-body-2 text-grey-darken-1">Customer Offer Total</span>
              <span class="text-body-1 font-weight-bold">{{ formatCurrency(customerOfferTotal) }}</span>
            </div>

            <div class="d-flex justify-space-between align-center mb-3">
              <span class="text-body-2 text-grey-darken-1">Company Cost Total</span>
              <span class="text-body-1 font-weight-bold">{{ formatCurrency(companyCostTotal) }}</span>
            </div>

            <v-divider class="mb-3" />

            <div class="d-flex justify-space-between align-center mb-2">
              <span class="text-body-2 text-grey-darken-1">Profit / (Loss)</span>
              <div class="d-flex align-center gap-2">
                <span
                  class="text-body-1 font-weight-bold"
                  :class="isProfitable ? 'text-green-darken-2' : 'text-red-darken-2'"
                >
                  {{ formatCurrency(profit) }}
                </span>
                <v-chip
                  :color="isProfitable ? 'green-lighten-4' : 'red-lighten-4'"
                  size="small"
                  class="font-weight-bold"
                  :class="isProfitable ? 'text-green-darken-3' : 'text-red-darken-3'"
                >
                  {{ isProfitable ? '● Profitable' : '● Loss' }}
                </v-chip>
              </div>
            </div>

            <div class="d-flex justify-space-between align-center">
              <span class="text-body-2 text-grey-darken-1">Offer : Cost Ratio</span>
              <span class="text-body-2 font-weight-bold">
                {{ offerCostRatio }}x · {{ marginPercent }}% margin
              </span>
            </div>
          </v-card>
        </div>

        <!-- Justification -->
        <div v-if="pr.justification" class="text-body-2 text-grey-darken-2">
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
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 20px;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.items-table :deep(th) {
  padding: 10px 12px !important;
  font-weight: 600 !important;
  letter-spacing: 0.04em;
}
.items-table :deep(td) {
  padding: 10px 12px !important;
}
.gap-2 {
  gap: 8px;
}
</style>