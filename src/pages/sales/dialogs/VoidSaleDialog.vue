<script setup lang="ts">
import type { SaleType } from '@/stores/salesData'
import { formatCurrency } from '@/utils/helpers'

defineProps<{
  modelValue: boolean
  sale: SaleType | null
  reason: string
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:reason', value: string): void
  (e: 'confirm'): void
}>()
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="440"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg" v-if="sale">
      <v-card-title class="pa-5 pb-2 text-h6 font-weight-bold">Void Sale</v-card-title>
      <v-divider />

      <v-card-text class="pa-5">
        <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
          Voiding {{ sale.sale_no }} ({{ formatCurrency(sale.total_amount ?? 0) }}) will return its
          items to Exelmed stock. This cannot be undone.
        </v-alert>

        <label class="field-label">Reason <span class="text-medium-emphasis">(optional)</span></label>
        <v-textarea
          :model-value="reason"
          placeholder="e.g. wrong item, customer cancelled"
          variant="outlined"
          density="compact"
          rows="2"
          hide-details
          @update:model-value="emit('update:reason', $event)"
        />
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4 justify-end" style="gap: 8px">
        <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">
          Cancel
        </v-btn>
        <v-btn
          color="error"
          class="text-none font-weight-bold"
          elevation="0"
          :loading="loading"
          @click="emit('confirm')"
        >
          Void Sale
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
