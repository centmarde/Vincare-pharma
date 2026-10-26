<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import type { CashAccountHistory } from '@/stores/cashAccountLedgerData'
import type { ClassifiedCashAccount } from '@/utils/cashAccountTypes'
import { classificationMeta } from '@/utils/cashAccountTypes'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const open = defineModel<boolean>({ required: true })

const props = defineProps<{
  account: ClassifiedCashAccount | null
  history: CashAccountHistory | null
  loading: boolean
  error: string | null
  /** Card balance minus the history's own total. */
  variance: number
}>()

const { xs } = useDisplay()

// Newest first for reading. The running balance was accumulated oldest first,
// so each row still shows the balance AS AT that movement.
const rows = computed(() => [...(props.history?.movements ?? [])].reverse())

const meta = computed(() => (props.account ? classificationMeta(props.account.classification) : null))
</script>

<template>
  <v-dialog v-model="open" max-width="1100" scrollable :fullscreen="xs">
    <v-card v-if="account" rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3">
        <div class="d-flex justify-space-between align-start flex-wrap ga-2">
          <div>
            <div class="text-h6 font-weight-bold">{{ account.name }}</div>
            <v-chip v-if="meta" size="x-small" variant="tonal" :color="meta.color" label>
              {{ meta.title }}
            </v-chip>
          </div>
          <div class="text-right">
            <div class="text-caption text-medium-emphasis text-uppercase">Balance</div>
            <div class="text-h6 font-weight-bold">{{ formatCurrency(account.balance) }}</div>
          </div>
        </div>
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <v-progress-linear v-if="loading" indeterminate class="mb-3" />

        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3 text-body-2">
          Could not load this account's history: {{ error }}
        </v-alert>

        <template v-else-if="history">
          <div class="d-flex flex-wrap ga-6 mb-3 text-body-2">
            <div>
              <div class="text-caption text-medium-emphasis text-uppercase">Cash in</div>
              <!-- Fixed green, not text-success: this app's theme derives
                   "success" from the brand red. -->
              <div class="font-weight-bold text-green-darken-2">{{ formatCurrency(history.totalIn) }}</div>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis text-uppercase">Cash out</div>
              <div class="font-weight-bold text-error">{{ formatCurrency(history.totalOut) }}</div>
            </div>
          </div>

          <!-- The history and the card balance are built by the same events, so
               they should agree. Shown plainly when they don't, since it means
               the balance moved somewhere that left no record. -->
          <v-alert
            v-if="Math.abs(variance) > 0.01"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3 text-body-2"
          >
            These movements add up to {{ formatCurrency(history.computedBalance) }}, but the account
            shows {{ formatCurrency(account.balance) }} &mdash; a difference of
            {{ formatCurrency(variance) }} that no record here explains.
          </v-alert>

          <div v-if="!rows.length" class="text-center text-body-2 text-medium-emphasis py-8">
            No money has moved through this account yet.
          </div>

          <v-table v-else density="compact">
            <thead>
              <tr>
                <th class="text-left">DATE</th>
                <th class="text-left">TYPE</th>
                <th class="text-left">REFERENCE</th>
                <th class="text-left">DESCRIPTION</th>
                <th class="text-right">DEBIT (IN)</th>
                <th class="text-right">CREDIT (OUT)</th>
                <th class="text-right">BALANCE</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in rows"
                :key="row.key"
                :class="{ 'text-medium-emphasis text-decoration-line-through': row.voided }"
              >
                <td class="text-no-wrap">{{ formatDatePR_ISO(row.date) }}</td>
                <td class="text-no-wrap">
                  {{ row.source }}
                  <v-chip v-if="row.voided" size="x-small" variant="tonal" color="grey" class="ml-1">
                    voided
                  </v-chip>
                  <v-chip
                    v-else-if="row.ledgerReversed"
                    size="x-small"
                    variant="tonal"
                    color="warning"
                    class="ml-1"
                    title="Its ledger entry was reversed in General Journal, but the document was never voided — the cash still left this account. Void the document to bring them back in step."
                  >
                    reversed in ledger
                  </v-chip>
                </td>
                <td class="text-no-wrap">{{ row.reference ?? '—' }}</td>
                <td>{{ row.description }}</td>
                <td class="text-right text-no-wrap">
                  {{ row.moneyIn ? formatCurrency(row.moneyIn) : '—' }}
                </td>
                <td class="text-right text-no-wrap">
                  {{ row.moneyOut ? formatCurrency(row.moneyOut) : '—' }}
                </td>
                <td class="text-right text-no-wrap font-weight-bold">
                  {{ formatCurrency(row.runningBalance) }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </template>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" class="text-none" @click="open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
