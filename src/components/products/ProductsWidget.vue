<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { formatCurrency, formatMonthYear } from '@/utils/helpers'
import { useProductsWidget } from '@/components/products/composables/useProductsWidget.ts'
import { useTheme } from '@/stores/useTheme'
import { useLogsDataStore, type LogType } from '@/stores/logsData'
import ProductMobile from './mobile/ProductMobile.vue'
import ProductFormDialog from './dialogs/ProductFormDialog.vue'
import ProductDeleteDialog from './dialogs/ProductDeleteDialog.vue'
import StockStatusCards from '../products/StockStatusCards.vue'
import StockStatusDialog from './dialogs/StockStatusDialog.vue'
import ManageIgnoredItemsDialog from './dialogs/ManageIgnoredItemsDialog.vue'
import AddReservationDialog from './dialogs/AddReservationDialog.vue'
import LogsViewDialog from '@/pages/logs/dialogs/LogsViewDialog.vue'
import { useProductsDataStore } from '@/stores/productsData'
import { useAuthUserStore } from '@/stores/authUser'
import { useWarehousesDataStore } from '@/stores/warehouseData'
import { useCustomersDataStore } from '@/stores/customersData'
import { canViewSupplierName } from '@/utils/roleHelpers'
import PurchaseRequisitionDialog from '@/pages/purchasing/components/dialogs/PurchaseRequisitionDialog.vue'

const { mobile } = useDisplay()
const logsStore = useLogsDataStore()
const productsDataStore = useProductsDataStore()
const authUser = useAuthUserStore()
const customersStore = useCustomersDataStore()
const warehousesStore = useWarehousesDataStore()

// Fetch warehouses and customers on mount
warehousesStore.fetchWarehouses()
customersStore.fetchCustomers()

const {
  form,
  showDialog,
  showDeleteDialog,
  dialogMode,
  productForm,
  currentProduct,
  searchQuery,
  typeFilter,
  itemsPerPage,
  page,
  sortBy,
  expanded,
  headers,
  loading,
  totalProducts,
  products,
  rules,
  showStockDialog,
  stockDialogType,
  stockStatusCards,
  stockDialogProducts,
  activeStockCard,
  stockDialogSearchQuery,
  stockDialogPage,
  stockDialogItemsPerPage,
  stockDialogTotal,
  stockDialogLoading,
  stockDialogTotalPages,
  searchStockDialogProducts,
  handleStockDialogPageChange,
  openCreateDialog,
  openEditDialog,
  openDeleteDialog,
  closeDialog,
  closeDeleteDialog,
  handleSubmit,
  handleDelete,
  handleSearch,
  handleTableOptions,
  //Stock order for Purchaser
  isEditRestricted,
  isPurchaser,
  reorderRequestInfo,
  canRequestReorder, // NEW
  selectedReorderProductIds,
  toggleReorderSelection,
  showPurchaseRequisitionDialog,
  prefillItemsForDialog,
  reorderReasonMap,
  proceedCreatePRFromSelection,
  productIgnore,
  IGNORE_DURATIONS,
  // Warehouse filter
  selectedWarehouseId,
  setWarehouseFilter,
  getWarehouseStock,
  getWarehouseProductDetail,
  getProductReservations,
  expiryFilterValue,
  expiryFilterLabel,
  clearExpiryFilter,
  removeReservation,
  openAddReservationDialog,
  showAddReservationDialog,
  selectedProductForReservation,
} = useProductsWidget()

// Manage ignored items dialog
const showManageIgnoredDialog = ref(false)

// Build list of ignored products with their info by matching product IDs from allEligibleProducts
const ignoredProductEntries = computed(() => {
  const ignoredIds = productIgnore.activeIgnoredIdsArray.value
  return ignoredIds
    .map((id) => {
      const product = productsDataStore.products.find((p) => p.id === id)
      const info = productIgnore.getIgnoreInfo(id)
      return {
        id,
        product_name: product?.product_name ?? `Product #${id}`,
        sku: product?.sku ?? 'N/A',
        remainingMs: info?.remainingMs ?? 0,
        remainingLabel: info ? productIgnore.formatRemainingTime(info.remainingMs) : 'Expired',
      }
    })
    .filter((entry) => entry.remainingMs > 0)
})

