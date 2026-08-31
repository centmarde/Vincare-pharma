<script setup lang="ts">
import { watch } from 'vue'
import { expenseCategories, expenseDepartments } from '@/stores/financeData'
import { DEFAULT_REPLENISH_THRESHOLD } from '@/utils/cashAccountTypes'
import type { AddExpensePayload, ClassifiedCashAccount } from '@/utils/cashAccountTypes'
import { formatCurrency } from '@/utils/helpers'
import { useAddExpense } from '../../composables/useAddExpense'

const props = withDefaults(defineProps<{
  modelValue: boolean
  accounts: ClassifiedCashAccount[]
  loading?: boolean
  replenishThreshold?: number
}>(), {
  loading: false,
  replenishThreshold: DEFAULT_REPLENISH_THRESHOLD,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', payload: AddExpensePayload): void
}>()

const {
  category, description, amount, expenseDate, cashAccountId, department, orSiNo, paidTo,
  requestReplenishment,
  accountOptions, metaForAccount, isPettyCash, pettyCashBalance, disbursedAmount, remainingBalance,
  insufficientPettyCash, isBelowThreshold, canSubmit,
  resetForm, buildPayload, restoreDraft,
} = useAddExpense(() => props.accounts, () => props.replenishThreshold)

watch(() => props.modelValue, (open) => {
  // Restore any in-progress draft when opening; clear the form on close.
  if (open) restoreDraft()
  else resetForm()
})

const submit = () => {
  const payload = buildPayload()
  if (payload) emit('submit', payload)
}

const close = () => {
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3 text-h6 font-weight-bold">Add Expense</v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <label class="field-label">Category <span class="text-error">*</span></label>
        <v-select
          v-model="category"
          :items="expenseCategories"
          item-title="title"
          item-value="value"
          placeholder="Select category"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
        />

        <label class="field-label">Description <span class="text-error">*</span></label>
        <v-text-field
          v-model="description"
          placeholder="What is this expense for?"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
        />

        <label class="field-label">Amount <span class="text-error">*</span></label>
        <v-text-field
          :model-value="amount"
          type="number"
          min="0"
          prefix="₱"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="amount = $event === '' ? null : Number($event)"
        />

        <label class="field-label">Expense Date <span class="text-error">*</span></label>
        <v-text-field
          v-model="expenseDate"
          type="date"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
        />

        <label class="field-label">Payment Mode <span class="text-error">*</span></label>
        <v-select
          v-model="cashAccountId"
          :items="accountOptions"
          item-title="title"
          item-value="value"
          placeholder="Select payment mode"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps">
              <template #prepend>
                <v-icon
                  :icon="metaForAccount(item.value).icon"
                  :color="metaForAccount(item.value).color"
                  size="20"
                  class="mr-2"
                />
              </template>
              <template #append>
                <v-chip :color="metaForAccount(item.value).color" size="x-small" variant="tonal">
                  {{ metaForAccount(item.value).title }}
                </v-chip>
              </template>
            </v-list-item>
          </template>
        </v-select>

        <!-- Petty Cash Details — only for PETTY_CASH accounts -->
        <v-sheet
          v-if="isPettyCash"
          rounded="lg"
          border
          class="bg-orange-lighten-5 pa-4 mb-3"
        >
          <div class="d-flex align-center mb-2 ga-2">
            <v-icon icon="mdi-cash-multiple" color="orange-darken-2" size="18" />
            <span class="text-body-2 font-weight-bold">Petty Cash Details</span>
          </div>

          <div class="d-flex justify-space-between text-body-2 mb-1">
            <span>Current Petty Cash Balance</span>
            <span class="font-weight-medium">{{ formatCurrency(pettyCashBalance) }}</span>
          </div>
          <div class="d-flex justify-space-between text-body-2 mb-1">
            <span>Amount to Disburse</span>
            <span class="font-weight-medium">− {{ formatCurrency(disbursedAmount) }}</span>
          </div>
          <v-divider class="my-2" />
          <div class="d-flex justify-space-between text-body-2">
            <span class="font-weight-bold">Remaining Balance</span>
            <span
              class="font-weight-bold"
              :class="insufficientPettyCash ? 'text-error' : isBelowThreshold ? 'text-orange-darken-3' : 'text-success'"
            >
              {{ formatCurrency(remainingBalance) }}
            </span>
          </div>

          <v-alert
            v-if="insufficientPettyCash"
            type="error"
            density="compact"
            variant="tonal"
            class="mt-3"
            text="Disbursement exceeds the petty cash on hand. Reduce the amount or pay from a bank account."
          />

          <template v-else-if="isBelowThreshold">
            <v-alert
              type="warning"
              density="compact"
              variant="tonal"
              class="mt-3"
              :text="`Remaining balance falls below the ${formatCurrency(replenishThreshold)} replenishment threshold.`"
            />
            <v-switch
              v-model="requestReplenishment"
              label="Request replenishment after recording this expense"
              color="warning"
              density="compact"
              hide-details
              inset
              class="mt-1"
            />
          </template>
        </v-sheet>

        <label class="field-label">Department <span class="text-error">*</span></label>
        <v-select
          v-model="department"
          :items="expenseDepartments"
          item-title="title"
          item-value="value"
          placeholder="Select department"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
        />

        <label class="field-label">OR/SI No.</label>
        <v-text-field
          v-model="orSiNo"
          placeholder="Official receipt / sales invoice number"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
        />

        <label class="field-label">Paid To</label>
        <v-text-field
          v-model="paidTo"
          placeholder="Optional — payee/vendor"
          variant="outlined"
          density="compact"
          hide-details
        />
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
        <v-btn variant="outlined" class="text-none" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          :loading="loading"
          :disabled="!canSubmit"
          @click="submit"
        >
          Record Expense
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #424242;
  margin-bottom: 4px;
}
</style>
