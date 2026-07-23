<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { formatCurrency } from '@/utils/helpers'
import { useBestSellingProducts } from '@/stores/bestSellingProducts'

const store = useBestSellingProducts()
const { items, loading } = storeToRefs(store)
const { fetchBestSellingProducts } = store

const page = ref(1)
const perPage = 5

const totalPages = computed(() => Math.max(1, Math.ceil((items.value || []).length / perPage)))
const paginatedItems = computed(() => {
  const start = (page.value - 1) * perPage
  return (items.value || []).slice(start, start + perPage)
})

watch(() => items.value?.length, () => {
  page.value = 1
})

onMounted(() => {
  fetchBestSellingProducts()
})
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
        v-if="loading"
        class="text-caption text-medium-emphasis"
      >
        Loading best selling products...
      </div>

      <div
        v-else-if="!(items && items.length)"
        class="text-caption text-medium-emphasis"
      >
        No products found.
      </div>

      <template v-else>
        <div
          v-for="(product, idx) in paginatedItems"
          :key="product.product_id"
          class="product-row"
        >
          <div class="d-flex align-center ga-3 mb-2">
            <div
              class="product-rank font-weight-bold text-caption"
              :class="`product-rank--${product.rank}`"
            >
              {{ product.rank }}
            </div>
            <div class="flex-grow-1" style="min-width: 0">
              <div class="text-body-2 font-weight-medium text-truncate">
                {{ product.product_name }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ product.total_qty_sold.toLocaleString() }} units sold
              </div>
            </div>
            <div class="text-body-2 font-weight-bold text-right">
              {{ formatCurrency(product.total_revenue) }}
            </div>
          </div>
          <!-- Progress bar for visual weight -->
          <v-progress-linear
            :model-value="paginatedItems.length ? (product.total_revenue / paginatedItems[0].total_revenue) * 100 : 0"
            :color="['primary', 'success', 'warning', 'info', 'error'][idx]"
            height="4"
            rounded
            class="mb-3"
          />
        </div>

        <v-pagination
          v-if="totalPages > 1"
          v-model="page"
          :length="totalPages"
          density="compact"
          class="mt-4"
        />
      </template>
    </v-card-text>
  </v-card>
</template>