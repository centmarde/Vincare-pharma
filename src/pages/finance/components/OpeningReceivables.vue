<script setup lang="ts">
import { useOpeningReceivables, termPresets } from '../composables/useOpeningReceivables'
import { formatCurrency } from '@/utils/helpers'

const {
  loading,
  department, customerId, originalNo, invoiceDate, termDays, termLabel,
  originalAmount, alreadyPaid, cutoverDate, remarks,
  customerOptions, outstanding, termSummary, isOverdue,
  blockers, canSubmit,
  setDaysElapsed, applyTermPreset, clearTerm, submit,
} = useOpeningReceivables()

// Bound to its own field so typing a position rewrites the invoice date without
// the date immediately rewriting what is being typed.
function onDaysElapsed(value: string) {
  const days = Number(value)
  if (Number.isFinite(days)) setDaysElapsed(days)
}
</script>

<template>
  <v-container fluid class="pa-0">
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center ga-2 pb-2 flex-wrap">
        <span>Opening Receivables</span>
        <v-chip color="warning" size="small" label>Migration tool</v-chip>
      </v-card-title>

      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Record invoices raised <strong>before</strong> the switch to this system that a customer
          still owes on. Each one becomes a real receivable, so it ages, appears on the customer's
          statement, and can be collected against exactly like a new order. The ledger entry is
          <strong>DR Accounts Receivable / CR Opening Balance Equity</strong> — never revenue,
          because these sales were earned before the books opened here.
        </p>

        <v-row dense>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="department"
              :items="[{ title: 'In-House', value: 'inhouse' }, { title: 'Ethical', value: 'ethical' }]"
              label="Department" density="compact" variant="outlined" hide-details
              @update:model-value="customerId = null"
            />
          </v-col>
          <v-col cols="12" sm="6" md="5">
            <v-autocomplete
              v-model="customerId"
              :items="customerOptions" item-title="title" item-value="value"
              label="Customer" placeholder="Who owes this"
              density="compact" variant="outlined" auto-select-first hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <v-text-field
              v-model="originalNo" label="Their invoice number"
              placeholder="As printed on the old invoice"
              hint="Kept on the record so it can be matched to your files"
              persistent-hint density="compact" variant="outlined"
            />
          </v-col>
        </v-row>

        <v-divider class="my-4" />

        <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">
          Terms
        </div>
        <v-row dense>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model="invoiceDate" type="date" label="Invoice date"
              hint="Aging counts from here" persistent-hint
              density="compact" variant="outlined"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              :model-value="termDays"
              :items="termPresets.map((t) => ({ title: t.label, value: t.days }))"
              label="Credit term" density="compact" variant="outlined"
              hint="Or clear it for consignment / no agreed term" persistent-hint
              @update:model-value="applyTermPreset($event)"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              :model-value="termLabel" label="Term as they word it"
              placeholder="e.g. Consignment, 30 Days PDC"
              density="compact" variant="outlined" hide-details
              @update:model-value="termLabel = $event"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              type="number" label="Or: days already elapsed"
              placeholder="e.g. 45"
              hint="Sets the invoice date backwards from today"
              persistent-hint density="compact" variant="outlined"
              @update:model-value="onDaysElapsed"
            />
          </v-col>
        </v-row>

        <v-alert
          v-if="termSummary"
          :type="isOverdue ? 'warning' : 'info'"
          variant="tonal" density="compact" class="mt-2"
        >
          {{ termSummary }}
          <v-btn
            v-if="termDays !== null"
            size="x-small" variant="text" class="text-none ml-2" @click="clearTerm"
          >
            No agreed term
          </v-btn>
        </v-alert>

        <v-divider class="my-4" />

        <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">
          Amounts
        </div>
        <v-row dense>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model.number="originalAmount" type="number" label="Original invoice amount"
              placeholder="0.00" reverse density="compact" variant="outlined" hide-details
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model.number="alreadyPaid" type="number" label="Already collected"
              placeholder="0.00" reverse density="compact" variant="outlined"
              hint="Anything paid before cutover" persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-sheet rounded="lg" border class="pa-3 h-100 d-flex flex-column justify-center">
              <div class="text-caption text-medium-emphasis">Still outstanding</div>
              <div class="text-h6 font-weight-bold">{{ formatCurrency(outstanding) }}</div>
              <div class="text-caption text-medium-emphasis">this is what reaches the ledger</div>
            </v-sheet>
          </v-col>
        </v-row>

        <v-row dense class="mt-2">
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="cutoverDate" type="date" label="Cutover date"
              hint="The journal entry is dated here, not at the invoice date"
              persistent-hint density="compact" variant="outlined"
            />
          </v-col>
          <v-col cols="12" sm="8">
            <v-text-field
              v-model="remarks" label="Notes" placeholder="Optional"
              density="compact" variant="outlined" hide-details
            />
          </v-col>
        </v-row>
      </v-card-text>

      <v-card-actions class="px-4 pb-4 flex-wrap ga-2">
        <v-spacer />
        <span v-if="blockers.length" class="text-caption text-medium-emphasis mr-2">
          Needs {{ blockers.join(', ') }}
        </span>
        <v-btn
          color="primary" variant="flat" class="text-none"
          :disabled="!canSubmit" :loading="loading" @click="submit"
        >
          Record Receivable
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>
