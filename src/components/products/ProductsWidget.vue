<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import { formatCurrency } from '@/utils/helpers'
import { useProductsWidget } from '@/components/products/composables/useProductsWidget.ts'
import { useTheme } from '@/stores/useTheme'
import ProductMobile from './mobile/ProductMobile.vue'
import ProductFormDialog from './dialogs/ProductFormDialog.vue'
import ProductDeleteDialog from './dialogs/ProductDeleteDialog.vue'
import StockStatusCards from '../products/StockStatusCards.vue'

const { mobile } = useDisplay()
const {
  form,
  showDialog,
  showDeleteDialog,
  dialogMode,
  productForm,
  currentProduct,
  searchQuery,
  itemsPerPage,
  page,
  sortBy,
  expanded,
  headers,
  loading,
  totalProducts,
  lowStockProducts,
  products,
  allOutOfStockCount,
  allLowStockCount,
  rules,
  showStockDialog,
  stockDialogType,
  openCreateDialog,
  openEditDialog,
  openDeleteDialog,
  closeDialog,
  closeDeleteDialog,
  handleSubmit,
  handleDelete,
  handleSearch,
  handleTableOptions,
} = useProductsWidget()

function handleStockCardClick(type: 'out-of-stock' | 'low-stock') {
  stockDialogType.value = type
  showStockDialog.value = true
}

const { getCurrentTheme } = useTheme()
const isDark = computed<'light' | 'dark'>(() => getCurrentTheme())

// Theme-aware stock color logic
function stockColor(item: any) {
  const stock = item.current_stock ?? 0
  const isOutOfStock = stock <= 0
  const isLowStock = item.reorder_level && stock <= item.reorder_level

  if (isOutOfStock) return 'error'
  if (isLowStock) return 'warning'
  return isDark.value === 'dark' ? 'grey-lighten-2' : 'grey-darken-3'
}
</script>

