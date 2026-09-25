<script setup lang="ts">
import type { PurchaseBreakdown } from '@/utils/computationHelpers'
import { formatCurrency } from '@/utils/helpers'

defineProps<{
  breakdown: PurchaseBreakdown
  labelColspan: number
}>()
</script>

<template>
  <tr>
    <td :colspan="labelColspan" class="text-right">NET TOTAL AMOUNT</td>
    <td class="text-right px-3">{{ formatCurrency(breakdown.netTotal) }}</td>
  </tr>
  <tr v-if="breakdown.discountAmount > 0">
    <td :colspan="labelColspan" class="text-right">
      LESS {{ breakdown.discountPercent }}% DISCOUNT
    </td>
    <td class="text-right px-3">{{ formatCurrency(breakdown.discountAmount) }}</td>
  </tr>
  <tr v-if="breakdown.taxAmount > 0">
    <td :colspan="labelColspan" class="text-right">ADD PURCHASE TAX</td>
    <td class="text-right px-3">{{ formatCurrency(breakdown.taxAmount) }}</td>
  </tr>
  <tr v-if="breakdown.shippingAmount > 0">
    <td :colspan="labelColspan" class="text-right">ADD SHIPPING CHARGES</td>
    <td class="text-right px-3">{{ formatCurrency(breakdown.shippingAmount) }}</td>
  </tr>
</template>
