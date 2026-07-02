<script setup lang="ts">
import { onMounted } from 'vue'
import { useExpenses, headers } from '../composables/useExpenses'
import AddExpenseDialog from './dialogs/AddExpenseDialog.vue'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const {
  expenses, cashAccounts, loading,
  showFormDialog,
  showDeleteDialog,
  init, openFormDialog, handleSubmit, openDeleteDialog, confirmDelete,
} = useExpenses()

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <v-card class="mx-auto w-100" max-width="1400" rounded="lg" elevation="1">

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
          <v-btn
            icon="mdi-delete"
            size="small"
            variant="text"
            color="error"
            @click="openDeleteDialog(item.id)"
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

    <v-dialog v-model="showDeleteDialog" max-width="400px" persistent>
      <v-card rounded="lg">
        <v-card-title class="text-h6 pa-6">
          <v-icon icon="mdi-alert-circle" color="warning" class="mr-3" />
          Confirm Delete
        </v-card-title>
        <v-card-text class="pa-6 pt-0">
          <p class="mb-4">Are you sure you want to delete this expense?</p>
          <v-alert type="warning" variant="tonal" class="mb-0">
            <strong>This action cannot be undone.</strong>
          </v-alert>
        </v-card-text>
        <v-card-actions class="pa-6 pt-0">
          <v-spacer />
          <v-btn variant="outlined" :disabled="loading" @click="showDeleteDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="loading" @click="confirmDelete">
            <v-icon start>mdi-delete</v-icon>
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
