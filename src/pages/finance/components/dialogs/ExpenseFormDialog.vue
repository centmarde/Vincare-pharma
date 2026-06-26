<script setup lang="ts">
import { computed } from 'vue'
import { EXPENSE_CATEGORIES, EXPENSE_DEPARTMENTS, EXPENSE_PAYMENT_METHODS } from '@/stores/financeData'
import type { ExpenseCategory, ExpenseDepartment, ExpensePaymentMethod, CashAccountType } from '@/stores/financeData'
import { formatCurrency } from '@/utils/helpers'

const props = defineProps<{
  modelValue: boolean
  category: ExpenseCategory | null
  department: ExpenseDepartment | null
  orSiNo: string
  amount: number | null
  paidTo: string
  paymentMethod: ExpensePaymentMethod | null
  valueDate: string | null
  remarks: string
  cashAccountId: number | null
  cashAccounts: CashAccountType[]
  canSubmit: boolean
  loading: boolean
}>()

const accountOptions = computed(() =>
  props.cashAccounts.map((a) => ({
    value: a.id,
    title: `${a.name} — ${formatCurrency(a.balance)} available`,
  })),
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:category', value: ExpenseCategory | null): void
  (e: 'update:department', value: ExpenseDepartment | null): void
  (e: 'update:orSiNo', value: string): void
  (e: 'update:amount', value: number | null): void
  (e: 'update:paidTo', value: string): void
  (e: 'update:paymentMethod', value: ExpensePaymentMethod | null): void
  (e: 'update:valueDate', value: string | null): void
  (e: 'update:remarks', value: string): void
  (e: 'update:cashAccountId', value: number | null): void
  (e: 'submit'): void
}>()
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="480"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-5 pb-3 text-h6 font-weight-bold">Record Expense</v-card-title>
      <v-divider />

      <v-card-text class="pa-5">
        <label class="field-label">Department</label>
        <v-select
          :model-value="department"
          :items="EXPENSE_DEPARTMENTS"
          item-title="title"
          item-value="value"
          placeholder="Select department"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:department', $event)"
        />

        <label class="field-label">Category <span class="text-error">*</span></label>
        <v-select
          :model-value="category"
          :items="EXPENSE_CATEGORIES"
          item-title="title"
          item-value="value"
          placeholder="Select category"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:category', $event)"
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
          @update:model-value="emit('update:amount', $event === '' ? null : Number($event))"
        />

        <label class="field-label">Cash Account <span class="text-error">*</span></label>
        <v-select
          :model-value="cashAccountId"
          :items="accountOptions"
          item-title="title"
          item-value="value"
          placeholder="Select account paid from"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:cashAccountId', $event)"
        />

        <label class="field-label">OR/SI No.</label>
        <v-text-field
          :model-value="orSiNo"
          placeholder="Official receipt / sales invoice number"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:orSiNo', $event)"
        />

        <label class="field-label">Paid To</label>
        <v-text-field
          :model-value="paidTo"
          placeholder="Optional — payee/vendor"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:paidTo', $event)"
        />

        <label class="field-label">Payment Method</label>
        <v-select
          :model-value="paymentMethod"
          :items="EXPENSE_PAYMENT_METHODS"
          item-title="title"
          item-value="value"
          placeholder="Select payment method"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:paymentMethod', $event)"
        />

        <label class="field-label">Date</label>
        <v-text-field
          :model-value="valueDate"
          type="date"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:valueDate', $event || null)"
        />

        <label class="field-label">Remarks</label>
        <v-textarea
          :model-value="remarks"
          placeholder="Optional"
          variant="outlined"
          density="compact"
          rows="2"
          hide-details
          @update:model-value="emit('update:remarks', $event)"
        />
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4 justify-end" style="gap: 8px">
        <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">
          Cancel
        </v-btn>
        <v-btn
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          :loading="loading"
          :disabled="!canSubmit"
          @click="emit('submit')"
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
