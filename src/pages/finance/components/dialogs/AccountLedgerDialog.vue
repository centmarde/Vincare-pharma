<script setup lang="ts">
import { computed } from 'vue'
import type { AccountLedgerLine, GLAccount } from '@/stores/glData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const props = defineProps<{
  modelValue: boolean
  account: GLAccount | null
  lines: AccountLedgerLine[]
  balance: number
  loading: boolean
  /** Cash accounts filed under this GL account. Empty for accounts with no
   *  operational table behind them, which is most of them. */
  subLedger: { id: number; name: string; classification: string; balance: number }[]
  subLedgerTotal: number
  subLedgerVariance: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

// Newest first for reading, but the running balance was accumulated oldest
// first in the store -- so each row still shows the balance AS AT that entry,
// which is what a statement means by the column.
const rows = computed(() => [...props.lines].reverse())

const referenceLabels: Record<string, string> = {
  sales_invoice: 'Sales Invoice',
  sales_return: 'Sales Return',
  payment: 'Payment',
  collection: 'Collection',
  purchase_invoice: 'Purchase Invoice',
  disbursement: 'Disbursement',
  pdc: 'Post-Dated Check',
  payroll: 'Payroll',
  accrual: 'Accrual',
  depreciation: 'Depreciation',
  loan: 'Loan',
  bank_recon: 'Bank Reconciliation',
  manual: 'Manual Entry',
  closing: 'Closing Entry',
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="1000"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card v-if="account" rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3">
        <div class="d-flex justify-space-between align-start flex-wrap ga-2">
          <div>
            <div class="text-h6 font-weight-bold">
              {{ account.code }} &middot; {{ account.name }}
            </div>
            <div class="text-caption text-medium-emphasis text-uppercase">
              {{ account.subsection }} &middot; normal balance {{ account.normal_balance }}
              <v-chip
                v-if="account.is_contra"
                size="x-small"
                variant="tonal"
                color="warning"
                class="ml-1"
              >
                contra
              </v-chip>
            </div>
          </div>
          <div class="text-right">
            <div class="text-caption text-medium-emphasis text-uppercase">Balance</div>
            <div class="text-h6 font-weight-bold">{{ formatCurrency(balance) }}</div>
          </div>
        </div>
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <v-progress-linear v-if="loading" indeterminate class="mb-3" />

        <!-- What makes up the balance, for accounts with an operational table
             behind them. Only cash is wired today; AR/AP/Inventory are the same
             shape. Sits above the transactions because "what is in here now" is
             the question that gets asked first. -->
        <template v-if="subLedger.length">
          <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-1">
            Accounts in this balance
          </div>
          <v-table density="compact" class="mb-2">
            <tbody>
              <tr v-for="a in subLedger" :key="a.id">
                <td>{{ a.name }}</td>
                <td class="text-caption text-medium-emphasis">{{ a.classification }}</td>
                <td class="text-right">{{ formatCurrency(a.balance) }}</td>
              </tr>
              <tr>
                <td class="font-weight-bold">Total</td>
                <td />
                <td class="text-right font-weight-bold">{{ formatCurrency(subLedgerTotal) }}</td>
              </tr>
            </tbody>
          </v-table>

          <!-- These two SHOULD agree. A gap means cash moved without being
               booked to the ledger (or the reverse) -- shown plainly rather
               than hidden, since it is exactly what needs investigating. -->
          <v-alert
            v-if="Math.abs(subLedgerVariance) > 0.01"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3 text-body-2"
          >
            The accounts total {{ formatCurrency(subLedgerTotal) }} but the ledger says
            {{ formatCurrency(balance) }} &mdash; a difference of
            {{ formatCurrency(subLedgerVariance) }}. Something moved without being posted.
          </v-alert>
          <v-divider class="mb-3" />
        </template>

        <!-- Most accounts have never been posted to yet, so this is the common
             case rather than an edge one. Say why it is empty instead of
             showing a bare "no data" that reads like a failure. -->
        <div
          v-else-if="!rows.length"
          class="text-center text-body-2 text-medium-emphasis py-8"
        >
          Nothing has been posted to this account yet.
        </div>

        <v-table v-else density="compact">
          <thead>
            <tr>
              <th class="text-left">DATE</th>
              <th class="text-left">ENTRY</th>
              <th class="text-left">SOURCE</th>
              <th class="text-left">DESCRIPTION</th>
              <th class="text-right">DEBIT</th>
              <th class="text-right">CREDIT</th>
              <th class="text-right">BALANCE</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in rows" :key="line.id">
              <td class="text-no-wrap">{{ formatDatePR_ISO(line.entry_date) }}</td>
              <td class="text-no-wrap">
                {{ line.entry_no ?? '—' }}
                <!-- A reversed entry stays in the ledger and still counts; its
                     offsetting entry sits alongside it. Flag it so the pair
                     reads as deliberate rather than as a double posting. -->
                <v-chip
                  v-if="line.status === 'reversed'"
                  size="x-small"
                  variant="tonal"
                  color="warning"
                  class="ml-1"
                >
                  reversed
                </v-chip>
              </td>
              <td class="text-no-wrap">
                {{ referenceLabels[line.reference_type] ?? line.reference_type }}
              </td>
              <td>{{ line.line_memo || line.description || '—' }}</td>
              <td class="text-right">
                {{ line.debit ? formatCurrency(line.debit) : '—' }}
              </td>
              <td class="text-right">
                {{ line.credit ? formatCurrency(line.credit) : '—' }}
              </td>
              <td class="text-right font-weight-bold">
                {{ formatCurrency(line.runningBalance) }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" class="text-none" @click="emit('update:modelValue', false)">
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
