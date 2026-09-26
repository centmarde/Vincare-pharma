<script setup lang="ts">
import { useOpeningBalances } from '../composables/useOpeningBalances'
import { formatCurrency } from '@/utils/helpers'

const {
  loading, posting,
  entryDate, description, groups,
  deltaFor, changedRows, plug,
  equityAccountMissing, openingBalanceEquityCode,
  blockers, canSubmit,
  load, submit, clearTargets, fillFromCurrent,
} = useOpeningBalances()
</script>

<template>
  <v-container fluid class="pa-0">
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center ga-2 pb-2 flex-wrap">
        <span>Opening Balances</span>
        <v-chip v-if="changedRows.length" color="info" size="small" label>
          {{ changedRows.length }} to record
        </v-chip>
        <v-spacer />
        <v-text-field
          v-model="entryDate" type="date" label="As of" density="compact" variant="outlined"
          hide-details style="max-width: 180px" @update:model-value="load" />
        <v-btn size="small" variant="text" color="info" prepend-icon="mdi-refresh" @click="load">
          Refresh
        </v-btn>
      </v-card-title>

      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-3">
          Enter what each account <strong>should</strong> read as of this date. Only the difference
          from its current balance is recorded, so this screen is safe to run more than once — an
          account already at its target contributes nothing. Everything is drafted as one balanced
          journal entry, with the difference going to Opening Balance Equity.
          <strong>It reaches the ledger only once approved in General Journal.</strong>
        </p>

        <v-alert
          v-if="equityAccountMissing"
          type="error" variant="tonal" density="compact" class="mb-3"
        >
          Account {{ openingBalanceEquityCode }} (Opening Balance Equity) does not exist yet.
          Add it in Chart of Accounts before recording balances.
        </v-alert>

        <v-progress-linear v-if="loading" indeterminate class="mb-2" />

        <v-table density="compact">
          <thead>
            <tr>
              <th class="text-left">Code</th>
              <th class="text-left">Account</th>
              <th class="text-right">Current</th>
              <th class="text-right" style="width: 180px">Target</th>
              <th class="text-right">Will record</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in groups" :key="group.subsection">
              <tr>
                <td colspan="5" class="font-weight-bold text-uppercase text-caption bg-grey-lighten-4">
                  {{ group.subsection }}
                </td>
              </tr>
              <tr v-for="row in group.rows" :key="row.code">
                <td class="text-medium-emphasis">{{ row.code }}</td>
                <td>{{ row.name }}</td>
                <td class="text-right text-medium-emphasis">
                  {{ row.current ? formatCurrency(row.current) : '—' }}
                </td>
                <td>
                  <v-text-field
                    v-model.number="row.target"
                    type="number" density="compact" variant="outlined" hide-details
                    placeholder="—" reverse
                  />
                </td>
                <td
                  class="text-right"
                  :class="deltaFor(row) > 0 ? 'text-success'
                    : deltaFor(row) < 0 ? 'text-error' : 'text-medium-emphasis'"
                >
                  {{ deltaFor(row) ? formatCurrency(deltaFor(row)) : '—' }}
                </td>
              </tr>
            </template>
            <tr v-if="!groups.length && !loading">
              <td colspan="5" class="text-center text-caption text-medium-emphasis py-4">
                No balance sheet accounts found.
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="font-weight-bold" style="border-top: 2px solid currentColor">
              <td colspan="4">
                Opening Balance Equity ({{ openingBalanceEquityCode }}) —
                {{ plug >= 0 ? 'credit' : 'debit' }}
              </td>
              <td class="text-right">{{ formatCurrency(Math.abs(plug)) }}</td>
            </tr>
          </tfoot>
        </v-table>
      </v-card-text>

      <v-card-actions class="px-4 pb-4 flex-wrap ga-2">
        <v-btn size="small" variant="text" class="text-none" @click="fillFromCurrent">
          Fill from current
        </v-btn>
        <v-btn size="small" variant="text" class="text-none" @click="clearTargets">
          Clear
        </v-btn>
        <v-spacer />
        <span v-if="blockers.length" class="text-caption text-medium-emphasis mr-2">
          Needs {{ blockers.join(', ') }}
        </span>
        <v-btn
          color="primary" variant="flat" class="text-none"
          :disabled="!canSubmit" :loading="posting" @click="submit"
        >
          Draft Opening Balances
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>
