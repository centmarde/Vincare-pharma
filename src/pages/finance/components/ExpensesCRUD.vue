<script setup lang="ts">
import { onMounted } from 'vue'
import { useExpenses, headers } from '../composables/useExpenses'
import AddExpenseDialog from './dialogs/AddExpenseDialog.vue'
import ChangeRequestDialog from '@/components/changeRequests/ChangeRequestDialog.vue'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const {
  expenses, cashAccounts, loading,
  showFormDialog,
  showChangeDialog, changeTarget, changeFields, voidSummary, isPending,
  init, openFormDialog, handleSubmit, openChangeDialog, submitChangeRequest,
} = useExpenses()

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">

      <v-card-title class="d-flex justify-space-between align-center pa-5">
        <span class="text-h6 font-weight-bold">Operational Expenses</span>
        <v-btn
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          prepend-icon="mdi-cash-minus"
          @click="openFormDialog"
        >
          Record Expense
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-data-table
        :headers="headers"
        :items="expenses"
        :loading="loading"
        loading-text="Loading expenses..."
        no-data-text="No expenses recorded yet."
        hover
      >
        <template #item.reference_no="{ item }">
          <span class="font-weight-medium">{{ item.reference_no }}</span>
        </template>

        <template #item.paid_at="{ item }">
          <span class="text-body-2 text-medium-emphasis">
            {{ item.paid_at ? formatDatePR_ISO(item.paid_at) : formatDatePR_ISO(item.created_at) }}
          </span>
        </template>

        <template #item.department="{ item }">
          {{ item.department ?? '—' }}
        </template>

        <template #item.category="{ item }">
          <v-chip size="small" variant="tonal" color="primary">{{ item.category }}</v-chip>
        </template>

        <template #item.remarks="{ item }">
          <span class="text-truncate d-inline-block" style="max-width: 200px">{{ item.remarks ?? '—' }}</span>
        </template>

        <template #item.or_si_no="{ item }">
          {{ item.or_si_no ?? '—' }}
        </template>

        <template #item.paid_to="{ item }">
          {{ item.paid_to ?? '—' }}
        </template>

        <template #item.cash_account_name="{ item }">
          {{ item.cash_account_name ?? '—' }}
        </template>

        <template #item.amount="{ item }">
          {{ formatCurrency(item.amount ?? 0) }}
        </template>

        <template #item.actions="{ item }">
          <v-chip v-if="isPending(item.id)" size="x-small" color="warning" variant="tonal" label>
            Change pending
          </v-chip>
          <v-btn
            v-else
            icon="mdi-pencil-box-outline"
            size="small"
            variant="text"
            color="primary"
            title="Request edit or undo (needs executive approval)"
            @click="openChangeDialog(item.id)"
          />
        </template>
      </v-data-table>

    </v-card>

    <AddExpenseDialog
      v-model="showFormDialog"
      :accounts="cashAccounts"
      :loading="loading"
      @submit="handleSubmit"
    />

    <ChangeRequestDialog
      v-model="showChangeDialog"
      :target-ref="changeTarget?.reference_no ?? null"
      :fields="changeFields"
      :allow-edit="true"
      :allow-void="true"
      :void-summary="voidSummary"
      :loading="loading"
      @submit="submitChangeRequest"
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
