<script setup lang="ts">
import { useTransactionsData } from '@/composables/useTransactionsData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import type { PR } from '@/stores/purchaseRequisitionData'

// Only data + state as props — behavior comes from composable/util imports
defineProps<{
  items: PR[]
  loading: boolean
  page: number
  totalPages: number
}>()

// Emit up instead of importing store/router logic here —
// keeps this component presentational and reusable
const emit = defineEmits<{
  (e: 'view-detail', item: PR): void
  (e: 'issue-po', item: PR): void
  (e: 'change-page', newPage: number): void
}>()

const { totalQty, totalCost, itemSummary, statusConfig } = useTransactionsData()
</script>

<template>
  <v-progress-linear v-if="loading" indeterminate color="primary" />
  <div v-if="!loading && items.length === 0" class="text-center pa-8 text-medium-emphasis">
    No purchase requisitions found.
  </div>

  <div class="pa-3" style="display: flex; flex-direction: column; gap: 10px">
    <v-card
      v-for="item in items"
      :key="item.requisition_no"
      rounded="lg"
      border
      elevation="0"
      class="pr-mobile-card"
    >
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

      <div class="px-4 pb-2" style="display: flex; flex-direction: column; gap: 6px">
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

        <div class="d-flex align-center" style="gap: 8px">
          <v-icon size="16" class="text-medium-emphasis flex-shrink-0">mdi-currency-php</v-icon>
          <span class="text-body-2 font-weight-medium">{{
            formatCurrency(totalCost(item.items))
          }}</span>
        </div>

        <div class="d-flex align-center justify-space-between">
          <div class="d-flex align-center" style="gap: 6px">
            <v-icon size="16" class="text-medium-emphasis">mdi-account-outline</v-icon>
            <span class="text-caption text-medium-emphasis">{{ item.requester_name }}</span>
          </div>
          <span class="text-caption text-medium-emphasis">
            {{ formatDatePR_ISO(item.created_at) }}
          </span>
        </div>

        <div v-if="item.reviewer_name" class="d-flex align-center" style="gap: 6px">
          <v-icon size="16" class="text-medium-emphasis">mdi-account-check-outline</v-icon>
          <span class="text-caption text-medium-emphasis"
            >Reviewed by {{ item.reviewer_name }}</span
          >
        </div>
      </div>

      <!-- emit instead of calling parent methods directly -->
      <div class="px-4 pb-3 pt-1 d-flex flex-column" style="gap: 6px">
        <v-btn variant="outlined" size="small" class="text-none" block @click="emit('view-detail', item)">
          View Details
        </v-btn>
        <template v-if="item.status === 'approved'">
          <v-btn
            variant="outlined"
            size="small"
            class="text-none"
            prepend-icon="mdi-printer-outline"
            block
            @click="emit('issue-po', item)"
          >
            Issue PO
          </v-btn>
        </template>
      </div>
    </v-card>
  </div>

  <!-- pagination UI stays here, but the actual page logic (goToPage) lives in parent -->
  <div class="d-flex align-center justify-center ga-2 py-4">
    <v-btn
      icon="mdi-chevron-left"
      variant="text"
      size="small"
      :disabled="page <= 1 || loading"
      @click="emit('change-page', page - 1)"
    />
    <span class="text-body-2 text-medium-emphasis mx-2" style="min-width: 80px; text-align: center">
      Page {{ page }} of {{ totalPages }}
    </span>
    <v-btn
      icon="mdi-chevron-right"
      variant="text"
      size="small"
      :disabled="page >= totalPages || loading"
      @click="emit('change-page', page + 1)"
    />
  </div>
</template>

<style scoped>
/* Duplicated from parent — scoped styles don't inherit across components,
   so status-chip + pr-mobile-card rules need to live here too */
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
.status-chip--issued { color: #7C3AED; background: rgba(79, 70, 229, 0.12); }
.status-chip--complete { color: #15803D; background: rgba(47, 133, 90, 0.12); }

.pr-mobile-card {
  transition: box-shadow 0.15s ease;
}
.pr-mobile-card:active {
  box-shadow: 0 0 0 2px rgba(var(v-theme-primary), 0.3) !important;
}
</style>