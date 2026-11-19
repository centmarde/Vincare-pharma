<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { useToast } from 'vue-toastification'
import { formatCurrency, formatMonthYear, isBlank, NOT_SET } from '@/utils/helpers'
import { useProductsWidget } from '@/components/products/composables/useProductsWidget.ts'
import { useTheme } from '@/stores/useTheme'
import { useLogsDataStore, type LogType } from '@/stores/logsData'
import ProductMobile from './mobile/ProductMobile.vue'
import WarehouseStockDetails from './WarehouseStockDetails.vue'
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
import ProductsWidgetPrint from './print/ProductsWidgetPrint.vue'
import ExportDialogLoading from './dialogs/ExportDialogLoading.vue'
import type { ProductType } from '@/stores/productsData'

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
  canDispose,
  disposalRequestInfo,
  requestDisposal,
  updateReorderLevel,
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
  getMainWarehouseStock,
  expiryFilterValue,
  expiryFilterLabel,
  clearExpiryFilter,
  removeReservation,
  openAddReservationDialog,
  showAddReservationDialog,
  selectedProductForReservation,
  fetchMainWarehouseReservations,
  fetchAllFilteredProducts,
} = useProductsWidget()

// Manage ignored items dialog
const showManageIgnoredDialog = ref(false)

// Export / print state (CSV + PDF) — i-export ang tanang produkto nga mo-match
// sa current filters (search, type, expiry, warehouse), dili lang ang page.
const showPrintDialog = ref(false)
const printProducts = ref<ProductType[]>([])
const exportLoading = ref(false)
const toast = useToast()

// Human-readable warehouse name para ma-ipakita sa print report header.
const selectedWarehouseName = computed(() => {
  const w = warehousesStore.warehouses.find((x) => x.id === selectedWarehouseId.value)
  return w?.name ?? null
})

// Ang stock nga makita sa table: warehouse-specific kung naka-filter sa
// warehouse, kon dili ang main-warehouse available stock.
function resolvedStock(item: ProductType): number {
  return selectedWarehouseId.value ? getWarehouseStock(item.id) ?? 0 : getMainWarehouseStock(item)
}

// I-format ang reservations (expanded-row detail) ngadto sa usa ka cell:
// "CustomerName (qty); CustomerName (qty)". Blank kung walay reservation.
function formatReservations(item: ProductType): string {
  return getProductReservations(item.id)
    .map((r) => `${r.customer_name} (${r.reserved_qty})`)
    .join('; ')
}

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
  { title: 'dental', value: 'dental' },
  { title: 'laboratory supplies', value: 'laboratory supplies' },
  { title: 'medical supplies', value: 'medical supplies' },
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
  if (result?.success) {
    await productsDataStore.fetchReorderRequests(true)

    // Log the product reorder with its identifying details so the action is
    // traceable in the logs view (module = products / action = reorder_product).
    try {
      await logsStore.createLog({
        action: 'reorder_product',
        module: 'products',
        description: [
          `Reorder flagged for product "${product.product_name ?? 'N/A'}"`,
          `SKU: ${product.sku ?? 'N/A'}`,
          `Batch: ${product.batch_no ?? 'N/A'}`,
          `Stock: ${product.current_stock ?? 0}`,
          `Reorder level: ${product.reorder_level ?? 'N/A'}`,
          `Reason: ${reason.replace('reorder_', '')}`,
        ].join(' | '),
      })
    } catch (err) {
      console.error('[ProductsWidget] Failed to log reorder_product:', err)
    }
  }
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

function stockColor(item: any, stock: number) {
  const isOutOfStock = stock <= 0
  const isLowStock = item.reorder_level && stock <= item.reorder_level

  if (isOutOfStock) return 'error'
  if (isLowStock) return 'warning'
  return isDark.value === 'dark' ? 'grey-lighten-2' : 'grey-darken-3'
}

