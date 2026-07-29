// composables/useProductsWidget.ts
import { ref, computed, onMounted, watch } from 'vue'
import { useToast } from 'vue-toastification'
import {
  useProductsDataStore,
  type ProductType,
  type CreateProductData,
  type UpdateProductData,
} from '@/stores/productsData'
import { useLogsDataStore } from '@/stores/logsData'
import type { ReorderPrefillItem } from '@/pages/purchasing/composables/usePurchaseRequisition'
import { useAuthUserStore } from '@/stores/authUser'
import { isPurchasingRole, isProductEditRestricted } from '@/utils/roleHelpers'
import {
  useProductIgnore,
  IGNORE_DURATIONS,
} from '@/components/products/composables/useProductIgnore'
import { useWarehouseProductsDataStore } from '@/stores/warehouseProductsData'
import {
  useReservedProductsDataStore,
  type ReservedProductType,
} from '@/stores/reservedProductsData'
import { useCustomersDataStore } from '@/stores/customersData'

interface StockStatusCardDef {
  type: 'out-of-stock' | 'low-stock' | 'no-reorder-level' | 'expiring-soon' | 'expired'
  label: string
  icon: string
  color: string
  filter: (p: ProductType) => boolean
}

export const reorderReasonMap: Record<
  string,
  'reorder_outofstock' | 'reorder_lowstock' | 'reorder_expiring' | 'reorder_expired'
> = {
  'out-of-stock': 'reorder_outofstock',
  'low-stock': 'reorder_lowstock',
  'expiring-soon': 'reorder_expiring',
  expired: 'reorder_expired',
}

