<script setup lang="ts">
import { onMounted } from 'vue'
import { useRemittance, headers } from '../composables/useRemittance'
import RemittanceSubmitDialog from './RemittanceSubmitDialog.vue'
import ChangeRequestDialog from '@/components/changeRequests/ChangeRequestDialog.vue'
import { useChangeRequestFiling } from '@/composables/useChangeRequestFiling'
import type { RemittanceType } from '@/stores/remittancesData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const {
  remittances, loading,
  selectedOutletId, outletOptions, setOutlet,
  showSubmitDialog, expected, actualAmount, notes, resolution,
  discrepancy, requiresNote, canSubmit, isShortfall, recommendReceivable,
  init, openSubmitDialog, handleSubmit,
} = useRemittance()

// A remittance is a cash-reconciliation artifact (GL-silent), so a correction
// to the counted cash / notes is an edit — there's no undo (allowVoid=false).
const { showDialog, config, isPending, loadPending, open, submit, submitting } =
  useChangeRequestFiling('sales', 'remittance')

function openChange(r: RemittanceType) {
  open({
    id: r.id,
    ref: r.remittance_no,
    fields: [
      { key: 'actual_amount', label: 'Actual Cash Counted', value: r.actual_amount, type: 'number' },
      { key: 'notes', label: 'Notes', value: r.notes, type: 'text' },
    ],
    voidSummary: '',
    allowEdit: true,
    allowVoid: false,
  })
}

onMounted(async () => { await init(); await loadPending() })
</script>

<template>

    <v-card class="mx-auto w-100" rounded="lg" elevation="1">

      <v-card-title class="d-flex justify-space-between align-center pa-5 flex-wrap ga-3">
        <span class="text-h6 font-weight-bold">Cash Remittances</span>
        <div class="d-flex align-center ga-3">
          <v-select
            :model-value="selectedOutletId"
            :items="outletOptions"
            item-title="title"
            item-value="value"
            label="Branch"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 200px"
            @update:model-value="setOutlet"
          />
          <v-btn
            color="primary"
            class="text-none font-weight-bold"
            elevation="0"
            prepend-icon="mdi-cash-multiple"
            @click="openSubmitDialog"
          >
            Close Day / Remit
          </v-btn>
        </div>
      </v-card-title>

      <v-divider />

      <v-data-table
        :headers="headers"
        :items="remittances"
        :loading="loading"
        loading-text="Loading remittances..."
        no-data-text="No remittances yet."
        hover
      >
        <template #item.remittance_no="{ item }">
          <span class="font-weight-medium">{{ item.remittance_no }}</span>
        </template>

        <template #item.outlet="{ item }">
          {{ item.outlet?.name ?? '—' }}
        </template>

        <template #item.remittance_date="{ item }">
          <span class="text-body-2 text-medium-emphasis">
            {{ formatDatePR_ISO(item.remittance_date ?? item.created_at) }}
          </span>
        </template>

        <template #item.expected_amount="{ item }">
          {{ formatCurrency(item.expected_amount ?? 0) }}
        </template>

        <template #item.actual_amount="{ item }">
          {{ formatCurrency(item.actual_amount ?? 0) }}
        </template>

        <template #item.discrepancy="{ item }">
          <v-chip
            :color="(item.discrepancy ?? 0) === 0 ? 'success' : 'error'"
            size="small"
            variant="tonal"
            class="font-weight-bold"
          >
            {{ formatCurrency(item.discrepancy ?? 0) }}
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

        <template #item.cr_actions="{ item }">
          <v-chip v-if="isPending(item.id)" size="x-small" color="warning" variant="tonal" label>Change pending</v-chip>
          <v-btn
            v-else icon="mdi-pencil-box-outline" size="small" variant="text" color="primary"
            title="Request a correction (needs executive approval)"
            @click="openChange(item)"
          />
        </template>
      </v-data-table>

    </v-card>

    <ChangeRequestDialog
      v-if="config"
      v-model="showDialog"
      :target-ref="config.ref"
      :fields="config.fields"
      :allow-edit="config.allowEdit"
      :allow-void="config.allowVoid"
      :void-summary="config.voidSummary"
      :loading="submitting"
      @submit="submit"
    />

    <RemittanceSubmitDialog
      v-model="showSubmitDialog"
      :expected="expected"
      :actual-amount="actualAmount"
      :notes="notes"
      :discrepancy="discrepancy"
      :requires-note="requiresNote"
      :can-submit="canSubmit"
      :loading="loading"
      :is-shortfall="isShortfall"
      :recommend-receivable="recommendReceivable"
      :resolution="resolution"
      @update:actual-amount="actualAmount = $event"
      @update:notes="notes = $event"
      @update:resolution="resolution = $event"
      @submit="handleSubmit"
    />


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
