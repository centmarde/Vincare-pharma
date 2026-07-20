<script setup lang="ts">
import {
  useDiscrepancies,
  remittanceHeaders, arAgingHeaders, commissionHeaders, stockReconHeaders, employeeReceivableHeaders,
} from '../composables/useDiscrepancies'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const {
  tab, onTabChange,
  remittanceDiscrepancies, showResolvedRemittances, arAging, commissionLiability, stockReconciliation, loading,
  receivables, receivablesLoading, markReceivablePaid,
} = useDiscrepancies()
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">

      <v-card-title class="pa-4 pa-sm-5 pb-3 text-h6 font-weight-bold">Discrepancies</v-card-title>

      <v-tabs :model-value="tab" color="primary" class="px-4" @update:model-value="onTabChange">
        <v-tab value="remittance">Remittance Float</v-tab>
        <v-tab value="ar">AR Aging</v-tab>
        <v-tab value="employeeReceivables">Employee Receivables</v-tab>
        <v-tab value="commission">Commission Liability</v-tab>
        <v-tab value="stock">Stock Reconciliation</v-tab>
      </v-tabs>

      <v-divider />

      <v-window :model-value="tab">
        <v-window-item value="remittance">
          <div class="d-flex justify-end px-4 pt-3">
            <v-switch
              v-model="showResolvedRemittances"
              label="Show resolved"
              color="primary"
              density="compact"
              hide-details
              inset
            />
          </div>
          <v-data-table
            :headers="remittanceHeaders"
            :items="remittanceDiscrepancies"
            :loading="loading"
            loading-text="Loading remittance discrepancies..."
            :no-data-text="showResolvedRemittances ? 'No remittance discrepancies.' : 'No open remittance discrepancies — all balanced.'"
            hover
          >
            <template #item.created_at="{ item }">
              {{ formatDatePR_ISO(item.created_at) }}
            </template>
            <template #item.expected_amount="{ item }">
              {{ formatCurrency(item.expected_amount) }}
            </template>
            <template #item.actual_amount="{ item }">
              {{ formatCurrency(item.actual_amount) }}
            </template>
            <template #item.discrepancy="{ item }">
              <v-chip color="error" size="small" variant="tonal" class="font-weight-bold">
                {{ formatCurrency(item.discrepancy) }}
              </v-chip>
            </template>
            <template #item.resolution="{ item }">
              <v-chip v-if="item.resolution === 'paid_on_spot'" size="small" variant="tonal" color="success">Paid on spot — Balanced</v-chip>
              <v-chip
                v-else-if="item.resolution === 'employee_receivable'"
                size="small" variant="tonal"
                :color="item.receivable_status === 'paid' ? 'success' : 'warning'"
              >
                {{ item.receivable_status === 'paid' ? 'Employee Receivable — Paid, Balanced' : 'Employee Receivable — Outstanding' }}
              </v-chip>
              <span v-else class="text-medium-emphasis">—</span>
            </template>
            <template #item.notes="{ item }">
              <span class="text-caption">{{ item.notes ?? '—' }}</span>
            </template>
          </v-data-table>
        </v-window-item>

        <v-window-item value="employeeReceivables">
          <v-data-table
            :headers="employeeReceivableHeaders"
            :items="receivables"
            :loading="receivablesLoading"
            loading-text="Loading employee receivables..."
            no-data-text="No employee receivables recorded."
            hover
          >
            <template #item.created_at="{ item }">
              {{ formatDatePR_ISO(item.created_at) }}
            </template>
            <template #item.employee_email="{ item }">
              {{ item.employee_email ?? '—' }}
            </template>
            <template #item.amount="{ item }">
              {{ formatCurrency(item.amount) }}
            </template>
            <template #item.remarks="{ item }">
              <span class="text-caption">{{ item.remarks ?? '—' }}</span>
            </template>
            <template #item.status="{ item }">
              <v-chip :color="item.status === 'paid' ? 'success' : 'warning'" size="small" variant="tonal" class="font-weight-bold">
                {{ item.status === 'paid' ? 'Paid' : 'Outstanding' }}
              </v-chip>
            </template>
            <template #item.actions="{ item }">
              <v-btn
                v-if="item.status === 'outstanding'"
                size="small" color="success" variant="tonal" class="text-none"
                @click="markReceivablePaid(item.id)"
              >
                Mark Paid
              </v-btn>
            </template>
          </v-data-table>
        </v-window-item>

        <v-window-item value="ar">
          <v-data-table
            :headers="arAgingHeaders"
            :items="arAging"
            :loading="loading"
            loading-text="Loading AR aging..."
            no-data-text="No outstanding receivables."
            hover
          >
            <template #item.source="{ item }">
              <v-chip size="small" variant="tonal">{{ item.source === 'ethical_order' ? 'Ethical' : 'In-House' }}</v-chip>
            </template>
            <template #item.customer_name="{ item }">
              {{ item.customer_name ?? '—' }}
            </template>
            <template #item.balance="{ item }">
              {{ formatCurrency(item.balance) }}
            </template>
            <template #item.days_overdue="{ item }">
              {{ item.days_overdue ?? '—' }}
            </template>
            <template #item.term="{ item }">
              <v-chip
                size="small"
                variant="tonal"
                :color="item.term === 'current' ? 'success' : item.term === 'no-term' ? 'grey' : 'warning'"
              >
                {{ item.term }}
              </v-chip>
            </template>
          </v-data-table>
        </v-window-item>

        <v-window-item value="commission">
          <v-data-table
            :headers="commissionHeaders"
            :items="commissionLiability"
            :loading="loading"
            loading-text="Loading commission liability..."
            no-data-text="No unpaid commissions."
            hover
          >
            <template #item.agent_name="{ item }">
              {{ item.agent_name ?? '—' }}
            </template>
            <template #item.unpaid_commission="{ item }">
              {{ formatCurrency(item.unpaid_commission) }}
            </template>
            <template #item.oldest_unpaid_days="{ item }">
              {{ item.oldest_unpaid_days ?? '—' }}
            </template>
            <template #item.flagged="{ item }">
              <v-chip v-if="item.flagged" color="error" size="small" variant="tonal">Flagged</v-chip>
              <span v-else class="text-medium-emphasis">—</span>
            </template>
          </v-data-table>
        </v-window-item>

        <v-window-item value="stock">
          <v-alert type="info" variant="tonal" density="compact" class="ma-4">
            Read-only check. Flags drift between recomputed expected stock and live on-hand quantities — it never auto-corrects.
          </v-alert>
          <v-data-table
            :headers="stockReconHeaders"
            :items="stockReconciliation"
            :loading="loading"
            loading-text="Computing stock reconciliation..."
            no-data-text="No drift detected."
            hover
          >
            <template #item.product_name="{ item }">
              {{ item.product_name ?? '—' }}
            </template>
            <template #item.drift="{ item }">
              <v-chip :color="item.drift > 0 ? 'warning' : 'error'" size="small" variant="tonal" class="font-weight-bold">
                {{ item.drift > 0 ? '+' : '' }}{{ item.drift }}
              </v-chip>
            </template>
          </v-data-table>
        </v-window-item>
      </v-window>

    </v-card>
  </v-container>
</template>

<style scoped>
:deep(.v-data-table thead th) {
  background: #f5f5f5 !important;
  font-weight: 700 !important;
  font-size: 0.75rem !important;
  letter-spacing: 0.04em;
  color: #616161 !important;
}
:deep(.v-data-table td) {
  text-align: center !important;
}
</style>
