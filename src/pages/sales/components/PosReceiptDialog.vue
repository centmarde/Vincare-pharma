<script setup lang="ts">
import type { Receipt } from '../composables/usePosCheckout'
import { formatCurrency } from '@/utils/helpers'

defineProps<{
  modelValue: boolean
  receipt: Receipt | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="420"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg" v-if="receipt">
      <v-card-text class="pa-6 text-center">
        <v-icon color="success" size="48" class="mb-2">mdi-check-circle</v-icon>
        <div class="text-h6 font-weight-bold mb-1">Sale Completed</div>
        <div class="text-body-2 text-medium-emphasis mb-4">{{ receipt.sale_no }}</div>

        <v-divider class="mb-3" />

        <div class="text-left">
          <div
            v-for="(line, i) in receipt.lines"
            :key="i"
            class="d-flex justify-space-between text-body-2 mb-1"
          >
            <span>{{ line.quantity }} × {{ line.product_name }}</span>
            <span>{{ formatCurrency(line.line_total) }}</span>
          </div>
        </div>

        <v-divider class="my-3" />

        <div class="d-flex justify-space-between text-body-1 font-weight-bold mb-1">
          <span>Total</span><span>{{ formatCurrency(receipt.total) }}</span>
        </div>
        <div class="d-flex justify-space-between text-body-2 text-medium-emphasis">
          <span>Tendered</span><span>{{ formatCurrency(receipt.tendered) }}</span>
        </div>
        <div class="d-flex justify-space-between text-body-2 text-success font-weight-medium">
          <span>Change</span><span>{{ formatCurrency(receipt.change) }}</span>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4 justify-center">
        <v-btn
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          block
          @click="emit('update:modelValue', false)"
        >
          New Sale
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
