<script setup lang="ts">
import { ref } from 'vue'
import type { ProductType } from '@/stores/productsData'
import { formatCurrency } from '@/utils/helpers'

const props = defineProps<{
  products: ProductType[]
  loading: boolean
  page: number
  itemsPerPage: number
  totalProducts: number
  sortBy: any[]
  isEditRestricted?: boolean
  selectedWarehouseId?: number | null
  getWarehouseStock?: (productId: number) => number | null
  getWarehouseProductDetail?: (productId: number) => { total_qty: number } | null
  getProductReservations?: (productId: number) => { id: number; customer_name: string; reserved_qty: number }[]
  openAddReservationDialog?: (product: ProductType) => void
  removeReservation?: (reservationId: number) => void
}>()

const emit = defineEmits<{
  'edit': [product: ProductType]
  'delete': [product: ProductType]
  'logs': [product: ProductType]
  'update:page': [page: number]
  'update:options': [options: any]
}>()

const expandedProductId = ref<number | null>(null)

function toggleExpand(productId: number) {
  expandedProductId.value = expandedProductId.value === productId ? null : productId
}

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
                (product.current_stock ?? 0) <= 0 ? 'error'
                : product.reorder_level && (product.current_stock ?? 0) <= product.reorder_level ? 'primary'
                : 'black'
              "
              size="small"
              variant="outlined"
              class="mr-2"
            >
              {{ Math.max(0, product.current_stock ?? 0) }}
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
              <v-btn v-if="!isEditRestricted" icon="mdi-delete" size="small" variant="text" color="error" @click="emit('delete', product)"></v-btn>
              <v-btn icon="mdi-pencil" size="small" variant="text" color="info" @click="emit('edit', product)"></v-btn>
              <v-btn
                icon="mdi-history"
                size="small"
                variant="outlined"
                color="primary"
                @click="emit('logs', product)"
              >
                <v-icon size="16">mdi-text-box-search-outline</v-icon>
                <v-tooltip activator="parent" location="top">View transaction history</v-tooltip>
              </v-btn>
            </div>
          </template>
        </v-card-item>

        <v-divider></v-divider>

        <v-card-text class="pt-2 pb-1">
          <v-row dense>
            <v-col cols="6">
              <div class="text-caption text-grey-darken-1">Selling Price</div>
              <div class="text-body-2 font-weight-medium">
                {{ product.selling_price != null ? formatCurrency(Number(product.selling_price)) : '—' }}
              </div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-grey-darken-1">Cost Price</div>
              <div class="text-body-2 font-weight-medium">
                {{ product.cost_price != null ? formatCurrency(Number(product.cost_price)) : '—' }}
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

          <!-- Expand toggle button -->
          <div v-if="selectedWarehouseId" class="d-flex justify-center mt-2">
            <v-btn
              variant="text"
              size="small"
              color="primary"
              class="text-none"
              :prepend-icon="expandedProductId === product.id ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              @click="toggleExpand(product.id)"
            >
              {{ expandedProductId === product.id ? 'Hide warehouse details' : 'Show warehouse details' }}
            </v-btn>
          </div>
        </v-card-text>

        <!-- Warehouse details (expanded) -->
        <template v-if="selectedWarehouseId && expandedProductId === product.id && getWarehouseProductDetail && getWarehouseProductDetail(product.id)">
          <v-divider></v-divider>
          <v-card-text class="pt-2 pb-3">
            <div class="text-subtitle-2 font-weight-bold text-grey-darken-1 mb-2">
              <v-icon icon="mdi-warehouse" size="18" class="mr-1"></v-icon>
              Warehouse Stock Details
            </div>
            <v-row dense>
              <v-col cols="6">
                <div class="text-caption text-grey-darken-1">Total Qty</div>
                <div class="text-body-2 font-weight-medium">
                  {{ Math.max(0, getWarehouseProductDetail(product.id)?.total_qty ?? 0) }}
                </div>
              </v-col>
              <v-col cols="6">
                <div class="text-caption text-grey-darken-1">Available Stock</div>
                <div class="text-body-2 font-weight-medium">
                  {{ Math.max(0, getWarehouseStock?.(product.id) ?? 0) }}
                </div>
              </v-col>
            </v-row>

            <!-- Add reservation button -->
            <div class="d-flex justify-start mt-1">
              <v-btn
                variant="text"
                size="small"
                color="primary"
                class="text-none"
                prepend-icon="mdi-bookmark-plus"
                @click="openAddReservationDialog?.(product)"
              >
                Add Reservation
              </v-btn>
            </div>

            <!-- Reservations list -->
            <div class="mt-2">
              <div class="text-subtitle-2 font-weight-bold text-grey-darken-1 mb-1">
                <v-icon icon="mdi-bookmark-multiple" size="18" class="mr-1"></v-icon>
                Reserved to Customers
              </div>
              <template v-if="getProductReservations && getProductReservations(product.id)?.length > 0">
                <v-list density="compact" class="pa-0" lines="one">
                  <v-list-item
                    v-for="reservation in (getProductReservations(product.id) ?? [])"
                    :key="reservation.id"
                    class="px-0"
                  >
                    <template #prepend>
                      <v-icon icon="mdi-account" color="warning" size="20"></v-icon>
                    </template>
                    <v-list-item-title class="text-body-2">
                      {{ reservation.customer_name }}
                    </v-list-item-title>
                    <template #append>
                      <v-chip size="x-small" color="warning" variant="outlined" class="mr-2">
                        {{ reservation.reserved_qty }}
                      </v-chip>
                      <v-btn
                        v-if="removeReservation"
                        icon="mdi-delete"
                        size="x-small"
                        variant="text"
                        color="error"
                        @click.stop="removeReservation(reservation.id)"
                      ></v-btn>
                    </template>
                  </v-list-item>
                </v-list>
              </template>
              <div v-else class="text-body-2 text-grey">
                No reservations for this product
              </div>
            </div>
          </v-card-text>
        </template>
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
