<script setup lang="ts">
import { onMounted } from 'vue'
import { useIncomeStatement } from '../composables/useIncomeStatement'
import { formatCurrency } from '@/utils/helpers'

const { dateFrom, dateTo, statement, loading, load } = useIncomeStatement()

onMounted(load)
</script>

<template>
  <v-container fluid class="pa-0">
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center ga-2 pb-2 flex-wrap">
        <span>Income Statement</span>
        <v-chip color="primary" size="x-small" label class="ml-2">Accrual, GL-derived — authoritative</v-chip>
        <v-spacer />
        <v-text-field
          v-model="dateFrom" type="date" label="From" density="compact" variant="outlined"
          hide-details style="max-width: 160px" @update:model-value="load" />
        <v-text-field
          v-model="dateTo" type="date" label="To" density="compact" variant="outlined"
          hide-details style="max-width: 160px" @update:model-value="load" />
      </v-card-title>

      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate class="mb-2" />

        <template v-if="statement">
          <div v-for="section in statement.sections" :key="section.subsection" class="mb-4">
            <div class="text-subtitle-2 font-weight-bold mb-1">{{ section.subsection }}</div>
            <v-table density="compact">
              <tbody>
                <tr v-for="a in section.accounts" :key="a.code">
                  <td>{{ a.name }}</td>
                  <td class="text-right" style="width: 160px">{{ formatCurrency(a.amount) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="font-weight-medium border-t">
                  <td>Total {{ section.subsection }}</td>
                  <td class="text-right">{{ formatCurrency(section.subtotal) }}</td>
                </tr>
              </tfoot>
            </v-table>
          </div>

          <v-divider class="my-3" />

          <v-table density="compact">
            <tbody>
              <tr><td>Net Sales</td><td class="text-right" style="width: 160px">{{ formatCurrency(statement.netSales) }}</td></tr>
              <tr><td>Less: Cost of Sales</td><td class="text-right">({{ formatCurrency(statement.cogs) }})</td></tr>
              <tr class="font-weight-bold"><td>Gross Profit</td><td class="text-right">{{ formatCurrency(statement.grossProfit) }}</td></tr>
              <tr><td>Less: Selling Expenses</td><td class="text-right">({{ formatCurrency(statement.sellingExpenses) }})</td></tr>
              <tr><td>Less: Administrative & Operating Expenses</td><td class="text-right">({{ formatCurrency(statement.adminExpenses) }})</td></tr>
              <tr class="font-weight-bold"><td>Operating Income</td><td class="text-right">{{ formatCurrency(statement.operatingIncome) }}</td></tr>
              <tr><td>Add: Other Income</td><td class="text-right">{{ formatCurrency(statement.otherIncome) }}</td></tr>
              <tr><td>Less: Finance Costs</td><td class="text-right">({{ formatCurrency(statement.financeCosts) }})</td></tr>
              <tr class="font-weight-bold text-h6" style="border-top: 2px solid currentColor">
                <td>Net Income</td><td class="text-right">{{ formatCurrency(statement.netIncome) }}</td>
              </tr>
            </tbody>
          </v-table>
        </template>

        <div v-else-if="!loading" class="text-center text-caption text-medium-emphasis py-4">
          No data for this range.
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>
