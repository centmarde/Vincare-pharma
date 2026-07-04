<script setup lang="ts">
import { onMounted } from 'vue'
import { useTrialBalance } from '../composables/useTrialBalance'
import { formatCurrency } from '@/utils/helpers'

const { asOf, rows, loading, totalDebit, totalCredit, isBalanced, load } = useTrialBalance()

onMounted(load)
</script>

<template>
  <v-container fluid pa-0>
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center gap-2 pb-2 flex-wrap">
        <span>Trial Balance</span>
        <v-chip :color="isBalanced ? 'success' : 'error'" size="small" label class="ml-2">
          {{ isBalanced ? 'Balanced ✓' : 'OUT OF BALANCE' }}
        </v-chip>
        <v-spacer />
        <v-text-field
          v-model="asOf" type="date" label="As of" density="compact" variant="outlined"
          hide-details style="max-width: 180px" @update:model-value="load" />
        <v-btn size="small" variant="text" color="info" prepend-icon="mdi-refresh" @click="load">Refresh</v-btn>
      </v-card-title>

      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate class="mb-2" />
        <v-table density="compact">
          <thead>
            <tr>
              <th class="text-left">Code</th>
              <th class="text-left">Account</th>
              <th class="text-right">Debit</th>
              <th class="text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.account_code">
              <td>{{ r.account_code }}</td>
              <td>{{ r.account_name }}</td>
              <td class="text-right">{{ r.debit_balance > 0 ? formatCurrency(r.debit_balance) : '—' }}</td>
              <td class="text-right">{{ r.credit_balance > 0 ? formatCurrency(r.credit_balance) : '—' }}</td>
            </tr>
            <tr v-if="!rows.length && !loading">
              <td colspan="4" class="text-center text-caption text-medium-emphasis py-4">
                No posted activity yet.
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="font-weight-bold" style="border-top: 2px solid currentColor">
              <td colspan="2">Totals</td>
              <td class="text-right">{{ formatCurrency(totalDebit) }}</td>
              <td class="text-right">{{ formatCurrency(totalCredit) }}</td>
            </tr>
          </tfoot>
        </v-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>
