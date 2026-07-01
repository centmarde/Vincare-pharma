<script setup lang="ts">
import type { ExpectedSummary } from '@/stores/remittancesData'
import { formatCurrency } from '@/utils/helpers'

defineProps<{
  modelValue: boolean
  expected: ExpectedSummary
  actualAmount: number | null
  notes: string
  discrepancy: number
  requiresNote: boolean
  canSubmit: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:actualAmount', value: number | null): void
  (e: 'update:notes', value: string): void
  (e: 'submit'): void
}>()

const noteRequiredRule = (v: string) => !!v?.trim() || 'A note is required for a cash discrepancy.'
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="480"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-5 pb-3 text-h6 font-weight-bold">Close Day / Remit Cash</v-card-title>
      <v-divider />

      <v-card-text class="pa-5">
        <div class="d-flex justify-space-between align-center mb-1">
          <span class="text-body-2 text-medium-emphasis">Unremitted cash sales</span>
          <span class="text-body-2 font-weight-medium">{{ expected.saleCount }}</span>
        </div>
        <div class="d-flex justify-space-between align-center mb-4">
          <span class="text-body-1 text-medium-emphasis">Expected (system)</span>
          <span class="text-h6 font-weight-bold">{{ formatCurrency(expected.expected) }}</span>
        </div>

        <v-alert
          v-if="expected.saleCount === 0"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-2"
        >
          No unremitted cash sales right now.
        </v-alert>

        <template v-else>
          <label class="field-label">Actual Cash Counted <span class="text-error">*</span></label>
          <v-text-field
            :model-value="actualAmount"
            type="number"
            min="0"
            prefix="₱"
            variant="outlined"
            density="compact"
            autofocus
            hide-details
            @update:model-value="emit('update:actualAmount', $event === '' ? null : Number($event))"
          />

          <v-divider class="my-4" />

          <div class="d-flex justify-space-between align-center">
            <span class="text-body-1 font-weight-medium">Discrepancy</span>
            <span
              class="text-h6 font-weight-bold"
              :class="discrepancy === 0 ? 'text-success' : 'text-error'"
            >
              {{ formatCurrency(discrepancy) }}
            </span>
          </div>
          <div class="text-caption text-medium-emphasis text-right mb-3">
            {{ discrepancy === 0 ? 'Balanced' : discrepancy > 0 ? 'Over' : 'Short' }}
          </div>

          <label class="field-label">
            Notes <span v-if="requiresNote" class="text-error">* required — explain the discrepancy</span>
          </label>
          <v-textarea
            :model-value="notes"
            :placeholder="requiresNote ? 'Required: why is this short/over?' : 'Optional'"
            :rules="requiresNote ? [noteRequiredRule] : []"
            variant="outlined"
            density="compact"
            rows="2"
            hide-details="auto"
            @update:model-value="emit('update:notes', $event)"
          />
        </template>
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
          Submit Remittance
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
