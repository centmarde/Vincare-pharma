<script setup lang="ts">
import type { PurchaseBreakdown } from '@/utils/computationHelpers'
import { formatCurrency } from '@/utils/helpers'

defineProps<{
  breakdown: PurchaseBreakdown
}>()
</script>

<template>
  <div class="d-flex justify-space-between ga-4">
    <span class="text-medium-emphasis">Net Total Amount</span>
    <span>{{ formatCurrency(breakdown.netTotal) }}</span>
  </div>
  <div class="d-flex justify-space-between ga-4">
    <span class="text-medium-emphasis">Less {{ breakdown.discountPercent }}% Discount</span>
    <span>{{ formatCurrency(breakdown.discountAmount) }}</span>
  </div>
  <div class="d-flex justify-space-between ga-4">
    <span class="text-medium-emphasis">Add Purchase Tax</span>
    <span>{{ formatCurrency(breakdown.taxAmount) }}</span>
  </div>
  <div class="d-flex justify-space-between ga-4">
    <span class="text-medium-emphasis">Add Shipping Charges</span>
    <span>{{ formatCurrency(breakdown.shippingAmount) }}</span>
  </div>
</template>
