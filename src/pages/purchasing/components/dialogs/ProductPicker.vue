<script setup lang="ts">
import type { ProductPickerResult } from '@/stores/productsData'
import { useProductsDataStore } from '@/stores/productsData'
import { formatCurrency } from '@/utils/helpers'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'select', product: ProductPickerResult): void
}>()

const productsStore = useProductsDataStore()
const { pickerProducts: products, loading, pickerTotalCount } = storeToRefs(productsStore)

const searchInput = ref('')

const PAGE_SIZE = 15
const LOAD_MORE_STEP = 10
const currentLimit = ref(PAGE_SIZE)
const loadingMore = ref(false)

const hasMore = ref(true)

function runSearch() {
  currentLimit.value = PAGE_SIZE
  productsStore.fetchProductPicker({ search: searchInput.value, limit: currentLimit.value })
    .then(() => {
      hasMore.value = products.value.length < pickerTotalCount.value
    })
}

async function loadMore() {
  loadingMore.value = true
  currentLimit.value += LOAD_MORE_STEP
  try {
    await productsStore.fetchProductPicker({ search: searchInput.value, limit: currentLimit.value })
    hasMore.value = products.value.length < pickerTotalCount.value
  } finally {
    loadingMore.value = false
  }
}

function onClear() {
  searchInput.value = ''
  runSearch()
}

function pick(product: ProductPickerResult) {
  emit('select', product)
  close()
}

function close() {
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      searchInput.value = ''
      runSearch()
    }
  }
)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="720"
    scrollable
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex justify-space-between align-center pa-4">
        <div class="d-flex align-center">
          <v-icon icon="mdi-database-search-outline" size="26" class="mr-2 text-primary" />
          <span class="text-subtitle-1 font-weight-bold">Select Product</span>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
      </v-card-title>

      <v-divider />

      <div class="pa-4 pb-2">
        <v-text-field
          v-model="searchInput"
          placeholder="Search by Product Name or SKU..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          autofocus
          clearable
          @keyup.enter="runSearch"
          @click:clear="onClear"
        />
      </div>

      <v-card-text style="max-height: 420px" class="pt-0">
        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />

        <div v-if="!loading && products.length === 0" class="text-center pa-8 text-medium-emphasis">
          No products found.
        </div>

        <v-list v-else lines="two" density="comfortable">
          <v-list-item
                v-for="product in products"
                :key="product.id"
                class="product-row rounded-lg mb-1"
                @click="pick(product)"
                >
                <template #title>
                    <span class="font-weight-bold">{{ product.product_name || 'Unnamed product' }}</span>
                </template>
                <template #subtitle>
                    <span class="text-caption">
                        {{ product.unit || 'unit' }} · {{ product.supplier_name || 'No supplier' }}
                        <span v-if="product.supplier_name && !product.supplier_is_active" class="text-error font-weight-bold">
                            ● Inactive</span>
                    </span>
                </template>
                <template #append>
                    <div class="text-right">
                    <div class="text-caption text-medium-emphasis">Cost</div>
                    <div class="text-body-2 font-weight-bold">
                        {{ formatCurrency(product.cost_price || 0) }}
                    </div>
                    </div>
                </template>
            </v-list-item>

          <div v-if="hasMore && !loading" class="text-center pa-2">
            <v-btn
              variant="text"
              color="green"
              size="small"
              :loading="loadingMore"
              @click="loadMore"
            >
              See more
            </v-btn>
          </div>
        </v-list>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.product-row {
  cursor: pointer;
  transition: background-color 0.1s ease;
}
.product-row:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.05);
}
</style>