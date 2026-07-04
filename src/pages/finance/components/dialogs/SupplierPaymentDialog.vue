<script setup lang="ts">
import { formatCurrency } from '@/utils/helpers'

defineProps<{
  modelValue: boolean
  outstanding: number
  amount: number | null
  paymentMethod: string
  referenceNo: string
  valueDate: string | null
  remarks: string
  canSubmit: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:amount', value: number | null): void
  (e: 'update:paymentMethod', value: string): void
  (e: 'update:referenceNo', value: string): void
  (e: 'update:valueDate', value: string | null): void
  (e: 'update:remarks', value: string): void
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
      <v-card-title class="pa-4 pa-sm-5 pb-3 text-h6 font-weight-bold">Record Supplier Payment</v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <div class="d-flex justify-space-between align-center mb-4">
          <span class="text-body-1 text-medium-emphasis">Outstanding</span>
          <span class="text-h6 font-weight-bold">{{ formatCurrency(outstanding) }}</span>
        </div>

        <label class="field-label">Amount <span class="text-error">*</span></label>
        <v-text-field
          :model-value="amount"
          type="number"
          min="0"
          :max="outstanding"
          prefix="₱"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:amount', $event === '' ? null : Number($event))"
        />

        <label class="field-label">Payment Method</label>
        <v-text-field
          :model-value="paymentMethod"
          placeholder="Optional — e.g. cash, bank transfer"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:paymentMethod', $event)"
        />

        <label class="field-label">Reference #</label>
        <v-text-field
          :model-value="referenceNo"
          placeholder="Optional — check no., transfer ref"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
          @update:model-value="emit('update:referenceNo', $event)"
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

      <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
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
          Record Payment
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
