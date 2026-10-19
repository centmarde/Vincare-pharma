<script setup lang="ts">
import { computed } from 'vue'
import MoneyField from '@/components/inputs/MoneyField.vue'
import { formatCurrency } from '@/utils/helpers'
import type { PaymentMethod } from '@/utils/paymentMethods'

// A payment on a POS sale charged to a customer account, received at the
// office. Form state lives in useAccountsReceivable.
const props = defineProps<{
  modelValue: boolean
  saleNo: string | null
  customerName: string | null
  balance: number
  amount: number
  method: PaymentMethod
  reference: string
  remarks: string
  cashAccountId: number | null
  cashAccountOptions: { value: number; title: string }[]
  methodOptions: { value: PaymentMethod; title: string }[]
  canConfirm: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:amount', value: number): void
  (e: 'update:method', value: PaymentMethod): void
  (e: 'update:reference', value: string): void
  (e: 'update:remarks', value: string): void
  (e: 'update:cashAccountId', value: number | null): void
  (e: 'confirm'): void
}>()

const remaining = computed(() => Math.max(0, props.balance - (props.amount || 0)))
const overpaid = computed(() => (props.amount || 0) > props.balance + 0.005)
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="460" persistent @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3">
        <div class="text-h6 font-weight-bold">Record payment</div>
        <div class="text-caption text-medium-emphasis">
          {{ saleNo ?? 'Charged sale' }}<template v-if="customerName"> · {{ customerName }}</template>
        </div>
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <div class="d-flex justify-space-between align-center mb-4">
          <span class="text-body-2 text-medium-emphasis">Owed</span>
          <span class="text-h6 font-weight-bold">{{ formatCurrency(balance) }}</span>
        </div>

        <label class="field-label">Amount <span class="text-error">*</span></label>
        <MoneyField
          :model-value="amount"
          variant="outlined"
          density="compact"
          :error-messages="overpaid ? 'More than what is owed' : undefined"
          :hide-details="!overpaid"
          class="mb-3"
          @update:model-value="emit('update:amount', $event)"
        />

        <label class="field-label">Paid by</label>
        <v-select
          :model-value="method"
          :items="methodOptions"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:method', $event)"
        />

        <label class="field-label">Reference / OR #</label>
        <v-text-field
          :model-value="reference"
          placeholder="OR no., cheque no. or transfer reference"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:reference', $event)"
        />

        <label class="field-label">Deposited to <span class="text-error">*</span></label>
        <v-select
          :model-value="cashAccountId"
          :items="cashAccountOptions"
          placeholder="Which of our accounts received it"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:cashAccountId', $event)"
        />

        <label class="field-label">Remarks</label>
        <v-text-field
          :model-value="remarks"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-4"
          @update:model-value="emit('update:remarks', $event)"
        />

        <div class="d-flex justify-space-between text-body-2">
          <span class="text-medium-emphasis">Still owed after this</span>
          <span class="font-weight-bold">{{ formatCurrency(remaining) }}</span>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="px-4 px-sm-5 pb-4 pb-sm-5 pt-3 d-flex justify-end ga-2">
        <v-btn variant="outlined" class="text-none" :disabled="loading" @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="text-none font-weight-bold"
          :loading="loading"
          :disabled="!canConfirm"
          @click="emit('confirm')"
        >
          Record payment
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
  margin-bottom: 4px;
}
</style>
