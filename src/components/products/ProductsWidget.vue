<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { formatCurrency, parseMonthYear, formatMonthYear } from '@/utils/helpers'
import { useProductsWidget } from '@/components/products/composables/useProductsWidget.ts'
import { useTheme } from '@/stores/useTheme'
import { useLogsDataStore, type LogType } from '@/stores/logsData'
import ProductMobile from './mobile/ProductMobile.vue'
import ProductFormDialog from './dialogs/ProductFormDialog.vue'
import ProductDeleteDialog from './dialogs/ProductDeleteDialog.vue'
import StockStatusCards from '../products/StockStatusCards.vue'
import LogsViewDialog from '@/pages/logs/dialogs/LogsViewDialog.vue'
import { useRouter } from 'vue-router'
import { useProductsDataStore } from '@/stores/productsData'
import { useAuthUserStore } from '@/stores/authUser'
import { canViewSupplierName } from '@/utils/roleHelpers'

const { mobile } = useDisplay()
const router = useRouter()
const logsStore = useLogsDataStore()
const productsDataStore = useProductsDataStore()
const authUser = useAuthUserStore()

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
  stockStatusCards,
  stockDialogProducts,
  activeStockCard,
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

function handleStockCardClick(type: string) {
  stockDialogType.value = type as any
  showStockDialog.value = true
  productsDataStore.fetchReorderRequests(true) // Fetch all reorder requests, including resolved ones
}

const reorderReasonMap: Record<string, 'reorder_outofstock' | 'reorder_lowstock' | 'reorder_expiring' | 'reorder_expired'> = {
  'out-of-stock':  'reorder_outofstock',
  'low-stock':     'reorder_lowstock',
  'expiring-soon': 'reorder_expiring',
  'expired':       'reorder_expired',
}

// Track which products have been reorder-requested this session
const reorderRequestedIds = computed(() => {
  const map = new Map<number, string>()
  for (const r of productsDataStore.reorderRequests) {
    if (r.product?.id != null) map.set(r.product.id, r.status)
  }
  return map
})

async function requestReorder(product: any) {
  const reason = reorderReasonMap[stockDialogType.value]
  if (!reason) return
  const result = await productsDataStore.createReorderRequest({ product_id: product.id, reason })
  if (result?.success) {
    await productsDataStore.fetchReorderRequests() // NEW — refresh so the computed picks up the new pending row
  }
}

// Logs dialog state
const showLogsDialog = ref(false)
const productLogs = ref<LogType[]>([])

const openLogsDialog = async (product: any) => {
  await logsStore.fetchLogs()

  productLogs.value = logsStore.logs.filter((log: LogType) => {
    const isProductRelated =
      (log.module?.toLowerCase().includes('stock') && log.description?.toLowerCase().includes((product.product_name ?? '').toLowerCase())) ||
      (log.module?.toLowerCase().includes('product') && log.description?.toLowerCase().includes((product.product_name ?? '').toLowerCase())) ||
      log.description?.toLowerCase().includes((product.sku ?? '').toLowerCase())
    return isProductRelated
  })
  showLogsDialog.value = true
}

const closeLogsDialog = () => {
  showLogsDialog.value = false
  productLogs.value = []
}

const { getCurrentTheme } = useTheme()
const isDark = computed<'light' | 'dark'>(() => getCurrentTheme())

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

    <!-- Stock Status Cards -->
    <StockStatusCards
      :cards="stockStatusCards"
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
        <template #[`item.unit`]="{ item }">
          <span>{{ item.unit || 'N/A' }}</span>
        </template>
        <template #[`item.current_stock`]="{ item }">
          <v-chip :color="stockColor(item)" size="small" variant="outlined">
            {{ item.current_stock ?? 0 }}
          </v-chip>
        </template>
        <template #[`item.expiry_date`]="{ value }">
          <span v-if="value">{{ formatMonthYear(value) }}</span>
          <span v-else class="text-grey">-</span>
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
                        {{ canViewSupplierName(authUser.userRole) ? (item.suppliers?.name || 'N/A') : 'Restricted' }}
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
            <v-btn
              icon="mdi-history"
              size="small"
              variant="outlined"
              color="primary"
              @click="openLogsDialog(item)"
            >
              <v-icon size="16">mdi-text-box-search-outline</v-icon>
              <v-tooltip activator="parent" location="top">View transaction history</v-tooltip>
            </v-btn>
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
        @logs="openLogsDialog"
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

  <!-- Logs View Dialog -->
  <LogsViewDialog
    v-model="showLogsDialog"
    :logs="productLogs"
    @close="closeLogsDialog"
  />

  <!-- Stock Status Dialog -->
  <v-dialog v-model="showStockDialog" max-width="600">
    <v-card>
      <v-card-title class="d-flex align-center pa-4">
        <v-icon
          :icon="activeStockCard?.icon"
          :color="activeStockCard?.color"
          class="mr-2"
          size="28"
        ></v-icon>
        <span class="text-h6 font-weight-bold">{{ activeStockCard?.label }}</span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="showStockDialog = false"></v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text class="pa-0" style="max-height: 400px; overflow-y: auto;">
        <v-list v-if="stockDialogProducts.length > 0" density="comfortable">
          <v-list-item
            v-for="p in stockDialogProducts"
            :key="p.id"
            @click="openEditDialog(p); showStockDialog = false"
          >
            <v-list-item-title class="font-weight-medium">
              {{ p.product_name }}
            </v-list-item-title>
            <v-list-item-subtitle>
              <template v-if="stockDialogType === 'out-of-stock' || stockDialogType === 'low-stock'">
                Stock: {{ p.current_stock ?? 0 }}
                <span v-if="p.reorder_level != null"> · reorder at {{ p.reorder_level }}</span>
              </template>
              <template v-else-if="stockDialogType === 'no-reorder-level'">
                Current stock: {{ p.current_stock ?? 0 }} units
              </template>
              <template v-else-if="stockDialogType === 'expiring-soon' || stockDialogType === 'expired'">
                Expiry: {{ p.expiry_date || 'N/A' }}
              </template>
            </v-list-item-subtitle>

               <template #append>
                <div class="d-flex align-center ga-2">
                  <v-chip size="small" variant="outlined">{{ p.sku || 'No SKU' }}</v-chip>
                    <v-btn
                      v-if="stockDialogType !== 'no-reorder-level' && !reorderRequestedIds.has(p.id)"
                      size="small"
                      variant="outlined"
                      color="primary"
                      prepend-icon="mdi-cart-plus"
                      class="text-none"
                      @click.stop="requestReorder(p)"
                    >
                    Reorder
                  </v-btn>
                  <v-chip
                    v-else-if="reorderRequestedIds.get(p.id) === 'pending'"
                    size="small"
                    color="green"
                    variant="tonal"
                    class="font-weight-medium"
                  >
                    <v-icon start size="14">mdi-check-circle</v-icon>
                    Pending
                  </v-chip>
                      <v-chip
                    v-else-if="reorderRequestedIds.get(p.id) === 'approved'"
                    size="small"
                    color="blue"
                    variant="tonal"
                    class="font-weight-medium"
                  >
                    <v-icon start size="14">mdi-truck-delivery-outline</v-icon>
                    Awaiting Stock
                  </v-chip>
                </div>
              </template>
          </v-list-item>
        </v-list>
        <div v-else class="text-center py-8">
          <v-icon icon="mdi-check-circle-outline" size="40" color="success"></v-icon>
          <p class="text-grey mt-2">No products in this category</p>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.max-width-300 {
  max-width: 300px;
}
</style>