<template>
  <v-card>
    <!-- Toolbar -->
    <v-card-title class="d-flex align-center flex-wrap ga-2 pa-3">
      <v-icon icon="mdi-package-variant" class="mr-1" color="primary"></v-icon>
      <span class="text-h6 font-weight-bold">Products</span>
      <v-spacer></v-spacer>
      <template v-if="!mobile">
        <v-text-field
          v-model="searchQuery"
          label="Search products..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="comfortable"
          hide-details
          class="max-width-300"
          @keyup.enter="handleSearch"
        ></v-text-field>
        <v-btn color="primary" variant="elevated" @click="openCreateDialog">
          <v-icon icon="mdi-plus" class="mr-1"></v-icon>
          Add Product
        </v-btn>
      </template>
      <template v-else>
        <v-btn
          icon="mdi-plus"
          color="primary"
          variant="elevated"
          size="small"
          @click="openCreateDialog"
        ></v-btn>
      </template>
    </v-card-title>

    <!-- Mobile search -->
    <div v-if="mobile" class="px-3 pb-2">
      <v-text-field
        v-model="searchQuery"
        label="Search products..."
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        hide-details
        @keyup.enter="handleSearch"
      ></v-text-field>
    </div>

    <!-- Low stock alert -->
    <div class="px-3 pt-2">
      <v-expansion-panels v-if="lowStockProducts.length > 0">
        <v-expansion-panel bg-color="warning" elevation="0" rounded="lg">
          <v-expansion-panel-title class="py-2">
            <div class="d-flex align-center ga-2">
              <v-icon icon="mdi-alert-circle-outline" color="primary" size="small"></v-icon>
              <span class="text-body-2 font-weight-medium">
                Low Stock Alert —
                <strong
                  >{{ lowStockProducts.length }} product{{
                    lowStockProducts.length > 1 ? 's' : ''
                  }}</strong
                >
                need{{ lowStockProducts.length > 1 ? '' : 's' }} to be reordered
              </span>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text class="pa-0">
            <v-list density="compact" bg-color="transparent">
              <v-list-item
                v-for="p in lowStockProducts"
                :key="p.id"
                :prepend-icon="(p.current_stock ?? 0) <= 0 ? 'mdi-close-circle' : 'mdi-alert'"
                density="compact"
              >
                <v-list-item-title class="text-body-2">{{ p.product_name }}</v-list-item-title>
                <v-list-item-subtitle class="text-caption">
                  {{ p.current_stock ?? 0 }} units left · reorder at {{ p.reorder_level }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>

    <!-- Stock Status Cards -->
    <StockStatusCards
      :out-of-stock-count="allOutOfStockCount"
      :low-stock-count="allLowStockCount"
      @show-dialog="handleStockCardClick"
    />

    <v-divider class="mt-3"></v-divider>

    <v-card-text class="pa-0">
      <!-- Desktop table -->
      <v-data-table-server
        v-if="!mobile"
        v-model:items-per-page="itemsPerPage"
        :items-per-page-options="[5, 10, 15, 25, 50, 100]"
        v-model:page="page"
        v-model:sort-by="sortBy"
        v-model:expanded="expanded"
        :headers="headers"
        :items="products"
        :items-length="totalProducts"
        :loading="loading"
        loading-text="Loading products..."
        hover
        density="comfortable"
        show-expand
        @update:options="handleTableOptions"
      >
        <template #[`item.selling_price`]="{ value }">
          <span v-if="value != null">{{ formatCurrency(Number(value)) }}</span>
          <span v-else class="text-grey">-</span>
        </template>
        <template #[`item.cost_price`]="{ value }">
          <span v-if="value != null">{{ formatCurrency(Number(value)) }}</span>
          <span v-else class="text-grey">-</span>
        </template>
        <template #[`item.current_stock`]="{ item }">
          <v-chip :color="stockColor(item)" size="small" variant="outlined">
            {{ item.current_stock ?? 0 }}
          </v-chip>
        </template>
        <template #[`expanded-row`]="{ item }">
          <tr>
            <td :colspan="headers.length" class="pa-0 border-0">
              <div class="pa-4">
                <v-row class="ma-0">
                  <v-col cols="12" md="6" class="d-flex align-center py-2">
                    <v-icon icon="mdi-label" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Generic Name</div>
                      <div class="text-body-1 font-weight-medium">
                        {{ item.generic_name || 'N/A' }}
                      </div>
                    </div>
                  </v-col>
                  <v-col cols="12" md="6" class="d-flex align-center py-2">
                    <v-icon icon="mdi-barcode" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Barcode</div>
                      <div class="text-body-1 font-weight-medium">{{ item.barcode || 'N/A' }}</div>
                    </div>
                  </v-col>
                  <v-col cols="12" md="6" class="d-flex align-center py-2">
                    <v-icon icon="mdi-truck-delivery" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Supplier</div>
                      <div class="text-body-1 font-weight-medium">
                        {{ item.suppliers?.name || 'N/A' }}
                      </div>
                    </div>
                  </v-col>
                  <v-col cols="12" md="6" class="d-flex align-center py-2">
                    <v-icon icon="mdi-calendar-clock" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Status</div>
                      <div class="text-body-1 font-weight-medium">{{ item.status || 'N/A' }}</div>
                    </div>
                  </v-col>
                </v-row>
              </div>
            </td>
          </tr>
        </template>
        <template #[`item.actions`]="{ item }">
          <div class="d-flex ga-1">
            <v-btn
              icon="mdi-pencil"
              size="small"
              variant="text"
              color="info"
              @click="openEditDialog(item)"
            ></v-btn>
            <v-btn
              icon="mdi-delete"
              size="small"
              variant="text"
              color="error"
              @click="openDeleteDialog(item)"
            ></v-btn>
          </div>
        </template>
        <template #[`no-data`]>
          <div class="text-center py-8">
            <v-icon icon="mdi-package-variant-closed" size="48" color="grey"></v-icon>
            <p class="text-grey mt-2">No products found</p>
          </div>
        </template>
      </v-data-table-server>

      <!-- Mobile card list -->
      <ProductMobile
        v-else
        :products="products"
        :loading="loading"
        :page="page"
        :items-per-page="itemsPerPage"
        :total-products="totalProducts"
        :sort-by="sortBy"
        @edit="openEditDialog"
        @delete="openDeleteDialog"
        @update:page="page = $event"
        @update:options="handleTableOptions"
      />
    </v-card-text>
  </v-card>

  <ProductFormDialog
    v-model="showDialog"
    v-model:form="form"
    :dialog-mode="dialogMode"
    :product-form="productForm"
    :loading="loading"
    :mobile="mobile"
    :rules="rules"
    @submit="handleSubmit"
    @close="closeDialog"
  />

  <ProductDeleteDialog
    v-model="showDeleteDialog"
    :current-product="currentProduct"
    :loading="loading"
    :mobile="mobile"
    @confirm="handleDelete"
    @close="closeDeleteDialog"
  />

  <!-- Stock Status Dialog (placeholder for future development) -->
  <v-dialog v-model="showStockDialog" max-width="500">
    <v-card>
      <v-card-title class="d-flex align-center pa-4">
        <v-icon
          :icon="stockDialogType === 'out-of-stock' ? 'mdi-close-circle-outline' : 'mdi-alert-outline'"
          :color="stockDialogType === 'out-of-stock' ? 'error' : 'warning'"
          class="mr-2"
          size="28"
        ></v-icon>
        <span class="text-h6 font-weight-bold">
          {{ stockDialogType === 'out-of-stock' ? 'Out of Stock' : 'Low Stock' }}
        </span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="showStockDialog = false"></v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text class="pa-4 text-body-1 text-medium-emphasis">
        <p>This feature is under development.</p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.max-width-300 {
  max-width: 300px;
}
</style>