// ── Export (CSV) ────────────────────────────────────────────────────────────
// Straight CSV sa tanang filtered produkto, RFC 4180 nga escape (dobli ang
// quotes inside a field). Gisunod ni ang StatementOfAccounts exportCsv pattern.
async function exportCsv() {
  if (exportLoading.value) return
  exportLoading.value = true
  // fetchAllFilteredProducts() na ang mo-handle sa tanang Supabase errors
  // mismo (mo-return og [] kung mapakyas) — wala gi-wrap sa try/catch dire.
  const rows = await fetchAllFilteredProducts()

  try {
    const esc = (value: string) => `"${value.replace(/"/g, '""')}"`
    const cols: [string, (p: ProductType) => string][] = [
      ['Category', (p) => p.category ?? ''],
      ['Product Name', (p) => p.product_name ?? ''],
      ['Brand', (p) => p.brand ?? ''],
      ['SKU', (p) => p.sku ?? ''],
      ['Stock', (p) => String(resolvedStock(p))],
      [
        'Selling Price',
        (p) => (isBlank(p.selling_price) ? '' : formatCurrency(Number(p.selling_price))),
      ],
      ['Unit', (p) => p.unit ?? ''],
      ['Batch No.', (p) => p.batch_no ?? ''],
      ['Expiry Date', (p) => (p.expiry_date ? formatMonthYear(p.expiry_date) : '')],
      // Expanded-row details isip columns: Barcode, Status, Reservations.
      ['Barcode', (p) => p.barcode ?? ''],
      ['Status', (p) => p.status ?? ''],
      ['Reserved', (p) => formatReservations(p)],
    ]
    // Warehouse Total Qty — ang expanded row nagpakita ra ni kung naay warehouse
    // filter nga active, mao nga i-dugang ra ang column kung ingon ana.
    if (selectedWarehouseId.value) {
      cols.push([
        'Warehouse Total Qty',
        (p) => String(getWarehouseProductDetail(p.id)?.total_qty ?? ''),
      ])
    }
    // Supplier ra ang idugang kung ang role angay makakita sa supplier name.
    if (canViewSupplierName(authUser.userRole)) {
      cols.push(['Supplier', (p) => p.suppliers?.name ?? ''])
    }

    const lines = [
      cols.map(([title]) => esc(title)).join(','),
      ...rows.map((p) => cols.map(([, value]) => esc(value(p))).join(',')),
    ]
    // I-apil ang filter type sa filename kung naay active nga type filter;
    // kung 'All' (walay filter), dili na i-apil.
    const filterTag =
      typeFilter.value !== 'All' ? `-${typeFilter.value.toLowerCase().replace(/\s+/g, '-')}` : ''
    // BOM (\uFEFF) para ang Excel maka-recognize sa UTF-8 nga text.
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products${filterTag}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} product${rows.length === 1 ? '' : 's'} to CSV.`)
  } catch (err) {
    console.error('[ProductsWidget] CSV export failed:', err)
    toast.error('Could not export the products to CSV.')
  } finally {
    exportLoading.value = false
  }
}

// ── PDF export ──────────────────────────────────────────────────────────────
// Kuhaon ang tanang filtered rows unya i-open ang print dialog nga mo-rasterise
// sa report ngadto sa PDF.
async function openPdfPrint() {
  if (exportLoading.value) return
  exportLoading.value = true
  // Same story as exportCsv: ang store na ang mo-handle sa Supabase errors.
  printProducts.value = await fetchAllFilteredProducts()
  showPrintDialog.value = true
  exportLoading.value = false
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
          persistent-placeholder
          class="type-filter"
        >
          <template #prepend-item>
            <v-list-item v-if="typeFilter !== 'All'" @click="typeFilter = 'All'">
              <v-list-item-title class="text-caption text-grey-darken-1">All</v-list-item-title>
            </v-list-item>
            <v-divider class="mt-2"></v-divider>
          </template>
        </v-select>
        <!-- Export options: 3-dot menu para ma-shrink ang header -->
        <v-menu location="bottom end">
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              icon="mdi-dots-horizontal"
              variant="tonal"
              :loading="exportLoading"
              aria-label="Export options"
            ></v-btn>
          </template>
          <v-list density="compact" min-width="200">
            <v-list-item
              prepend-icon="mdi-file-delimited-outline"
              title="Export CSV"
              :disabled="exportLoading"
              @click="exportCsv"
            />
            <v-list-item
              prepend-icon="mdi-file-pdf-box"
              title="Download PDF"
              :disabled="exportLoading"
              @click="openPdfPrint"
            />
          </v-list>
        </v-menu>
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
        class="mt-2"
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
      <div class="d-flex ga-2 pt-2">
        <v-btn
          variant="tonal"
          size="small"
          class="text-none flex-grow-1"
          prepend-icon="mdi-file-delimited-outline"
          :loading="exportLoading"
          @click="exportCsv"
        >
          CSV
        </v-btn>
        <v-btn
          variant="tonal"
          size="small"
          class="text-none flex-grow-1"
          prepend-icon="mdi-file-pdf-box"
          :disabled="exportLoading"
          @click="openPdfPrint"
        >
          PDF
        </v-btn>
      </div>
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
        <template #[`item.cost_price`]="{ item }">
          <span v-if="!isBlank(item.cost_price)">
            {{ formatCurrency(Number(item.cost_price)) }}
          </span>
          <span v-else class="text-medium-emphasis font-italic">{{ NOT_SET }}</span>
        </template>
        <template #[`item.selling_price`]="{ item }">
          <span v-if="!isBlank(item.selling_price)">
            {{ formatCurrency(Number(item.selling_price)) }}
          </span>
          <span v-else class="text-medium-emphasis font-italic">{{ NOT_SET }}</span>
        </template>
        <template #[`item.category`]="{ item }">
          <v-chip size="small" variant="tonal" color="primary">
            {{ item.category || 'N/A' }}
          </v-chip>
        </template>
        <template #[`item.brand`]="{ item }">
          <!-- Kung null/blank ang brand sa product, ipakita ang 'No brand' -->
          <span v-if="!isBlank(item.brand)">{{ item.brand }}</span>
          <span v-else class="text-medium-emphasis font-italic">No brand</span>
        </template>
        <template #[`item.unit`]="{ item }">
          <span>{{ item.unit || 'N/A' }}</span>
        </template>
        <template #[`item.current_stock`]="{ item }">
          <v-chip
            v-if="!selectedWarehouseId"
            :color="stockColor(item, getMainWarehouseStock(item))"
            size="small"
            variant="outlined"
          >
            {{ getMainWarehouseStock(item) }}
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
                  <WarehouseStockDetails
                    :product="item"
                    :selected-warehouse-id="selectedWarehouseId"
                    :get-warehouse-stock="getWarehouseStock"
                    :get-warehouse-product-detail="getWarehouseProductDetail"
                    :get-product-reservations="getProductReservations"
                    :open-add-reservation-dialog="openAddReservationDialog"
                    :remove-reservation="removeReservation"
                  />
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
    :can-dispose="canDispose"
    :disposal-request-info="disposalRequestInfo"
    :selected-reorder-product-ids="selectedReorderProductIds"
    :reorder-request-info="reorderRequestInfo"
    :can-request-reorder="canRequestReorder"
    :update-reorder-level="updateReorderLevel"
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
    @request-disposal="requestDisposal"
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
    @reservation-added="
      selectedWarehouseId ? setWarehouseFilter(selectedWarehouseId) : fetchMainWarehouseReservations()
    "
  />

  <!-- Products print / PDF report -->
  <ProductsWidgetPrint
    v-model="showPrintDialog"
    :items="printProducts"
    :type-filter="typeFilter"
    :search-query="searchQuery"
    :expiry-label="expiryFilterLabel"
    :warehouse-name="selectedWarehouseName"
    :can-view-supplier="canViewSupplierName(authUser.userRole)"
    :show-warehouse-qty="!!selectedWarehouseId"
    :get-stock="resolvedStock"
    :get-reservations="(item) => getProductReservations(item.id)"
    :get-warehouse-qty="(item) => getWarehouseProductDetail(item.id)?.total_qty ?? null"
  />

  <!-- Loading overlay samtang ongoing ang export — nag-cover sa table view -->
  <ExportDialogLoading v-model="exportLoading" />
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
