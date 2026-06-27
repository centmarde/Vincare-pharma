<script setup lang="ts">
import { formatCurrency } from '@/utils/helpers'
import type { TopProduct } from '../composables/executiveStatic'

defineProps<{
  products: TopProduct[]
}>()
</script>

<template>
  <v-card class="rounded-xl" elevation="0">
    <v-card-text class="pa-4 pa-md-6">
      <div class="d-flex align-center mb-4">
        <v-icon
          icon="mdi-package-variant-closed"
          color="primary"
          size="20"
          class="mr-2"
        />
        <span class="text-h6 font-weight-bold">Top Products</span>
      </div>

      <div
        v-for="(product, idx) in products"
        :key="idx"
        class="product-row"
      >
        <div class="d-flex align-center ga-3 mb-2">
          <div
            class="product-rank font-weight-bold text-caption"
            :class="`product-rank--${idx + 1}`"
          >
            {{ idx + 1 }}
          </div>
          <div class="flex-grow-1" style="min-width: 0">
            <div class="text-body-2 font-weight-medium text-truncate">
              {{ product.name }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ product.qty.toLocaleString() }} units sold
            </div>
          </div>
          <div class="text-body-2 font-weight-bold text-right">
            {{ formatCurrency(product.revenue) }}
          </div>
        </div>
        <!-- Progress bar for visual weight -->
        <v-progress-linear
          :model-value="(product.revenue / products[0].revenue) * 100"
          :color="['primary', 'success', 'warning', 'info', 'error'][idx]"
          height="4"
          rounded
          class="mb-3"
        />
      </div>
    </v-card-text>
  </v-card>
</template>