<script setup lang="ts">
import { watch } from 'vue'
import { useReceiveMoney, commonPayors, matchesPick } from '../../composables/useReceiveMoney'
import { formatCurrency } from '@/utils/helpers'
import MoneyField from '@/components/inputs/MoneyField.vue'

// Money paid into one of our accounts by someone who is not paying an invoice.
// Posts as a journal entry the accountant sees before it goes in: the cash
// account debited, the account he picks credited.

const props = defineProps<{
  modelValue: boolean
  /** The account the money went into; null lets them pick. */
  accountId: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'received'): void
}>()

const {
  entryDate, today, cashIds, receivedIntoOptions, posting,
  receivedFrom, reference, note, amount, creditCode, creditSearch, creditOptions, creditNoData,
  suggestions, creditHint, pickSuggestion,
  movement, lines, totalDebit, totalCredit, accountName,
  composedDescription, blockers, canSubmit, postLabel,
  start, submit,
} = useReceiveMoney()

watch(() => props.modelValue, (open) => { if (open) void start(props.accountId) })

function close() {
  emit('update:modelValue', false)
}

async function post() {
  const result = await submit()
  if (!result.success) return
  emit('received')
  close()
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="760"
    scrollable
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 d-flex align-center ga-2">
        <v-icon icon="mdi-cash-plus" color="primary" />
        <span class="text-h6 font-weight-bold">Receive money</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" :disabled="posting" aria-label="Close" @click="close" />
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <p class="text-body-2 text-medium-emphasis mb-5">
          Money paid into our account by someone who is not paying an invoice — SSS or Pag-IBIG
          paying back, a refund, a grant. A customer's payment is recorded as a collection on the
          order instead, so it reaches their statement.
        </p>

        <!-- 1. Where the money went -->
        <div class="step-label">1 · Where it went</div>
        <v-row dense>
          <v-col cols="12" sm="7">
            <v-autocomplete
              v-model="cashIds.cash"
              :items="receivedIntoOptions"
              :custom-filter="matchesPick"
              item-title="title" item-value="value"
              label="Received into" placeholder="Search an account"
              prepend-inner-icon="mdi-bank-outline"
              density="comfortable" variant="outlined" hide-details auto-select-first
            >
              <template #item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle" />
              </template>
            </v-autocomplete>
          </v-col>
          <v-col cols="12" sm="5">
            <v-text-field
              v-model="entryDate" type="date" label="Date received" :max="today"
              density="comfortable" variant="outlined" hide-details
            />
          </v-col>
          <v-col cols="12" sm="7">
            <MoneyField
              v-model="amount" label="Amount received" placeholder="0.00"
              density="comfortable" variant="outlined" hide-details
            />
          </v-col>
        </v-row>
        <!-- The account's balance, before and after, so a mistyped amount
             shows before it posts. -->
        <v-sheet
          v-if="movement && movement.delta"
          rounded="lg" color="green-darken-1" variant="tonal"
          class="mt-2 px-3 py-2 d-flex align-center flex-wrap ga-2 text-body-2"
        >
          <v-icon icon="mdi-trending-up" size="18" />
          <span>{{ movement.name }} balance</span>
          <span class="text-medium-emphasis">{{ formatCurrency(movement.before) }}</span>
          <v-icon icon="mdi-arrow-right" size="14" />
          <strong>{{ formatCurrency(movement.after) }}</strong>
          <span class="ms-auto font-weight-bold">+{{ formatCurrency(movement.delta) }}</span>
        </v-sheet>

        <!-- 2. Who paid it -->
        <div class="step-label mt-5">2 · Who paid it</div>
        <v-row dense>
          <v-col cols="12" sm="7">
            <!-- The usual payors are offered; anyone else can be typed. -->
            <v-combobox
              v-model="receivedFrom"
              :items="commonPayors"
              label="Received from" placeholder="e.g. SSS, Pag-IBIG, a supplier"
              prepend-inner-icon="mdi-account-arrow-right-outline"
              density="comfortable" variant="outlined" hide-details
            />
          </v-col>
          <v-col cols="12" sm="5">
            <v-text-field
              v-model="reference" label="Reference (optional)"
              placeholder="Credit advice, OR or cheque no."
              density="comfortable" variant="outlined" hide-details
            />
          </v-col>
        </v-row>

        <!-- 3. What it is for — the credit side, the accountant's call. -->
        <div class="step-label mt-5">3 · What it's for</div>
        <div class="d-flex flex-wrap ga-2 mb-3">
          <v-chip
            v-for="s in suggestions"
            :key="s.code"
            label
            :variant="creditCode === s.code ? 'flat' : 'outlined'"
            :color="creditCode === s.code ? 'primary' : undefined"
            :prepend-icon="creditCode === s.code ? 'mdi-check' : undefined"
            @click="pickSuggestion(s.code)"
          >
            {{ s.label }}
            <span class="ms-2 text-caption" :class="creditCode === s.code ? '' : 'text-medium-emphasis'">{{ s.code }}</span>
          </v-chip>
        </div>
        <v-autocomplete
          v-model="creditCode"
          v-model:search="creditSearch"
          :items="creditOptions"
          :custom-filter="matchesPick"
          :no-data-text="creditNoData"
          item-title="title" item-value="value"
          label="Credit to" placeholder="Or search any account — name, code or section"
          prepend-inner-icon="mdi-book-open-variant"
          density="comfortable" variant="outlined" clearable auto-select-first
          :hint="creditHint" :persistent-hint="!!creditHint"
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle">
              <template #prepend>
                <span class="code-badge">{{ item.raw.code }}</span>
              </template>
            </v-list-item>
          </template>
          <template #selection="{ item }">
            <span class="code-badge me-2">{{ item.raw.code }}</span>{{ item.raw.title }}
          </template>
        </v-autocomplete>

        <v-text-field
          v-model="note" label="Note (optional)" placeholder="e.g. maternity benefit of J. Dela Cruz"
          class="mt-3" density="comfortable" variant="outlined" hide-details
        />

        <!-- The entry as it will post, the way he would write it in his book. -->
        <v-sheet rounded="lg" border class="mt-5 pa-3">
          <div class="d-flex align-center mb-2">
            <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">This will post</span>
            <v-spacer />
            <v-chip v-if="lines.length" size="x-small" color="green-darken-1" variant="tonal" label prepend-icon="mdi-scale-balance">
              Balanced
            </v-chip>
          </div>
          <v-table density="compact">
            <thead>
              <tr>
                <th class="text-left">Account</th>
                <th class="text-right">Debit</th>
                <th class="text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!lines.length">
                <td colspan="3" class="text-center text-caption text-medium-emphasis py-4">
                  The entry appears here once the account, amount and what it's for are filled in.
                </td>
              </tr>
              <tr v-for="(line, i) in lines" :key="i">
                <td :class="{ 'ps-8': line.credit > 0 }">
                  <span class="code-badge me-2">{{ line.account_code }}</span>{{ accountName(line.account_code) }}
                </td>
                <td class="text-right">{{ line.debit ? formatCurrency(line.debit) : '' }}</td>
                <td class="text-right">{{ line.credit ? formatCurrency(line.credit) : '' }}</td>
              </tr>
            </tbody>
            <tfoot v-if="lines.length">
              <tr class="font-weight-bold">
                <td>Total</td>
                <td class="text-right">{{ formatCurrency(totalDebit) }}</td>
                <td class="text-right">{{ formatCurrency(totalCredit) }}</td>
              </tr>
            </tfoot>
          </v-table>
          <div class="text-caption text-medium-emphasis mt-2">
            <v-icon icon="mdi-text" size="12" class="me-1" />{{ composedDescription }}
          </div>
        </v-sheet>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4 d-flex flex-wrap ga-2">
        <span v-if="blockers.length" class="text-caption text-medium-emphasis">
          Still needed: {{ blockers.join(', ') }}
        </span>
        <v-spacer />
        <v-btn variant="text" class="text-none" :disabled="posting" @click="close">Cancel</v-btn>
        <v-btn
          color="primary" variant="flat" class="text-none font-weight-bold"
          prepend-icon="mdi-check"
          :disabled="!canSubmit" :loading="posting"
          @click="post"
        >
          {{ postLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.step-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.7;
  margin-bottom: 8px;
}

/* The account code, set apart so the eye finds it in a list. */
.code-badge {
  display: inline-block;
  min-width: 42px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
  font-variant-numeric: tabular-nums;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
</style>
