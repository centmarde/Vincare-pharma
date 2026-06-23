<script setup lang="ts">
import { onMounted } from 'vue'
import { useStockTransferRequest } from '../composables/useStockTransferRequest'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created'): void
}>()

const {
  loading, outletId, remarks, items,
  outletOptions, productOptions,
  addItem, removeItem, handleSubmit, init,
} = useStockTransferRequest(() => emit('created'))

onMounted(init)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="720"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-5 pb-3 text-h6 font-weight-bold">
        New Stock Transfer Request
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-5">
        <v-row dense>
          <v-col cols="12">
            <label class="field-label">Outlet <span class="text-error">*</span></label>
            <v-select
              v-model="outletId"
              :items="outletOptions"
              placeholder="Select destination outlet"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>

          <v-col cols="12">
            <label class="field-label">Remarks</label>
            <v-textarea
              v-model="remarks"
              placeholder="Optional notes for this transfer"
              variant="outlined"
              density="compact"
              rows="2"
              hide-details
            />
          </v-col>
        </v-row>

        <v-divider class="my-4" />

        <div class="d-flex justify-space-between align-center mb-2">
          <span class="text-subtitle-2 font-weight-bold">Items</span>
          <v-btn
            variant="text"
            size="small"
            color="primary"
            class="text-none"
            prepend-icon="mdi-plus"
            @click="addItem"
          >
            Add Item
          </v-btn>
        </div>

        <v-row v-for="(item, index) in items" :key="index" dense align="center">
          <v-col cols="7">
            <v-select
              v-model="item.product_id"
              :items="productOptions"
              placeholder="Select product"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="3">
            <v-text-field
              v-model.number="item.requested_qty"
              type="number"
              min="1"
              placeholder="Qty"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="2" class="text-center">
            <v-btn
              variant="text"
              size="small"
              icon="mdi-trash-can-outline"
              color="error"
              :disabled="items.length === 1"
              @click="removeItem(index)"
            />
          </v-col>
        </v-row>
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
          @click="handleSubmit"
        >
          Submit Request
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
