<script setup lang="ts">
import type { ProductType } from '@/stores/productsData'

const props = defineProps<{
  products: ProductType[]
  loading: boolean
  page: number
  itemsPerPage: number
  totalProducts: number
  sortBy: any[]
}>()

const emit = defineEmits<{
  'edit': [product: ProductType]
  'delete': [product: ProductType]
  'update:page': [page: number]
  'update:options': [options: any]
}>()

function prevPage() {
  const newPage = props.page - 1
  emit('update:page', newPage)
  emit('update:options', { page: newPage, itemsPerPage: props.itemsPerPage, sortBy: props.sortBy })
}

function nextPage() {
  const newPage = props.page + 1
  emit('update:page', newPage)
  emit('update:options', { page: newPage, itemsPerPage: props.itemsPerPage, sortBy: props.sortBy })
}
</script>

<template>
  <div>
    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary"></v-progress-circular>
    </div>

    <div v-else-if="products.length === 0" class="text-center py-8">
      <v-icon icon="mdi-package-variant-closed" size="48" color="grey"></v-icon>
      <p class="text-grey mt-2">No products found</p>
    </div>

    <template v-else>
      <v-card
        v-for="product in products"
        :key="product.id"
        class="ma-3"
        variant="outlined"
        rounded="lg"
      >
        <v-card-item>
          <template #prepend>
            <v-chip
              :color="
                (product.actual_count ?? 0) <= 0 ? 'error'
                : product.reorder_level && (product.actual_count ?? 0) <= product.reorder_level ? 'primary'
                : 'black'
              "
              size="small"
              variant="outlined"
              class="mr-2"
            >
              {{ product.actual_count ?? 0 }}
            </v-chip>
          </template>

          <v-card-title class="text-body-1 font-weight-bold pa-0">
            {{ product.product_name }}
          </v-card-title>
          <v-card-subtitle class="text-caption pa-0">
            SKU: {{ product.sku || '—' }} · Batch: {{ product.batch_no || '—' }}
          </v-card-subtitle>

          <template #append>
            <div class="d-flex ga-1">
              <v-btn icon="mdi-pencil" size="small" variant="text" color="info" @click="emit('edit', product)"></v-btn>
              <v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="emit('delete', product)"></v-btn>
            </div>
          </template>
        </v-card-item>

        <v-divider></v-divider>

        <v-card-text class="pt-2 pb-3">
          <v-row dense>
            <v-col cols="6">
              <div class="text-caption text-grey-darken-1">Selling Price</div>
              <div class="text-body-2 font-weight-medium">
                {{ product.selling_price != null ? `$${Number(product.selling_price).toFixed(2)}` : '—' }}
              </div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-grey-darken-1">Cost Price</div>
              <div class="text-body-2 font-weight-medium">
                {{ product.cost_price != null ? `$${Number(product.cost_price).toFixed(2)}` : '—' }}
              </div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-grey-darken-1">Expiry Date</div>
              <div class="text-body-2 font-weight-medium">{{ product.expiry_date || '—' }}</div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-grey-darken-1">Supplier</div>
              <div class="text-body-2 font-weight-medium">{{ product.suppliers?.name || '—' }}</div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Pagination -->
      <div class="d-flex justify-center align-center pa-3 ga-2">
        <v-btn
          icon="mdi-chevron-left"
          size="small"
          variant="text"
          :disabled="page <= 1"
          @click="prevPage"
        ></v-btn>
        <span class="text-body-2 text-grey">Page {{ page }}</span>
        <v-btn
          icon="mdi-chevron-right"
          size="small"
          variant="text"
          :disabled="page * itemsPerPage >= totalProducts"
          @click="nextPage"
        ></v-btn>
      </div>
    </template>
  </div>
</template>