// Static type filter options for the dropdown
const typeOptions = [
  { title: 'All', value: 'All' },
  { title: 'injectibles', value: 'injectibles' },
  { title: 'oral medicine', value: 'oral medicine' },
]

function handleStockCardClick(type: string) {
  stockDialogType.value = type as any
  showStockDialog.value = true
  productsDataStore.fetchReorderRequests(true) // Fetch all reorder requests, including resolved ones
}

async function requestReorder(product: any) {
  const reason = reorderReasonMap[stockDialogType.value]
  if (!reason) return
  const result = await productsDataStore.createReorderRequest({ product_id: product.id, reason })
  if (result?.success) await productsDataStore.fetchReorderRequests(true)
}
function onPRSubmitted() {}

// Logs dialog state
const showLogsDialog = ref(false)
const productLogs = ref<LogType[]>([])

const openLogsDialog = async (product: any) => {
  await logsStore.fetchLogs()

  productLogs.value = logsStore.logs.filter((log: LogType) => {
    const isProductRelated =
      (log.module?.toLowerCase().includes('stock') &&
        log.description?.toLowerCase().includes((product.product_name ?? '').toLowerCase())) ||
      (log.module?.toLowerCase().includes('product') &&
        log.description?.toLowerCase().includes((product.product_name ?? '').toLowerCase())) ||
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
    <div class="d-flex align-center ga-2 pa-3">
      <v-icon icon="mdi-package-variant" color="primary"></v-icon>
      <span class="text-h6 font-weight-bold mr-auto">Products</span>
      <template v-if="!mobile">
        <!-- Warehouse filter -->
        <v-select
          v-model="selectedWarehouseId"
          :items="[{ id: null, name: 'Main Warehouse' }, ...warehousesStore.warehouses]"
          item-title="name"
          item-value="id"
          label="Filter by warehouse..."
          prepend-inner-icon="mdi-warehouse"
          variant="outlined"
          density="compact"
          hide-details
          persistent-placeholder
          class="warehouse-filter"
          @update:model-value="(val) => setWarehouseFilter(val)"
        >
          <template #prepend-item>
            <v-list-item v-if="selectedWarehouseId" @click="setWarehouseFilter(null)">
              <v-list-item-title class="text-caption text-grey-darken-1"
                >Clear filter</v-list-item-title
              >
            </v-list-item>
            <v-divider class="mt-2"></v-divider>
          </template>
        </v-select>
        <v-text-field
          v-model="searchQuery"
          label="Search products..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          class="search-field"
          @keyup.enter="handleSearch"
        ></v-text-field>
        <v-text-field
          v-model="expiryFilterValue"
          type="month"
          label="Expiring as of..."
          prepend-inner-icon="mdi-calendar-month-outline"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          persistent-placeholder
          class="expiry-filter"
          @click:clear="clearExpiryFilter"
        ></v-text-field>
        <!--   <v-select
          v-model="typeFilter"
          :items="typeOptions"
          item-title="title"
          item-value="value"
          label="Filter by type..."
          prepend-inner-icon="mdi-tag-outline"
          variant="outlined"
          density="compact"
          hide-details
          persistent-placeholder
          class="type-filter"
        >
          <template #prepend-item>
            <v-list-item v-if="typeFilter !== 'All'" @click="typeFilter = 'All'">
              <v-list-item-title class="text-caption text-grey-darken-1">All</v-list-item-title>
            </v-list-item>
            <v-divider class="mt-2"></v-divider>
          </template>
        </v-select> -->
        <!-- I want to restrict this when the user is a warehouse user -->
        <v-btn
          color="primary"
          variant="elevated"
          @click="openCreateDialog"
          v-if="!isEditRestricted"
        >
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
    </div>

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
      <v-text-field
        v-model="expiryFilterValue"
        type="month"
        label="Expiring as of..."
        prepend-inner-icon="mdi-calendar-month-outline"
        variant="outlined"
        density="compact"
        hide-details
        clearable
        class="mt-2"
        @click:clear="clearExpiryFilter"
      ></v-text-field>
      <v-select
        v-model="typeFilter"
        :items="typeOptions"
        item-title="title"
        item-value="value"
        label="Filter by type..."
        prepend-inner-icon="mdi-tag-outline"
        variant="outlined"
        density="compact"
        hide-details
        clearable
        persistent-placeholder
        class="mt-2"
      ></v-select>
    </div>

    <!-- How to make this to the end of right part -->
    <div v-if="expiryFilterLabel" class="d-flex justify-end px-3 pt-2">
      <v-chip
        color="orange"
        variant="tonal"
        size="small"
        closable
        prepend-icon="mdi-calendar-month-outline"
        @click:close="clearExpiryFilter"
      >
        Filtering Expiring Soon: {{ expiryFilterLabel }}
      </v-chip>
    </div>

    <!-- Stock Status Cards -->
    <StockStatusCards :cards="stockStatusCards" @show-dialog="handleStockCardClick" />

    <!-- Manage Ignored Items link -->
    <div v-if="ignoredProductEntries.length > 0" class="d-flex justify-end px-3 pb-1">
      <v-btn
        variant="text"
        color="grey-darken-1"
        size="small"
        class="text-none"
        prepend-icon="mdi-bell-off-outline"
        @click="showManageIgnoredDialog = true"
      >
        {{ ignoredProductEntries.length }} ignored product{{
          ignoredProductEntries.length > 1 ? 's' : ''
        }}
      </v-btn>
    </div>

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
        <template #[`item.cost_price`]="{ value }">
          <span v-if="value != null">{{ formatCurrency(Number(value)) }}</span>
          <span v-else class="text-grey">-</span>
        </template>
        <template #[`item.unit`]="{ item }">
          <span>{{ item.unit || 'N/A' }}</span>
        </template>
        <template #[`item.current_stock`]="{ item }">
          <v-chip
            v-if="!selectedWarehouseId"
            :color="stockColor(item)"
            size="small"
            variant="outlined"
          >
            {{ Math.max(0, item.current_stock ?? 0) }}
          </v-chip>
          <v-chip
            v-else
            :color="(getWarehouseStock(item.id) ?? 0) <= 0 ? 'error' : 'success'"
            size="small"
            variant="outlined"
          >
            {{ Math.max(0, getWarehouseStock(item.id) ?? 0) }}
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
                      <div class="text-caption text-grey-darken-1">Product Name</div>
                      <div class="text-body-1 font-weight-medium">
                        {{ item.product_name || 'N/A' }}
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
                        {{
                          canViewSupplierName(authUser.userRole)
                            ? item.suppliers?.name || 'N/A'
                            : 'Restricted'
                        }}
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
                  <v-col cols="12" md="6" class="d-flex align-center py-2">
                    <v-icon icon="mdi-ruler" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Unit</div>
                      <div class="text-body-1 font-weight-medium">{{ item.unit || 'N/A' }}</div>
                    </div>
                  </v-col>

                  <!-- Warehouse details when a warehouse filter is active -->
                  <template v-if="selectedWarehouseId && getWarehouseProductDetail(item.id)">
                    <v-col cols="12" class="py-2">
                      <v-divider class="mb-2"></v-divider>
                      <div class="text-subtitle-2 font-weight-bold text-grey-darken-1 mb-2">
                        <v-icon icon="mdi-warehouse" size="18" class="mr-1"></v-icon>
                        Warehouse Stock Details
                      </div>
                    </v-col>
                    <v-col cols="12" md="4" class="d-flex align-center py-2">
                      <v-icon
                        icon="mdi-package-variant-closed"
                        color="primary"
                        class="mr-3"
                      ></v-icon>
                      <div>
                        <div class="text-caption text-grey-darken-1">Total Qty</div>
                        <div class="text-body-1 font-weight-medium">
                          {{ Math.max(0, getWarehouseProductDetail(item.id)?.total_qty ?? 0) }}
                        </div>
                      </div>
                    </v-col>
                    <v-col cols="12" md="4" class="d-flex align-center py-2">
                      <v-icon icon="mdi-check-circle-outline" color="success" class="mr-3"></v-icon>
                      <div>
                        <div class="text-caption text-grey-darken-1">Available Stock</div>
                        <div class="text-body-1 font-weight-medium">
                          {{ Math.max(0, getWarehouseStock(item.id) ?? 0) }}
                        </div>
                      </div>
                    </v-col>
                    <v-col cols="12" md="4" class="d-flex align-center py-2">
                      <v-btn
                        icon="mdi-plus"
                        size="small"
                        variant="outlined"
                        color="primary"
                        @click="openAddReservationDialog(item)"
                      >
                        <v-icon size="16">mdi-bookmark-plus</v-icon>
                        <v-tooltip activator="parent" location="top">Add Reservation</v-tooltip>
                      </v-btn>
                    </v-col>
                    <v-col cols="12" class="py-2">
                      <v-divider class="mb-2"></v-divider>
                      <div class="text-subtitle-2 font-weight-bold text-grey-darken-1 mb-2">
                        <v-icon icon="mdi-bookmark-multiple" size="18" class="mr-1"></v-icon>
                        Reserved to Customers
                      </div>
                      <template v-if="getProductReservations(item.id).length > 0">
                        <v-list density="compact" class="pa-0" lines="one">
                          <v-list-item
                            v-for="reservation in getProductReservations(item.id)"
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
                              <v-chip
                                size="x-small"
                                color="warning"
                                variant="outlined"
                                class="mr-2"
                              >
                                {{ reservation.reserved_qty }}
                              </v-chip>
                              <v-btn
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
                    </v-col>
                  </template>
                </v-row>
              </div>
            </td>
          </tr>
        </template>
        <template #[`item.actions`]="{ item }">
          <div class="d-flex ga-1">
            <v-btn
              v-if="!isEditRestricted"
              icon="mdi-delete"
              size="small"
              variant="text"
              color="error"
              @click="openDeleteDialog(item)"
            ></v-btn>
            <v-btn
              icon="mdi-pencil"
              size="small"
              variant="text"
              color="info"
              @click="openEditDialog(item)"
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
        :is-edit-restricted="isEditRestricted"
        :selected-warehouse-id="selectedWarehouseId"
        :get-warehouse-stock="getWarehouseStock"
        :get-warehouse-product-detail="getWarehouseProductDetail"
        :get-product-reservations="getProductReservations"
        :open-add-reservation-dialog="openAddReservationDialog"
        :remove-reservation="removeReservation"
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
    :is-edit-restricted="isEditRestricted"
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

  <PurchaseRequisitionDialog
    v-model="showPurchaseRequisitionDialog"
    :prefill-items="prefillItemsForDialog"
    @submitted="onPRSubmitted"
  />

  <!-- Logs View Dialog -->
  <LogsViewDialog v-model="showLogsDialog" :logs="productLogs" @close="closeLogsDialog" />

  <!-- Stock Status Dialog (separated component) -->
  <StockStatusDialog
    v-model="showStockDialog"
    :products="stockDialogProducts"
    :active-card="activeStockCard"
    :stock-dialog-type="stockDialogType"
    :is-purchaser="isPurchaser"
    :selected-reorder-product-ids="selectedReorderProductIds"
    :reorder-request-info="reorderRequestInfo"
    :can-request-reorder="canRequestReorder"
    :reorder-reason-map="reorderReasonMap"
    :search-query="stockDialogSearchQuery"
    :page="stockDialogPage"
    :items-per-page="stockDialogItemsPerPage"
    :total="stockDialogTotal"
    :loading="stockDialogLoading"
    :total-pages="stockDialogTotalPages"
    @update:search-query="stockDialogSearchQuery = $event"
    @update:page="handleStockDialogPageChange"
    @search="searchStockDialogProducts"
    @edit-product="
      (p) => {
        openEditDialog(p)
        showStockDialog = false
      }
    "
    @toggle-reorder="toggleReorderSelection"
    @request-reorder="requestReorder"
    @create-pr="proceedCreatePRFromSelection"
  />

  <!-- Manage Ignored Items Dialog (separated component) -->
  <ManageIgnoredItemsDialog
    v-model="showManageIgnoredDialog"
    :ignored-product-entries="ignoredProductEntries"
  />

  <!-- Add Reservation Dialog -->
  <AddReservationDialog
    v-model="showAddReservationDialog"
    :selected-product="selectedProductForReservation"
    :selected-warehouse-id="selectedWarehouseId"
    @reservation-added="selectedWarehouseId && setWarehouseFilter(selectedWarehouseId)"
  />
</template>

<style scoped>
.search-field {
  min-width: 200px;
  max-width: 280px;
  width: 100%;
}
.warehouse-filter {
  min-width: 200px;
  max-width: 280px;
  width: 100%;
}
.expiry-filter {
  min-width: 200px;
  max-width: 280px;
  width: 100%;
}
.type-filter {
  min-width: 200px;
  max-width: 280px;
  width: 100%;
}
</style>
