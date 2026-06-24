<script setup lang="ts">
import { formatCurrency } from '@/utils/helpers'

defineProps<{
  modelValue: boolean
  total: number
  tendered: number | null
  changeDue: number
  canComplete: boolean
  loading: boolean
  customerName: string
  customerAddress: string
  customerMobile: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:tendered', value: number | null): void
  (e: 'update:customerName', value: string): void
  (e: 'update:customerAddress', value: string): void
  (e: 'update:customerMobile', value: string): void
  (e: 'confirm'): void
}>()

const quickAmounts = [20, 50, 100, 200, 500, 1000]
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="460"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-5 pb-3 text-h6 font-weight-bold">Payment</v-card-title>
      <v-divider />

      <v-card-text class="pa-5">
        <div class="d-flex justify-space-between align-center mb-4">
          <span class="text-body-1 text-medium-emphasis">Total Due</span>
          <span class="text-h5 font-weight-bold">{{ formatCurrency(total) }}</span>
        </div>

        <label class="field-label">Customer <span class="text-medium-emphasis">(optional)</span></label>
        <v-text-field
          :model-value="customerName"
          placeholder="Customer / business name"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-2"
          @update:model-value="emit('update:customerName', $event)"
        />
        <v-text-field
          :model-value="customerAddress"
          placeholder="Address"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-2"
          @update:model-value="emit('update:customerAddress', $event)"
        />
        <v-text-field
          :model-value="customerMobile"
          placeholder="Mobile"
          variant="outlined"
          density="compact"
          hide-details
          @update:model-value="emit('update:customerMobile', $event)"
        />

        <v-divider class="my-4" />

        <label class="field-label">Cash Tendered <span class="text-error">*</span></label>
        <v-text-field
          :model-value="tendered"
          type="number"
          min="0"
          prefix="₱"
          variant="outlined"
          density="compact"
          autofocus
          hide-details
          @update:model-value="emit('update:tendered', $event === '' ? null : Number($event))"
        />

        <div class="d-flex flex-wrap ga-2 mt-3">
          <v-btn
            v-for="amt in quickAmounts"
            :key="amt"
            size="small"
            variant="outlined"
            class="text-none"
            @click="emit('update:tendered', amt)"
          >
            ₱{{ amt }}
          </v-btn>
        </div>

        <v-divider class="my-4" />

        <div class="d-flex justify-space-between align-center">
          <span class="text-body-1 font-weight-medium">Change</span>
          <span class="text-h6 font-weight-bold" :class="changeDue > 0 ? 'text-success' : ''">
            {{ formatCurrency(changeDue) }}
          </span>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4 justify-end" style="gap: 8px">
        <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">
          Cancel
        </v-btn>
        <v-btn
          color="success"
          class="text-none font-weight-bold"
          elevation="0"
          :loading="loading"
          :disabled="!canComplete"
          @click="emit('confirm')"
        >
          Complete Sale
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