export function useProductsWidget() {
  const toast = useToast()
  const productsStore = useProductsDataStore()
  const authStore = useAuthUserStore()
  const logsStore = useLogsDataStore()
  const productIgnore = useProductIgnore()

  // Dialog states
  const showDialog = ref(false)
  const showDeleteDialog = ref(false)
  const dialogMode = ref<'create' | 'edit'>('create')
  const EXPIRY_WARNING_DAYS = 540 // 18 months
  const isPurchaser = computed(() => isPurchasingRole(authStore.userRole))
  const isEditRestricted = computed(() => isProductEditRestricted(authStore.userRole))
  const expiryFilterValue = ref<string>('')


  // Form state
  const form = ref<any>(null)

  const emptyForm = (): CreateProductData & UpdateProductData => ({
    barcode: '',
    sku: '',
    product_name: '',
    generic_name: '',
    category: '',
    unit: '',
    cost_price: null,
    selling_price: null,
    current_stock: null,
    reorder_level: null,
    supplier_id: null,
    batch_no: null,
    expiry_date: '',
    status: '',
    item_decription: '',
    offer_per_unit: null,
    cost_per_unit: null,
    no: null,
  })

  const productForm = ref<CreateProductData & UpdateProductData>(emptyForm())
  const currentProduct = ref<ProductType | null>(null)

  // Search, pagination, sort state
  const searchQuery = ref('')
  const itemsPerPage = ref(10)
  const page = ref(1)
  const sortBy = ref([{ key: 'current_stock', order: 'asc' as 'asc' | 'desc' }])

  // Expanded rows
  const expanded = ref<string[]>([])

  // Warehouse filter
  const selectedWarehouseId = ref<number | null>(null)
  const warehouseProductIds = ref<number[]>([])
  const warehouseStockMap = ref<Map<number, number>>(new Map())
  const warehouseProductDetails = ref<Map<number, { total_qty: number }>>(new Map())

  // Reserved products — maps product_id -> list of reservations with customer name
  const reservedProductsMap = ref<Map<number, { customer_name: string; reserved_qty: number }[]>>(
    new Map(),
  )
  const warehouseProductsIdToProductId = ref<Map<number, number>>(new Map())

  // Stock status dialog
  const showStockDialog = ref(false)

  // Eligible product IDs (those in stock_in transactions)
  const eligibleProductIds = ref<Set<number>>(new Set())

  // Table headers
  const headers = computed(() => [
    { title: '', key: 'data-table-expand', sortable: false },
    { title: 'ID', key: 'id', sortable: true },
    { title: 'Product Name', key: 'product_name', sortable: true },
    { title: 'SKU', key: 'sku', sortable: true },
    { title: 'Stock', key: 'current_stock', sortable: true },
    { title: 'Selling Price', key: 'selling_price', sortable: true },
    { title: 'Unit', key: 'unit', sortable: true },
    { title: 'Batch No.', key: 'batch_no' },
    { title: 'Expiry Date', key: 'expiry_date' },
    { title: 'Actions', key: 'actions', sortable: false },
  ])

  // Computed
  const products = computed(() =>
    productsStore.products.filter((p) => {
      // Must have a valid SKU
      if (p.sku == null || p.sku === 'null') return false

      // When a warehouse filter is active, only show products that exist in that warehouse
      if (selectedWarehouseId.value) {
        return warehouseProductIds.value.includes(p.id)
      }

      // Main warehouse: only show eligible products (those with stock_in transactions)
      return eligibleProductIds.value.has(p.id)
    }),
  )

  const loading = computed(() => productsStore.loading)
  const totalProducts = computed(() => productsStore.totalCount)

  // All-products stock status counts (not paginated, from the full store)
  // Filters out products that have been ignored/dismissed by the user
  const allEligibleProducts = computed(() =>
    productsStore.products.filter(
      (p) =>
        p.sku != null &&
        p.sku !== 'null' &&
        eligibleProductIds.value.has(p.id) &&
        !productIgnore.activeIgnoredIds.value.has(p.id),
    ),
  )

  function daysUntilExpiry(expiryDate: string | null | undefined): number | null {
    if (!expiryDate) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expiry = new Date(expiryDate)
    expiry.setHours(0, 0, 0, 0)
    return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  const stockStatusCardDefs: StockStatusCardDef[] = [
    {
      type: 'out-of-stock',
      label: 'Out of Stock',
      icon: 'mdi-close-circle-outline',
      color: 'error',
      filter: (p) => (p.current_stock ?? 0) <= 0,
    },
    {
      type: 'low-stock',
      label: 'Low Stock',
      icon: 'mdi-alert-outline',
      color: 'warning',
      filter: (p) => {
        const stock = p.current_stock ?? 0
        return stock > 0 && !!p.reorder_level && stock <= p.reorder_level
      },
    },
    {
      type: 'no-reorder-level',
      label: 'No Reorder Level',
      icon: 'mdi-information-outline',
      color: 'info',
      filter: (p) => p.reorder_level === null,
    },
    {
      type: 'expiring-soon',
      label: 'Expiring Soon',
      icon: 'mdi-clock-alert-outline',
      color: 'orange',
      filter: (p) => {
        const ref = expiryFilterParsed.value

        if (!ref) {
          // Default: rolling 18-month window from today
          const days = daysUntilExpiry(p.expiry_date)
          return days !== null && days >= 0 && days <= EXPIRY_WARNING_DAYS
        }

        // Filtered: flag if the selected month falls within 18 calendar months
        // before the product's expiry date (inclusive on both ends)
        const monthsDiff = monthsUntilExpiryFrom(p.expiry_date, ref)
        return monthsDiff !== null && monthsDiff >= 0 && monthsDiff <= 18
      },
    },
    {
      type: 'expired',
      label: 'Expired',
      icon: 'mdi-calendar-remove',
      color: 'error',
      filter: (p) => {
        const days = daysUntilExpiry(p.expiry_date)
        return days !== null && days < 0
      },
    },
  ]

  // Cards for the StockStatusCards row (label/icon/color/count)
  const stockStatusCards = computed(() =>
    stockStatusCardDefs.map((def) => ({
      type: def.type,
      label: def.label,
      icon: def.icon,
      color: def.color,
      count: allEligibleProducts.value.filter(def.filter).length,
    })),
  )

  const stockDialogType = ref<StockStatusCardDef['type']>('out-of-stock')

  // The active card's metadata (for dialog title/icon/color)
  const activeStockCard = computed(() =>
    stockStatusCards.value.find((c) => c.type === stockDialogType.value),
  )

  // The active card's filtered product list (for dialog body)
  const stockDialogProducts = computed<ProductType[]>(() => {
    const def = stockStatusCardDefs.find((d) => d.type === stockDialogType.value)
    return def ? allEligibleProducts.value.filter(def.filter) : []
  })

  // Validation rules
  const rules = {
    required: (value: any) => !!value || 'Field is required',
    positiveNumber: (value: number | null) =>
      value === null || value >= 0 || 'Must be a positive number',
  }

  // Methods
  async function fetchEligibleProductIds() {
    try {
      const ids = await productsStore.fetchEligibleProductIds()
      eligibleProductIds.value = new Set(ids)
      //console.log('[ProductsWidget] Eligible product IDs from stock_in transactions:', ids)
    } catch (err) {
      console.error('[ProductsWidget] Failed to fetch eligible product IDs:', err)
      eligibleProductIds.value = new Set()
    }
  }

  async function fetchProducts() {
    // When a warehouse is selected, fetch ALL products and let the `products`
    // computed filter by warehouseProductIds. Don't pass eligibleIds so the
    // get_eligible_product_ids RPC is not used for warehouse filtering.
    const ids = selectedWarehouseId.value ? undefined : [...eligibleProductIds.value]

    await productsStore.fetchProducts({
      search: searchQuery.value,
      orderBy: (sortBy.value[0]?.key as any) || 'created_at',
      ascending: sortBy.value[0]?.order === 'asc',
      limit: itemsPerPage.value,
      offset: (page.value - 1) * itemsPerPage.value,
      eligibleIds: ids,
    })
  }

  function setWarehouseFilter(warehouseId: number | null) {
    selectedWarehouseId.value = warehouseId
    if (warehouseId) {
      const warehouseProductsStore = useWarehouseProductsDataStore()
      const reservedProductsStore = useReservedProductsDataStore()

      warehouseProductsStore
        .fetchWarehouseProducts({ warehouse_id: warehouseId })
        .then(async () => {
          const fetchedProductIds = warehouseProductsStore.warehouseProducts
            .map((wp) => wp.product_id)
            .filter((id): id is number => id != null)

          warehouseProductIds.value = fetchedProductIds

          // If the selected warehouse has no products, show empty table
          if (fetchedProductIds.length === 0) {
            warehouseStockMap.value = new Map()
            warehouseProductDetails.value = new Map()
            reservedProductsMap.value = new Map()
            warehouseProductsIdToProductId.value = new Map()
            fetchProducts()
            return
          }

          // Build warehouse product ID -> product ID map
          const wpToProductMap = new Map<number, number>()
          for (const wp of warehouseProductsStore.warehouseProducts) {
            if (wp.id != null && wp.product_id != null) {
              wpToProductMap.set(wp.id, wp.product_id)
            }
          }
          warehouseProductsIdToProductId.value = wpToProductMap

          // Use RPC to get stock + reservations in a single query
          // RPC now returns individual rows per reservation (customer_name, reserved_qty as separate columns)
          const rpcRows =
            await reservedProductsStore.fetchWarehouseStockWithReservations(warehouseId)

          const stockMap = new Map<number, number>()
          const detailsMap = new Map<number, { total_qty: number }>()
          const reservationsByProduct = new Map<
            number,
            { customer_name: string; reserved_qty: number }[]
          >()

          // Group individual RPC rows by product_id to build the reservations array
          for (const row of rpcRows) {
            if (row.product_id == null) continue
            const productId = row.product_id

            // Set stock and total_qty from the first occurrence (same for all rows of this product)
            if (!stockMap.has(productId)) {
              stockMap.set(productId, row.available_stock)
            }
            if (!detailsMap.has(productId)) {
              detailsMap.set(productId, { total_qty: row.total_qty })
            }

            // Build reservations array from individual rows (skip rows with no reservation)
            if (row.customer_name != null && row.reserved_qty != null) {
              const existing = reservationsByProduct.get(productId) || []
              existing.push({
                customer_name: row.customer_name,
                reserved_qty: row.reserved_qty,
              })
              reservationsByProduct.set(productId, existing)
            } else {
              // Ensure every product has at least an empty array
              if (!reservationsByProduct.has(productId)) {
                reservationsByProduct.set(productId, [])
              }
            }

            /*  console.log(
              `[ProductsWidget] Product ${productId}: total_qty=${row.total_qty}, available_stock=${row.available_stock}, customer_name=${row.customer_name}, reserved_qty=${row.reserved_qty}`,
            ) */
          }

          warehouseStockMap.value = stockMap
          warehouseProductDetails.value = detailsMap
          reservedProductsMap.value = reservationsByProduct

          fetchProducts()
        })
    } else {
      warehouseProductIds.value = []
      warehouseStockMap.value = new Map()
      warehouseProductDetails.value = new Map()
      reservedProductsMap.value = new Map()
      warehouseProductsIdToProductId.value = new Map()
      fetchProducts()
    }
  }

  /**
   * Get the warehouse-specific available stock (total_qty - sum of reserved_qty) for a product.
   * Returns null if no warehouse filter is active or product not found in warehouse.
   */
  function getWarehouseStock(productId: number): number | null {
    return warehouseStockMap.value.get(productId) ?? null
  }

  /**
   * Get detailed warehouse product info for display.
   */
  function getWarehouseProductDetail(productId: number): { total_qty: number } | null {
    return warehouseProductDetails.value.get(productId) ?? null
  }

  /**
   * Get the list of reservations (customer name + qty) for a product.
   */
  function getProductReservations(
    productId: number,
  ): { customer_name: string; reserved_qty: number }[] {
    return reservedProductsMap.value.get(productId) || []
  }

  function openCreateDialog() {
    dialogMode.value = 'create'
    productForm.value = emptyForm()
    currentProduct.value = null
    form.value?.resetValidation()
    showDialog.value = true
  }

  function openEditDialog(product: ProductType) {
    dialogMode.value = 'edit'
    currentProduct.value = product
    productForm.value = { ...product } as CreateProductData & UpdateProductData
    form.value?.resetValidation()
    showDialog.value = true
  }

  function openDeleteDialog(product: ProductType) {
    currentProduct.value = product
    showDeleteDialog.value = true
  }

  function closeDialog() {
    showDialog.value = false
    currentProduct.value = null
  }

  function closeDeleteDialog() {
    showDeleteDialog.value = false
    currentProduct.value = null
  }

  async function handleSubmit() {
    if (!form.value) return
    const { valid } = await form.value.validate()
    if (!valid) return

    const cleaned: Record<string, any> = {}
    for (const [key, value] of Object.entries(productForm.value)) {
      cleaned[key] = value === '' ? null : value
    }

    if (dialogMode.value === 'create') {
      const result = await productsStore.createProduct(cleaned as CreateProductData)
      if (result) {
        toast.success('Product created successfully')
        try {
          await logsStore.createLog({
            action: 'create',
            description: `Created product "${result.product_name}" (SKU: ${result.sku ?? 'N/A'})`,
            module: 'products',
          })
        } catch (logErr) {
          console.error('[Logging] Failed to create product log:', logErr)
        }
        closeDialog()
      } else {
        toast.error('Failed to create product: ' + (productsStore.error || 'Unknown error'))
      }
    } else if (dialogMode.value === 'edit' && currentProduct.value) {
      const oldData = currentProduct.value
      const result = await productsStore.updateProduct(
        currentProduct.value.id,
        cleaned as UpdateProductData,
      )
      if (result) {
        toast.success('Product updated successfully')
        try {
          const changes: string[] = []
          if (oldData.current_stock !== result.current_stock)
            changes.push(
              `stock=${oldData.current_stock ?? 'N/A'} → ${result.current_stock ?? 'N/A'}`,
            )
          if (oldData.cost_price !== result.cost_price)
            changes.push(
              `cost_price=${oldData.cost_price ?? 'N/A'} → ${result.cost_price ?? 'N/A'}`,
            )
          if (oldData.selling_price !== result.selling_price)
            changes.push(
              `selling_price=${oldData.selling_price ?? 'N/A'} → ${result.selling_price ?? 'N/A'}`,
            )
          if (oldData.reorder_level !== result.reorder_level)
            changes.push(
              `reorder_level=${oldData.reorder_level ?? 'N/A'} → ${result.reorder_level ?? 'N/A'}`,
            )
          if (oldData.offer_per_unit !== result.offer_per_unit)
            changes.push(
              `offer_per_unit=${oldData.offer_per_unit ?? 'N/A'} → ${result.offer_per_unit ?? 'N/A'}`,
            )
          if (oldData.cost_per_unit !== result.cost_per_unit)
            changes.push(
              `cost_per_unit=${oldData.cost_per_unit ?? 'N/A'} → ${result.cost_per_unit ?? 'N/A'}`,
            )
          if (oldData.supplier_id !== result.supplier_id)
            changes.push(
              `supplier_id=${oldData.supplier_id ?? 'N/A'} → ${result.supplier_id ?? 'N/A'}`,
            )
          if (oldData.batch_no !== result.batch_no)
            changes.push(`batch_no=${oldData.batch_no ?? 'N/A'} → ${result.batch_no ?? 'N/A'}`)
          if (oldData.expiry_date !== result.expiry_date)
            changes.push(
              `expiry_date=${oldData.expiry_date ?? 'N/A'} → ${result.expiry_date ?? 'N/A'}`,
            )
          if (oldData.status !== result.status)
            changes.push(`status=${oldData.status ?? 'N/A'} → ${result.status ?? 'N/A'}`)
          if (oldData.item_decription !== result.item_decription)
            changes.push(
              `item_description=${oldData.item_decription ?? 'N/A'} → ${result.item_decription ?? 'N/A'}`,
            )
          if (oldData.unit !== result.unit)
            changes.push(`unit=${oldData.unit ?? 'N/A'} → ${result.unit ?? 'N/A'}`)
          if (oldData.no !== result.no)
            changes.push(`no=${oldData.no ?? 'N/A'} → ${result.no ?? 'N/A'}`)
          if (oldData.barcode !== result.barcode)
            changes.push(`barcode=${oldData.barcode ?? 'N/A'} → ${result.barcode ?? 'N/A'}`)
          if (oldData.product_name !== result.product_name)
            changes.push(
              `product_name="${oldData.product_name ?? 'N/A'}" → "${result.product_name ?? 'N/A'}"`,
            )
          if (oldData.generic_name !== result.generic_name)
            changes.push(
              `generic_name="${oldData.generic_name ?? 'N/A'}" → "${result.generic_name ?? 'N/A'}"`,
            )
          if (oldData.category !== result.category)
            changes.push(`category="${oldData.category ?? 'N/A'}" → "${result.category ?? 'N/A'}"`)
          if (oldData.sku !== result.sku)
            changes.push(`sku="${oldData.sku ?? 'N/A'}" → "${result.sku ?? 'N/A'}"`)

          await logsStore.createLog({
            action: 'update',
            description: `Updated product "${result.product_name}" (SKU: ${result.sku ?? 'N/A'}). ${changes.length ? 'Changes: ' + changes.join(', ') : 'No field changes detected'}`,
            module: 'products',
          })
        } catch (logErr) {
          console.error('[Logging] Failed to create product log:', logErr)
        }
        closeDialog()
      } else {
        toast.error('Failed to update product: ' + (productsStore.error || 'Unknown error'))
      }
    }
  }

  async function handleDelete() {
    if (!currentProduct.value) return
    const productName = currentProduct.value.product_name
    const productSku = currentProduct.value.sku
    const productId = currentProduct.value.id
    const result = await productsStore.deleteProduct(productId)
    if (result) {
      toast.success('Product deleted successfully')
      try {
        await logsStore.createLog({
          action: 'delete',
          description: `Deleted product "${productName}" (SKU: ${productSku ?? 'N/A'}, ID: ${productId})`,
          module: 'products',
        })
      } catch (logErr) {
        console.error('[Logging] Failed to create product log:', logErr)
      }
      closeDeleteDialog()
    } else {
      toast.error('Failed to delete product')
    }
  }

  function handleSearch() {
    if (selectedWarehouseId.value && warehouseProductIds.value.length > 0) {
      fetchProducts()
    } else {
      fetchProducts()
    }
  }

  const reorderRequestInfo = computed(() => {
    const map = new Map<number, { id: number; status: string }>()
    for (const r of productsStore.reorderRequests) {
      // FIXED — reorderRequests is sorted created_at desc (newest first).
      // The old `.set()` here unconditionally overwrote, so iterating
      // forward left the OLDEST entry per product in the map. That's now a
      // real bug: a rejected row followed by a fresh pending re-flag would
      // show as "Rejected" forever. Guard with `!map.has` so only the first
      // (i.e. most recent) entry per product sticks.
      if (r.product?.id != null && !map.has(r.product.id)) {
        map.set(r.product.id, { id: r.id, status: r.status })
      }
    }
    return map
  })

  // NEW — a product can be reordered if it has no request yet, OR its most
  // recent request was rejected (re-flagging is allowed after rejection).
  function canRequestReorder(productId: number): boolean {
    const info = reorderRequestInfo.value.get(productId)
    return !info || info.status === 'rejected'
  }

  // Purchaser-only bulk reorder-to-PR flow
  const selectedReorderProductIds = ref<number[]>([])
  const showPurchaseRequisitionDialog = ref(false)
  const prefillItemsForDialog = ref<ReorderPrefillItem[]>([])

  function toggleReorderSelection(productId: number, checked: boolean) {
    if (checked) selectedReorderProductIds.value.push(productId)
    else
      selectedReorderProductIds.value = selectedReorderProductIds.value.filter(
        (id) => id !== productId,
      )
  }

  function proceedCreatePRFromSelection() {
    const reason = reorderReasonMap[stockDialogType.value]
    if (!reason || !selectedReorderProductIds.value.length) return

    prefillItemsForDialog.value = stockDialogProducts.value
      .filter((p) => selectedReorderProductIds.value.includes(p.id))
      .map((p) => ({
        reorder_request_id: null, // no row exists yet
        reorder_reason: reason, // tells the PR composable to create one on submit
        product_id: p.id,
        item_description: p.product_name ?? '',
        unit: p.unit ?? 'Box',
        supplier_id: p.supplier_id ?? null,
        cost_per_unit: p.cost_price ?? 0,
        offer_per_unit: p.selling_price ?? 0,
      }))

    showStockDialog.value = false
    showPurchaseRequisitionDialog.value = true
  }

  function clearExpiryFilter() {
    expiryFilterValue.value = ''
  }

  const expiryFilterParsed = computed<{ year: number; month: number } | null>(() => {
    if (!expiryFilterValue.value) return null
    const [y, m] = expiryFilterValue.value.split('-').map(Number)
    if (!y || !m) return null
    return { year: y, month: m } // month is 1-indexed, matches <input type="month"> output
  })

  const expiryFilterLabel = computed<string | null>(() => {
    const ref = expiryFilterParsed.value
    if (!ref) return null
    const date = new Date(ref.year, ref.month - 1, 1)
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) // "Apr 2025"
  })

  async function handleTableOptions(options: any) {
    page.value = options.page
    itemsPerPage.value = options.itemsPerPage
    sortBy.value = options.sortBy
    await fetchProducts()
  }

  function monthsUntilExpiryFrom(
    expiryDate: string | null | undefined,
    ref: { year: number; month: number },
  ): number | null {
    if (!expiryDate) return null
    const expiry = new Date(expiryDate)
    const expiryMonthsTotal = expiry.getFullYear() * 12 + expiry.getMonth() // 0-indexed
    const refMonthsTotal = ref.year * 12 + (ref.month - 1) // normalize to 0-indexed
    return expiryMonthsTotal - refMonthsTotal
  }

  // Lifecycle
  onMounted(async () => {
    await fetchEligibleProductIds()
    await fetchProducts()
    productsStore.startRealtime()
  })

  // Clear stale selection state when dialogs close
  watch(showStockDialog, (open) => {
    if (!open) selectedReorderProductIds.value = []
  })
  watch(showPurchaseRequisitionDialog, (open) => {
    if (!open) prefillItemsForDialog.value = []
  })

  return {
    // Refs
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
    showStockDialog,
    stockDialogType,
    selectedWarehouseId,
    // Computed
    headers,
    products,
    loading,
    totalProducts,
    stockStatusCards,
    activeStockCard,
    stockDialogProducts,
    // Validation
    rules,
    // Methods
    openCreateDialog,
    openEditDialog,
    openDeleteDialog,
    closeDialog,
    closeDeleteDialog,
    handleSubmit,
    handleDelete,
    handleSearch,
    setWarehouseFilter,
    getWarehouseStock,
    getWarehouseProductDetail,
    getProductReservations,
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
    // Product Ignore / Dismiss
    productIgnore,
    IGNORE_DURATIONS,
    // expiring card by filter
    expiryFilterValue,
    expiryFilterLabel,
    clearExpiryFilter,

  }
}
