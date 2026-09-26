<script setup lang="ts">
import type { PRItem } from '@/stores/purchaseRequisitionData'
import { formatCurrency } from '@/utils/helpers'
import { unitOptions } from '../composables/usePurchaseRequisition'

defineProps<{
  items: PRItem[]
  supplierOptions: { id: string; name: string | null }[]
  expiryMenuOpen: Record<number, boolean>
  expiryPickerYear: number
  expiryPickerView: 'months' | 'year'
  earliestExpiryDate: string
  latestExpiryDate: string
  expiryFieldText: (item: PRItem, index: number) => string
  expiryDateOf: (item: PRItem) => Date | null
}>()

const emit = defineEmits<{
  'add-item': []
  'remove-item': [index: number]
  'unlink-product': [item: PRItem]
  'pick-product': [index: number]
  'expiry-menu-toggle': [item: PRItem, index: number, isOpen: boolean]
  'expiry-typing-start': [item: PRItem, index: number]
  'expiry-typed': [item: PRItem, index: number, raw: string]
  'expiry-typing-finish': [item: PRItem, index: number]
  'expiry-view-change': [mode: string]
  'expiry-month-select': [item: PRItem, index: number, month: number]
  'expiry-year-select': [item: PRItem, index: number, year: number]
}>()
</script>

<template>
  <v-card
    v-for="(item, index) in items"
    :key="item.id"
    variant="outlined"
    rounded="lg"
    class="pa-4 mb-4"
  >
    <div class="d-flex align-center justify-space-between mb-2">
      <span class="text-subtitle-2 font-weight-medium">Item {{ index + 1 }}</span>
      <v-btn
        icon="mdi-trash-can-outline"
        variant="text"
        color="error"
        size="small"
        aria-label="Remove item"
        @click="emit('remove-item', index)"
      />
    </div>

    <v-row dense>
      <v-col cols="12">
        <v-text-field
          v-model="item.product_name"
          label="Product name"
          variant="outlined"
          density="comfortable"
          hide-details
          append-inner-icon="mdi-database-search-outline"
          @update:model-value="emit('unlink-product', item)"
          @click:append-inner="emit('pick-product', index)"
        />
      </v-col>

      <v-col cols="12">
        <v-select
          v-model="item.supplier_id"
          :items="supplierOptions"
          item-title="name"
          item-value="id"
          label="Supplier"
          variant="outlined"
          density="comfortable"
          hide-details
          clearable
        />
      </v-col>

      <v-col cols="6">
        <v-select
          v-model="item.unit"
          :items="unitOptions"
          label="Unit"
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </v-col>

      <v-col cols="6">
        <v-text-field
          v-model.number="item.qty"
          type="number"
          label="Quantity"
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </v-col>

      <v-col cols="6">
        <v-text-field
          v-model.number="item.cost_per_unit"
          type="number"
          label="Cost / unit"
          prefix="₱"
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </v-col>

      <v-col cols="6">
        <v-menu
          :model-value="expiryMenuOpen[index] ?? false"
          @update:model-value="(isOpen) => emit('expiry-menu-toggle', item, index, isOpen)"
          :close-on-content-click="false"
          location="bottom"
        >
          <template #activator="{ props: menuProps }">
            <v-text-field
              v-bind="menuProps"
              :model-value="expiryFieldText(item, index)"
              label="Expiry"
              placeholder="MM/YYYY"
              maxlength="7"
              inputmode="numeric"
              variant="outlined"
              density="comfortable"
              hide-details
              prepend-inner-icon="mdi-calendar-month-outline"
              @focus="emit('expiry-typing-start', item, index)"
              @update:model-value="(raw) => emit('expiry-typed', item, index, raw)"
              @blur="emit('expiry-typing-finish', item, index)"
            />
          </template>
          <v-date-picker
            :model-value="expiryDateOf(item)"
            :year="expiryPickerYear"
            :view-mode="expiryPickerView"
            :min="earliestExpiryDate"
            :max="latestExpiryDate"
            @update:view-mode="(mode) => emit('expiry-view-change', mode)"
            @update:month="(month) => emit('expiry-month-select', item, index, month)"
          >
            <template #year="{ year, props: yearButtonProps }">
              <v-btn
                :key="year.value"
                v-bind="yearButtonProps"
                @click="emit('expiry-year-select', item, index, year.value)"
              />
            </template>
          </v-date-picker>
        </v-menu>
      </v-col>

      <v-col cols="12">
        <v-text-field
          v-model="item.batch_no"
          label="Batch No."
          placeholder="Batch/Lot"
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </v-col>
    </v-row>

    <v-divider class="my-4" />

    <div class="d-flex align-center justify-space-between">
      <span class="text-body-2 text-medium-emphasis">Line total</span>
      <span class="text-subtitle-1 font-weight-bold">
        {{ formatCurrency((item.qty || 0) * (item.cost_per_unit || 0)) }}
      </span>
    </div>
  </v-card>

  <v-btn
    color="primary"
    variant="tonal"
    rounded="lg"
    class="text-none"
    prepend-icon="mdi-plus"
    block
    @click="emit('add-item')"
  >
    Add item
  </v-btn>
</template>
