<script setup lang="ts">
import { useExpenseReport } from '../composables/useExpenseReport'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const {
  loading, dateFrom, dateTo, applyFilter, clearFilter,
  usedCategories, departmentGroups, grandTotals, categoryTitle,
} = useExpenseReport()
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <div class="w-100" style="max-width: 1600px; margin: 0 auto">

      <!-- Date range filter -->
      <v-row dense class="mb-1">
        <v-col cols="12" sm="4">
          <v-text-field v-model="dateFrom" type="date" label="From" density="compact" variant="outlined" hide-details />
        </v-col>
        <v-col cols="12" sm="4">
          <v-text-field v-model="dateTo" type="date" label="To" density="compact" variant="outlined" hide-details />
        </v-col>
        <v-col cols="12" sm="4" class="d-flex align-center ga-2">
          <v-btn color="primary" variant="flat" :loading="loading" @click="applyFilter">Apply</v-btn>
          <v-btn variant="text" @click="clearFilter">Clear</v-btn>
        </v-col>
      </v-row>

      <v-card rounded="lg" elevation="1">
        <v-card-title class="pa-5 text-h6 font-weight-bold">Expense Report</v-card-title>
        <v-divider />

        <div v-if="!departmentGroups.length" class="text-center text-medium-emphasis pa-10">
          No expenses recorded for this range.
        </div>

        <v-table v-else density="compact" class="expense-report-table">
          <thead>
            <tr>
              <th class="text-left">Date</th>
              <th class="text-left">Particulars</th>
              <th class="text-left">OR/SI No.</th>
              <th v-for="cat in usedCategories" :key="cat" class="text-right">{{ categoryTitle(cat) }}</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in departmentGroups" :key="group.department">
              <tr class="department-row">
                <td :colspan="3 + usedCategories.length + 1" class="text-left font-weight-bold">
                  {{ group.department }}
                </td>
              </tr>
              <tr v-for="row in group.rows" :key="row.id">
                <td class="text-left">{{ row.paid_at ? formatDatePR_ISO(row.paid_at) : formatDatePR_ISO(row.created_at) }}</td>
                <td class="text-left">{{ row.paid_to ?? '—' }}</td>
                <td class="text-left">{{ row.or_si_no ?? '—' }}</td>
                <td v-for="cat in usedCategories" :key="cat" class="text-right">
                  {{ row.category === cat ? formatCurrency(row.amount ?? 0) : '' }}
                </td>
                <td class="text-right font-weight-medium">{{ formatCurrency(row.amount ?? 0) }}</td>
              </tr>
              <tr class="subtotal-row">
                <td colspan="3" class="text-left font-weight-bold">{{ group.department }} Total</td>
                <td v-for="cat in usedCategories" :key="cat" class="text-right font-weight-bold">
                  {{ formatCurrency(group.categoryTotals[cat] ?? 0) }}
                </td>
                <td class="text-right font-weight-bold">{{ formatCurrency(group.total) }}</td>
              </tr>
            </template>
            <tr class="grand-total-row">
              <td colspan="3" class="text-left font-weight-bold">TOTAL (EXPENSES)</td>
              <td v-for="cat in usedCategories" :key="cat" class="text-right font-weight-bold">
                {{ formatCurrency(grandTotals.categoryTotals[cat] ?? 0) }}
              </td>
              <td class="text-right font-weight-bold">{{ formatCurrency(grandTotals.total) }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

    </div>
  </v-container>
</template>

<style scoped>
.expense-report-table :deep(thead th) {
  background: #f5f5f5 !important;
  font-weight: 700 !important;
  font-size: 0.75rem !important;
  letter-spacing: 0.04em;
  color: #616161 !important;
}
.department-row {
  background: #eef3fb;
}
.subtotal-row {
  background: #fafafa;
}
.grand-total-row {
  background: #e8f5e9;
}
</style>
