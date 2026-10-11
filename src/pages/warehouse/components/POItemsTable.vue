<script setup lang="ts">
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import type { PRItem } from '@/stores/purchaseRequisitionData'
import { formatCurrency, formatExpiryMonthYear } from '@/utils/helpers'
import ExpiryDateField from './ExpiryDateField.vue'

// Desktop items table (editable SKU / actual count / batch no / expiry).
// Needs-sku-input & the generate handler dipasahan ra sa parent aron consistent
// ang store-loading logic (loadSkuValues) sa usa ra ka lugar.
defineProps<{
  po: PurchaseOrder | null
  skuEditMode?: boolean
  transactionItems: PRItem[]
  effectiveEmptyRows: number
  needsSkuInput: (item: PRItem) => boolean
  onGenerateSku: (item: PRItem) => void
}>()
</script>

<template>
  <v-table density="compact" class="po-table mb-6 border rounded-lg">
    <thead>
      <tr class="bg-blue-darken-3">
        <th class="text-white">ITEM #</th>
        <th class="text-white">DESCRIPTION</th>
        <th class="text-white text-right">UNIT PRICE</th>
        <th class="text-white text-right">TOTAL</th>
        <th class="text-white text-center" style="width: 130px">SKU</th>
        <th class="text-white text-center" style="width: 130px">ACTUAL COUNT</th>
        <th class="text-white text-center" style="width: 130px">BATCH NO</th>
        <th class="text-white text-center" style="width: 150px">EXPIRY</th>
      </tr>
    </thead>

    <tbody>
      <tr v-if="transactionItems.length === 0">
        <td colspan="8" class="text-center pa-4">No items found.</td>
      </tr>

      <tr v-for="(item, index) in transactionItems" :key="item.id">
        <td>{{ index + 1 }}</td>
        <td>{{ item.product_name ?? '—' }}</td>
        <td class="text-right">{{ formatCurrency(item.cost_per_unit ?? 0) }}</td>
        <td class="text-right">
          {{ formatCurrency((item.qty ?? 0) * (item.cost_per_unit ?? 0)) }}
        </td>
        <td class="text-center" style="width: 130px">
          <v-text-field
            v-if="skuEditMode && needsSkuInput(item)"
            v-model="item.sku"
            density="compact"
            variant="outlined"
            hide-details
            placeholder="Enter SKU"
            autocomplete="off"
            style="width: 120px"
            :append-inner-icon="item.sku ? '' : 'mdi-dice-multiple'"
            :title="item.sku ? '' : 'Generate SKU'"
            @click:append-inner="onGenerateSku(item)"
          />
          <v-chip
            v-else-if="skuEditMode"
            :color="item.sku ? 'green' : 'error'"
            variant="tonal"
            size="small"
            label
          >
            {{ item.sku || 'No SKU' }}
          </v-chip>
          <span v-else>{{ item.sku ?? '—' }}</span>
        </td>
        <td class="text-center" style="width: 130px">
          <v-text-field
            v-if="skuEditMode"
            v-model.number="item.actual_count_stock_in"
            type="number"
            density="compact"
            variant="outlined"
            hide-details
            min="1"
            autocomplete="off"
            class="input-number"
            style="width: 120px"
          />
          <span v-else>{{ item.actual_count_stock_in ?? '—' }}</span>
        </td>
        <td class="text-center" style="width: 130px">
          <v-text-field
            v-if="skuEditMode"
            v-model="item.batch_no"
            density="compact"
            variant="outlined"
            hide-details
            placeholder="Enter batch no"
            autocomplete="off"
            style="width: 120px"
          />
          <span v-else>{{ item.batch_no ?? '—' }}</span>
        </td>
        <td class="text-center" style="width: 150px">
          <ExpiryDateField v-if="skuEditMode" :item="item" width="140px" />
          <span v-else>{{ formatExpiryMonthYear(item.expiry_date) }}</span>
        </td>
      </tr>

      <tr v-for="n in effectiveEmptyRows" :key="`empty-${n}`">
        <td colspan="8">&nbsp;</td>
      </tr>
    </tbody>

    <tfoot>
      <tr class="bg-grey-lighten-3">
        <td colspan="7" class="text-right font-weight-bold">TOTAL</td>
        <td class="text-center font-weight-bold">
          {{ formatCurrency(po?.total_amount ?? 0) }}
        </td>
      </tr>
    </tfoot>
  </v-table>
</template>

<style scoped>
.po-table {
  table-layout: fixed;
}
.po-table th {
  height: 38px !important;
}
.po-table th:nth-child(5),
.po-table th:nth-child(6) {
  width: 130px;
}
.input-number :deep(input[type="number"]) {
  -moz-appearance: textfield;
  appearance: textfield;
}
.input-number :deep(input[type="number"]::-webkit-outer-spin-button),
.input-number :deep(input[type="number"]::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}
</style>
