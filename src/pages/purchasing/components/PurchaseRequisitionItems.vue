<script setup lang="ts">
import { unitOptions } from '../composables/usePurchaseRequisition'
import type { PRFormItem } from '../composables/usePurchaseRequisition'
import type { SupplierType } from '@/stores/suppliersData'
import ExpiryMonthField from './ExpiryMonthField.vue'
import { formatCurrency } from '@/utils/helpers'
import { useDisplay } from 'vuetify'

defineProps<{
  items: PRFormItem[]
  suppliers: SupplierType[]
}>()

const emit = defineEmits<{
  'remove-item': [index: number]
  'unlink-product': [item: PRFormItem]
  'pick-product': [index: number]
}>()

const { mobile } = useDisplay()
</script>

<template>
  <template v-if="!mobile">
    <v-row class="text-caption font-weight-bold mb-1 px-1" no-gutters>
      <v-col cols="auto" style="width: 36px" class="text-center">NO.</v-col>
      <v-col cols="auto" style="width: 110px" class="pl-2">UNIT</v-col>
      <v-col class="pl-2">PRODUCT</v-col>
      <v-col cols="auto" style="width: 180px" class="pl-2">SUPPLIER</v-col>
      <v-col cols="auto" style="width: 160px" class="pl-2">BATCH NO.</v-col>
      <v-col cols="auto" style="width: 115px" class="pl-2">EXPIRY</v-col>
      <v-col cols="auto" style="width: 110px" class="pl-2">QTY</v-col>
      <v-col cols="auto" style="width: 110px" class="pl-2">COST/UNIT</v-col>
      <v-col cols="auto" style="width: 120px" class="text-right pr-2">COST TOTAL</v-col>
      <v-col cols="auto" style="width: 40px" />
    </v-row>

    <v-row
      v-for="(item, index) in items"
      :key="index"
      class="align-center mb-2 px-1"
      no-gutters
    >
      <v-col cols="auto" style="width: 36px" class="text-center text-body-2">
        {{ index + 1 }}
      </v-col>

      <v-col cols="auto" style="width: 110px" class="pl-2">
        <v-select
          v-model="item.unit"
          :items="unitOptions"
          variant="outlined"
          density="compact"
          hide-details
        />
      </v-col>

      <v-col class="pl-2">
        <v-text-field
          v-model="item.product_name"
          placeholder="Item description"
          autocomplete="off"
          variant="outlined"
          density="compact"
          hide-details
          append-inner-icon="mdi-database-search-outline"
          @update:model-value="emit('unlink-product', item)"
          @click:append-inner="emit('pick-product', index)"
        />
      </v-col>

      <v-col cols="auto" style="width: 180px" class="pl-2">
        <v-autocomplete
          v-model="item.supplier_id"
          :items="suppliers"
          item-title="name"
          item-value="id"
          placeholder="Type or paste supplier..."
          autocomplete="off"
          variant="outlined"
          density="compact"
          auto-select-first
          hide-details
          clearable
        />
      </v-col>

      <v-col cols="auto" style="width: 160px" class="pl-2">
        <v-text-field
          v-model="item.batch_no"
          placeholder="Batch/Lot"
          autocomplete="off"
          variant="outlined"
          density="compact"
          hide-details
        />
      </v-col>

      <v-col cols="auto" style="width: 115px" class="pl-2">
        <ExpiryMonthField v-model="item.expiry_date" />
      </v-col>

      <v-col cols="auto" style="width: 110px" class="pl-2">
        <v-text-field
          v-model.number="item.qty"
          type="number"
          placeholder="Qty"
          autocomplete="off"
          variant="outlined"
          density="compact"
          hide-details
        />
      </v-col>

      <v-col cols="auto" style="width: 110px" class="pl-2">
        <v-text-field
          v-model.number="item.cost_per_unit"
          type="number"
          placeholder="0.00"
          autocomplete="off"
          variant="outlined"
          density="compact"
          hide-details
        />
      </v-col>

      <v-col cols="auto" style="width: 120px" class="text-right pr-2">
        <span class="text-body-2 font-weight-bold text-blue-darken-2">
          {{ formatCurrency((item.qty || 0) * (item.cost_per_unit || 0)) }}
        </span>
      </v-col>

      <v-col cols="auto" style="width: 40px" class="text-center">
        <v-btn
          icon="mdi-close"
          variant="tonal"
          color="red-lighten-1"
          size="small"
          @click="emit('remove-item', index)"
        />
      </v-col>
    </v-row>
  </template>

  <template v-else>
    <div
      v-for="(item, index) in items"
      :key="index"
      class="mobile-item-card mb-3 pa-3 rounded-lg border"
    >
      <div class="d-flex justify-space-between align-center mb-3">
        <span class="text-caption font-weight-bold text-medium-emphasis">
          ITEM {{ index + 1 }}
        </span>
        <v-btn
          icon="mdi-close"
          variant="tonal"
          color="red-lighten-1"
          size="x-small"
          @click="emit('remove-item', index)"
        />
      </div>

      <div class="mb-2">
        <div class="field-label">Product Description</div>
        <v-text-field
          v-model="item.product_name"
          placeholder="Item description"
          autocomplete="off"
          variant="outlined"
          density="compact"
          hide-details
          append-inner-icon="mdi-database-search-outline"
          @update:model-value="emit('unlink-product', item)"
          @click:append-inner="emit('pick-product', index)"
        />
      </div>

      <v-row no-gutters class="mb-2" style="gap: 8px">
        <v-col>
          <div class="field-label">Unit</div>
          <v-select
            v-model="item.unit"
            :items="unitOptions"
            variant="outlined"
            density="compact"
            hide-details
          />
        </v-col>
        <v-col>
          <div class="field-label">Quantity</div>
          <v-text-field
            v-model.number="item.qty"
            type="number"
            placeholder="0"
            autocomplete="off"
            variant="outlined"
            density="compact"
            hide-details
          />
        </v-col>
      </v-row>

      <v-row no-gutters class="mb-2" style="gap: 8px">
        <v-col>
          <div class="field-label">Supplier</div>
          <v-autocomplete
            v-model="item.supplier_id"
            :items="suppliers"
            item-title="name"
            item-value="id"
            placeholder="Type or paste supplier..."
            variant="outlined"
            density="compact"
            auto-select-first
            hide-details
            clearable
          />
        </v-col>
        <v-col>
          <div class="field-label">Expiry Date</div>
          <ExpiryMonthField
            v-model="item.expiry_date"
            prepend-inner-icon="mdi-calendar-month-outline"
          />
        </v-col>
      </v-row>

      <v-row no-gutters class="mb-3" style="gap: 8px">
        <v-col>
          <div class="field-label">Batch No.</div>
          <v-text-field
            v-model="item.batch_no"
            placeholder="Batch/Lot"
            autocomplete="off"
            variant="outlined"
            density="compact"
            hide-details
          />
        </v-col>
        <v-col>
          <div class="field-label">Cost / Unit</div>
          <v-text-field
            v-model.number="item.cost_per_unit"
            type="number"
            placeholder="0.00"
            autocomplete="off"
            variant="outlined"
            density="compact"
            hide-details
          />
        </v-col>
      </v-row>

      <v-divider class="mb-2" />
      <div class="d-flex justify-end align-center">
        <div class="text-caption">
          <span class="text-medium-emphasis">Cost Total </span>
          <span class="font-weight-bold text-blue-darken-2">
            {{ formatCurrency((item.qty || 0) * (item.cost_per_unit || 0)) }}
          </span>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.mobile-item-card {
  background-color: rgb(var(--v-theme-surface));
}

.field-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 4px;
}
</style>
