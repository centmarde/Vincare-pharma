<script setup lang="ts">
import { onMounted } from 'vue'
import { useRemittance, headers } from '../composables/useRemittance'
import RemittanceSubmitDialog from './RemittanceSubmitDialog.vue'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const {
  remittances, loading,
  selectedOutletId, outletOptions, setOutlet,
  showSubmitDialog, expected, actualAmount, notes,
  discrepancy, requiresNote, canSubmit,
  init, openSubmitDialog, handleSubmit,
} = useRemittance()

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <v-card class="mx-auto w-100" max-width="1400" rounded="lg" elevation="1">

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
            {{ item.remittance_date ?? formatDatePR_ISO(item.created_at) }}
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
      </v-data-table>

    </v-card>

    <RemittanceSubmitDialog
      v-model="showSubmitDialog"
      :expected="expected"
      :actual-amount="actualAmount"
      :notes="notes"
      :discrepancy="discrepancy"
      :requires-note="requiresNote"
      :can-submit="canSubmit"
      :loading="loading"
      @update:actual-amount="actualAmount = $event"
      @update:notes="notes = $event"
      @submit="handleSubmit"
    />

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
