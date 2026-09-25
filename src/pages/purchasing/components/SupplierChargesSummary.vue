<script setup lang="ts">
import type { SupplierPurchaseSummary } from '../composables/usePurchaseRequisition'
import type { SupplierType } from '@/stores/suppliersData'
import { formatCurrency } from '@/utils/helpers'

const props = defineProps<{
  supplierSummaries: SupplierPurchaseSummary[]
  suppliers: SupplierType[]
  companyCostTotal: number
  purchaseGrandTotal: number
}>()

function supplierName(supplierId: number): string {
  const supplier = props.suppliers.find((s) => s.id === supplierId)
  return supplier?.name ?? 'Supplier'
}
</script>

<template>
  <v-card v-if="!supplierSummaries.length" variant="flat" rounded="lg" class="pa-4 border">
    <div class="d-flex justify-space-between align-center">
      <span class="text-body-2">Net Total Amount</span>
      <span class="text-h6 font-weight-bold">{{ formatCurrency(companyCostTotal) }}</span>
    </div>
    <div class="text-caption text-medium-emphasis mt-2">
      Pick a supplier for your items to add a discount, tax, or shipping.
    </div>
  </v-card>

  <v-card
    v-for="summary in supplierSummaries"
    :key="summary.charges.supplier_id"
    variant="flat"
    rounded="lg"
    class="border mb-4"
  >
    <div class="d-flex align-center ga-2 px-4 pt-3 pb-1">
      <v-icon icon="mdi-truck-outline" size="18" color="primary" />
      <span class="text-caption text-medium-emphasis">Supplier:</span>
      <span class="text-subtitle-1 font-weight-bold text-high-emphasis">
        {{ supplierName(summary.charges.supplier_id) }}
      </span>
    </div>
    <v-table density="compact">
      <tbody>
        <tr>
          <td class="font-weight-bold">Net Total Amount:</td>
          <td class="text-right text-no-wrap">
            {{ formatCurrency(summary.netTotal) }}
          </td>
        </tr>
        <tr>
          <td>
            <div class="d-flex flex-wrap align-center ga-2 py-1">
              <span class="font-weight-bold">Discount:</span>
              <span class="text-medium-emphasis">(-)</span>
              <v-text-field
                v-model.number="summary.charges.discount_percent"
                type="number"
                min="0"
                max="100"
                suffix="%"
                autocomplete="off"
                variant="outlined"
                density="compact"
                max-width="110"
                hide-details
              />
            </div>
          </td>
          <td class="text-right text-no-wrap">
            {{ formatCurrency(summary.discountAmount) }}
          </td>
        </tr>
        <tr>
          <td>
            <span class="font-weight-bold">Purchase Tax:</span>
            <span class="text-medium-emphasis ml-2">(+)</span>
          </td>
          <td>
            <div class="d-flex justify-end py-1">
              <v-text-field
                v-model.number="summary.charges.tax_amount"
                type="number"
                min="0"
                prefix="₱"
                autocomplete="off"
                variant="outlined"
                density="compact"
                max-width="140"
                hide-details
              />
            </div>
          </td>
        </tr>
        <tr>
          <td>
            <span class="font-weight-bold">Additional Shipping charges:</span>
            <span class="text-medium-emphasis ml-2">(+)</span>
          </td>
          <td>
            <div class="d-flex justify-end py-1">
              <v-text-field
                v-model.number="summary.charges.shipping_amount"
                type="number"
                min="0"
                prefix="₱"
                autocomplete="off"
                variant="outlined"
                density="compact"
                max-width="140"
                hide-details
              />
            </div>
          </td>
        </tr>
        <tr>
          <td class="font-weight-bold">Purchase Total:</td>
          <td class="text-right text-no-wrap text-subtitle-1 font-weight-bold">
            {{ formatCurrency(summary.purchaseTotal) }}
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>

  <div
    v-if="supplierSummaries.length > 1"
    class="d-flex justify-space-between align-center px-4"
  >
    <span class="text-body-2 font-weight-bold">
      Total for {{ supplierSummaries.length }} requisitions
    </span>
    <span class="text-h6 font-weight-bold">{{ formatCurrency(purchaseGrandTotal) }}</span>
  </div>
</template>
