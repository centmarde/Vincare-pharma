<script setup lang="ts">
import type { CreditMemoType } from '@/stores/creditMemosData'
import { creditMemoReasonLabel } from '@/stores/creditMemosData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

// What an executive sees before approving a credit memo: who, how much, off
// which bill, and why. Shared by the desktop and mobile approval dialogs.
defineProps<{ request: CreditMemoType }>()

const billLabel: Record<string, string> = { ethical_order: 'Ethical order', inhouse_order: 'In-House order', sale: 'POS charge' }
</script>

<template>
  <v-sheet rounded="lg" variant="tonal" color="surface-variant" class="pa-3 mb-4">
    <div class="d-flex align-center ga-3">
      <v-avatar size="36" rounded="lg" color="deep-purple" variant="tonal" class="flex-shrink-0">
        <v-icon color="deep-purple" icon="mdi-file-document-minus-outline" size="18" />
      </v-avatar>
      <div class="flex-grow-1" style="min-width: 0">
        <div class="d-flex align-center ga-2 flex-wrap">
          <span class="text-body-2 font-weight-bold">{{ request.customer_name ?? 'Customer not recorded' }}</span>
          <v-chip size="x-small" color="deep-purple" variant="tonal" label>Credit memo</v-chip>
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ billLabel[request.applies_to_type ?? ''] ?? 'Bill' }} {{ request.applies_to_no ?? `#${request.applies_to_id}` }}
          <template v-if="request.sales_return_no"> · from return {{ request.sales_return_no }}</template>
        </div>
      </div>
      <div class="text-h6 font-weight-bold">{{ formatCurrency(request.amount) }}</div>
    </div>

    <v-divider class="my-3" />

    <div class="d-flex ga-6 flex-wrap">
      <div>
        <div class="text-caption text-medium-emphasis">Reason</div>
        <div class="text-body-2 text-high-emphasis">{{ creditMemoReasonLabel(request.reason_code) }}</div>
      </div>
      <div>
        <div class="text-caption text-medium-emphasis">Requested on</div>
        <div class="text-body-2 text-high-emphasis">{{ formatDatePR_ISO(request.created_at) }}</div>
      </div>
    </div>
    <div class="mt-3">
      <div class="text-caption text-medium-emphasis">Explanation (printed on the credit memo)</div>
      <div class="text-body-2 text-high-emphasis">{{ request.reason || '—' }}</div>
    </div>
  </v-sheet>

  <v-alert type="info" variant="tonal" density="compact" icon="mdi-information-outline" class="mb-4 text-caption">
    Approving gives it its CM number and takes {{ formatCurrency(request.amount) }} off this bill.
    <template v-if="request.sales_return_id">It uses the credit from the returned goods.</template>
    <template v-else>It is booked as a sales allowance (reduces revenue).</template>
  </v-alert>
</template>
