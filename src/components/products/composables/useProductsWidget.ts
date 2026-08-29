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
import { useConfirmDialog } from '@/composables/useConfirmDialog'

interface StockStatusCardDef {
  type: 'out-of-stock' | 'low-stock' | 'no-reorder-level' | 'expiring-soon' | 'expired'
  label: string
  icon: string
  color: string
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
  const confirmDialog = useConfirmDialog()

  // Dialog states
  const showDialog = ref(false)
  const showDeleteDialog = ref(false)
  const dialogMode = ref<'create' | 'edit'>('create')
  const showStockDialog = ref(false)
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
  })

  const productForm = ref<CreateProductData & UpdateProductData>(emptyForm())
  const currentProduct = ref<ProductType | null>(null)

  // Search, pagination, sort state
  const searchQuery = ref('')
  const typeFilter = ref('All')
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

  // Reserved products — maps product_id -> list of reservations with customer name and reservation id
  const reservedProductsMap = ref<
    Map<number, { id: number; customer_name: string; reserved_qty: number }[]>
  >(new Map())
  const warehouseProductsIdToProductId = ref<Map<number, number>>(new Map())

  // Add reservation dialog
  const showAddReservationDialog = ref(false)
  const selectedProductForReservation = ref<ProductType | null>(null)
  const reservationCustomerId = ref<number | null>(null)
  const reservationQuantity = ref<number>(0)

  // Eligible product IDs (those in stock_in transactions)

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

      // When a warehouse filter is active, only show products that exist in that warehouse
      if (selectedWarehouseId.value) {
        return warehouseProductIds.value.includes(p.id)
      }

      // Main warehouse: only show eligible products (those with stock_in transactions)
      return true
    }),
  )

  const loading = computed(() => productsStore.loading)
  const totalProducts = computed(() => productsStore.totalCount)

  const stockStatusCardDefs: StockStatusCardDef[] = [
    {
      type: 'out-of-stock',
      label: 'Out of Stock',
      icon: 'mdi-close-circle-outline',
      color: 'error',
    },
    { type: 'low-stock', label: 'Low Stock', icon: 'mdi-alert-outline', color: 'warning' },
    {
      type: 'no-reorder-level',
      label: 'No Reorder Level',
      icon: 'mdi-information-outline',
      color: 'info',
    },
    {
      type: 'expiring-soon',
      label: 'Expiring Soon',
      icon: 'mdi-clock-alert-outline',
      color: 'orange',
    },
    { type: 'expired', label: 'Expired', icon: 'mdi-calendar-remove', color: 'error' },
  ]

  // Cards for the StockStatusCards row (label/icon/color/count)
  const stockStatusCards = computed(() =>
    stockStatusCardDefs.map((def) => ({
      type: def.type,
      label: def.label,
      icon: def.icon,
      color: def.color,
      count: productsStore.stockStatusCounts[def.type] ?? 0,
    })),
  )

  const stockDialogType = ref<StockStatusCardDef['type']>('out-of-stock')

  // The active card's metadata (for dialog title/icon/color)
  const activeStockCard = computed(() =>
    stockStatusCards.value.find((c) => c.type === stockDialogType.value),
  )

  // The active card's filtered product list (for dialog body)
  const stockDialogProducts = computed<ProductType[]>(() => productsStore.stockStatusProducts)

  // Stock dialog search + pagination state
  const stockDialogSearchQuery = ref('')
  const stockDialogPage = ref(1)
  const stockDialogItemsPerPage = ref(10)
  const stockDialogTotal = computed(() => productsStore.stockStatusProductsTotal)
  const stockDialogLoading = computed(() => productsStore.stockStatusLoading)
  const stockDialogTotalPages = computed(() =>
    Math.max(1, Math.ceil(stockDialogTotal.value / stockDialogItemsPerPage.value)),
  )

  // Validation rules
  const rules = {
    required: (value: any) => !!value || 'Field is required',
    positiveNumber: (value: number | null) =>
      value === null || value >= 0 || 'Must be a positive number',
  }

  async function fetchProducts() {
    const range = expiryFilterRange.value

    const ids = selectedWarehouseId.value
      ? warehouseProductIds.value.length > 0
        ? [...warehouseProductIds.value]
        : [-1]
      : undefined

    await productsStore.fetchProducts({
      search: searchQuery.value,
      // type: typeFilter.value,
      orderBy: range ? 'expiry_date' : (sortBy.value[0]?.key as any) || 'created_at',
      ascending: range ? true : sortBy.value[0]?.order === 'asc',
      limit: itemsPerPage.value,
      offset: (page.value - 1) * itemsPerPage.value,
      // eligibleIds: ids.length > 0 ? ids : undefined,
      eligibleIds: ids && ids.length > 0 ? ids : undefined,
      expiryStart: range?.start,
      expiryEnd: range?.end,
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
          const rpcRows =
            await reservedProductsStore.fetchWarehouseStockWithReservations(warehouseId)

          const stockMap = new Map<number, number>()
          const detailsMap = new Map<number, { total_qty: number }>()
          const reservationsByProduct = new Map<
            number,
            { id: number; customer_name: string; reserved_qty: number }[]
          >()

          // Track which warehouse_product_ids have reservations to fetch their IDs
          const warehouseProductIdsWithReservations = new Set<number>()

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

              // Track warehouse_product_id for later ID fetch
              if (row.warehouse_product_id != null) {
                warehouseProductIdsWithReservations.add(row.warehouse_product_id)
              }

              // Use a placeholder ID - we'll update it after fetching actual reservation IDs
              existing.push({
                id: row.warehouse_product_id, // temporarily use warehouse_product_id as key
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
          }

          // Fetch actual reservation IDs from the reserved_products table
          const reservationIdMap = new Map<number, number>() // warehouse_product_id -> reservation id
          if (warehouseProductIdsWithReservations.size > 0) {
            const reservationRows =
              await reservedProductsStore.fetchReservedProductsByWarehouseProductIds(
                Array.from(warehouseProductIdsWithReservations),
              )

            for (const rp of reservationRows) {
              if (rp.warehouse_products_id != null && rp.id != null) {
                reservationIdMap.set(rp.warehouse_products_id, rp.id)
              }
            }
          }

          // Update reservation entries with actual reservation IDs
          const finalReservationsByProduct = new Map<
            number,
            { id: number; customer_name: string; reserved_qty: number }[]
          >()

          for (const [productId, reservations] of reservationsByProduct) {
            const updatedReservations = reservations.map((res) => ({
              id: reservationIdMap.get(res.id) || 0,
              customer_name: res.customer_name,
              reserved_qty: res.reserved_qty,
            }))
            finalReservationsByProduct.set(productId, updatedReservations)
          }

          warehouseStockMap.value = stockMap
          warehouseProductDetails.value = detailsMap
          reservedProductsMap.value = finalReservationsByProduct

          fetchProducts()
        })
    } else {
      warehouseProductIds.value = []
      warehouseStockMap.value = new Map()
      warehouseProductDetails.value = new Map()
      warehouseProductsIdToProductId.value = new Map()
      // Fetch main-warehouse reservations (rows tied to is_main_warehouse products)
      fetchMainWarehouseReservations()
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
  ): { id: number; customer_name: string; reserved_qty: number }[] {
    return reservedProductsMap.value.get(productId) || []
  }

  /**
   * Get the main-warehouse available stock for a product: its current stock minus
   * the sum of all quantities reserved to customers.
   */
  function getMainWarehouseStock(product: ProductType): number {
    const reserved = (reservedProductsMap.value.get(product.id) || []).reduce(
      (sum, r) => sum + (r.reserved_qty ?? 0),
      0,
    )
    return Math.max(0, (product.current_stock ?? 0) - reserved)
  }

  /**
   * Remove a customer reservation by its ID and refresh warehouse stock data.
   */
  async function removeReservation(reservationId: number) {
    console.log('[ProductsWidget] Attempting to remove reservation with ID:', reservationId)

    const confirmed = await confirmDialog.confirmDialog(
      'Are you sure you want to remove this reservation? This action cannot be undone.',
      {
        title: 'Remove Reservation',
        confirmText: 'Remove',
        cancelText: 'Cancel',
      },
    )

    if (!confirmed) {
      console.log('[ProductsWidget] Reservation removal cancelled by user')
      return
    }

    console.log('[ProductsWidget] User confirmed, proceeding with deletion...')

    const reservedProductsStore = useReservedProductsDataStore()
    console.log('[ProductsWidget] Reserved products store error:', reservedProductsStore.error)

    const result = await reservedProductsStore.deleteReservedProduct(reservationId)

    console.log('[ProductsWidget] Delete result:', result)
    console.log(
      '[ProductsWidget] Reserved products store error after delete:',
      reservedProductsStore.error,
    )

    if (result) {
      toast.success('Reservation removed successfully')
      // Refresh warehouse stock and reservations
      if (selectedWarehouseId.value) {
        console.log('[ProductsWidget] Refreshing warehouse filter:', selectedWarehouseId.value)
        await setWarehouseFilter(selectedWarehouseId.value)
      } else {
        console.log('[ProductsWidget] Refreshing main warehouse reservations')
        await fetchMainWarehouseReservations()
      }
    } else {
      toast.error('Failed to remove reservation')
      console.error(
        '[ProductsWidget] Failed to delete reservation. Store error:',
        reservedProductsStore.error,
      )
    }
  }

  /**
   * Fetch reservations for the main warehouse. Main-warehouse products live in
   * warehouse_products rows where warehouse_id is NULL and is_main_warehouse is
   * true; their reservation rows reference those warehouse_products ids. Populate
   * reservedProductsMap keyed by product_id.
   */
  async function fetchMainWarehouseReservations() {
    const warehouseProductsStore = useWarehouseProductsDataStore()
    const reservedProductsStore = useReservedProductsDataStore()
    const customersStore = useCustomersDataStore()

    if (customersStore.customers.length === 0) {
      await customersStore.fetchCustomers()
    }

    const mainProducts = await warehouseProductsStore.fetchMainWarehouseProducts()

    // warehouse_products.id -> product.id for main-warehouse rows
    const wpIdToProductId = new Map<number, number>()
    for (const wp of mainProducts) {
      if (wp.id != null && wp.product_id != null) {
        wpIdToProductId.set(wp.id, wp.product_id)
      }
    }

    const rows =
      wpIdToProductId.size > 0
        ? await reservedProductsStore.fetchReservedProductsByWarehouseProductIds(
            Array.from(wpIdToProductId.keys()),
          )
        : []

    const map = new Map<
      number,
      { id: number; customer_name: string; reserved_qty: number }[]
    >()

    for (const rp of rows) {
      if (rp.warehouse_products_id == null) continue
      const productId = wpIdToProductId.get(rp.warehouse_products_id)
      if (productId == null) continue

      const existing = map.get(productId) || []
      existing.push({
        id: rp.id,
        customer_name:
          customersStore.customers.find((c) => c.id === rp.customer_id)?.name ||
          `Customer #${rp.customer_id}`,
        reserved_qty: rp.reserved_qty ?? 0,
      })
      map.set(productId, existing)
    }

    reservedProductsMap.value = map
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
          if (oldData.unit !== result.unit)
            changes.push(`unit=${oldData.unit ?? 'N/A'} → ${result.unit ?? 'N/A'}`)
          if (oldData.barcode !== result.barcode)
            changes.push(`barcode=${oldData.barcode ?? 'N/A'} → ${result.barcode ?? 'N/A'}`)
          if (oldData.product_name !== result.product_name)
            changes.push(
              `product_name="${oldData.product_name ?? 'N/A'}" → "${result.product_name ?? 'N/A'}"`,
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
      if (r.product?.id != null && !map.has(r.product.id)) {
        map.set(r.product.id, { id: r.id, status: r.status })
      }
    }
    return map
  })
  
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

  const expiryFilterRange = computed<{ start: string; end: string } | null>(() => {
    const ref = expiryFilterParsed.value
    if (!ref) return null

    const start = new Date(ref.year, ref.month - 1, 1)
    const end = new Date(ref.year, ref.month - 1 + 18 + 1, 0) // last day of ref+18 months

    const toLocalISODate = (d: Date) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    return { start: toLocalISODate(start), end: toLocalISODate(end) }
  })

  async function handleTableOptions(options: any) {
    page.value = options.page
    itemsPerPage.value = options.itemsPerPage
    sortBy.value = options.sortBy
    await fetchProducts()
  }

  function currentStatusRef(): { year: number; month: number } | null {
    return expiryFilterParsed.value
      ? { year: expiryFilterParsed.value.year, month: expiryFilterParsed.value.month }
      : null
  }

  async function refreshStockStatusCounts() {
    await productsStore.fetchAllStockStatusCounts(currentStatusRef())
  }

  async function refreshStockDialogProducts() {
    await productsStore.fetchStockStatusProducts(
      stockDialogType.value,
      currentStatusRef(),
      [],
      stockDialogItemsPerPage.value,
      (stockDialogPage.value - 1) * stockDialogItemsPerPage.value,
      stockDialogSearchQuery.value.trim(),
    )
  }

  function searchStockDialogProducts() {
    stockDialogPage.value = 1
    refreshStockDialogProducts()
  }

  function handleStockDialogPageChange(page: number) {
    stockDialogPage.value = page
    refreshStockDialogProducts()
  }

  /**
   * Open add reservation dialog for a product
   */
  function openAddReservationDialog(product: ProductType) {
    selectedProductForReservation.value = product
    reservationCustomerId.value = null
    reservationQuantity.value = 0
    showAddReservationDialog.value = true
  }

  /**
   * Add a new customer reservation for a product in the selected warehouse
   */
  async function addReservation() {
    if (
      !selectedProductForReservation.value ||
      !reservationCustomerId.value ||
      reservationQuantity.value <= 0
    ) {
      toast.error('Please fill in all reservation details')
      return
    }

    if (!selectedWarehouseId.value) {
      toast.error('Please select a warehouse first')
      return
    }

    const reservedProductsStore = useReservedProductsDataStore()

    const product = selectedProductForReservation.value

    let result

    if (selectedWarehouseId.value) {
      const warehouseProductsStore = useWarehouseProductsDataStore()

      const warehouseProduct = warehouseProductsStore.warehouseProducts.find(
        (wp) =>
          wp.product_id === product.id &&
          wp.warehouse_id === selectedWarehouseId.value,
      )

      if (!warehouseProduct || warehouseProduct.id == null) {
        toast.error('Product not found in selected warehouse')
        return
      }

      result = await reservedProductsStore.createReservedProduct({
        warehouse_products_id: warehouseProduct.id,
        customer_id: reservationCustomerId.value,
        reserved_qty: reservationQuantity.value,
      })
    } else {
      // Main warehouse (no specific warehouse selected): ensure a main-warehouse
      // warehouse_products row exists (warehouse_id NULL, is_main_warehouse true),
      // then reference it from the reservation.
      const warehouseProductsStore = useWarehouseProductsDataStore()

      // Refresh the main-warehouse product rows so we can reuse an existing row.
      const mainProducts = await warehouseProductsStore.fetchMainWarehouseProducts()
      let warehouseProduct = mainProducts.find(
        (wp) => wp.product_id === product.id && wp.warehouse_id == null && wp.is_main_warehouse,
      )

      if (!warehouseProduct) {
        warehouseProduct = await warehouseProductsStore.createWarehouseProduct({
          product_id: product.id,
          warehouse_id: null,
          is_main_warehouse: true,
          total_qty: product.current_stock ?? null,
        })

        if (!warehouseProduct || warehouseProduct.id == null) {
          toast.error('Failed to set up main warehouse product')
          return
        }
      }

      if (warehouseProduct.id == null) {
        toast.error('Product not found in main warehouse')
        return
      }

      result = await reservedProductsStore.createReservedProduct({
        warehouse_products_id: warehouseProduct.id,
        customer_id: reservationCustomerId.value,
        reserved_qty: reservationQuantity.value,
      })
    }

    if (result) {
      toast.success('Reservation added successfully')
      showAddReservationDialog.value = false

      // Refresh warehouse stock and reservations
      if (selectedWarehouseId.value) {
        await setWarehouseFilter(selectedWarehouseId.value)
      } else {
        await fetchMainWarehouseReservations()
      }
    } else {
      toast.error('Failed to add reservation')
    }
  }

  // Lifecycle
  onMounted(async () => {
    await refreshStockStatusCounts()
    await fetchProducts()
    await fetchMainWarehouseReservations()
    productsStore.startRealtime()
  })

  // Clear stale selection state when dialogs close
  watch(showStockDialog, (open) => {
    if (!open) {
      selectedReorderProductIds.value = []
    }
  })
  watch(showPurchaseRequisitionDialog, (open) => {
    if (!open) {
      prefillItemsForDialog.value = []
    }
  })
  watch(showAddReservationDialog, (open) => {
    if (!open) {
      selectedProductForReservation.value = null
      reservationCustomerId.value = null
      reservationQuantity.value = 0
    }
  })
  watch(expiryFilterValue, (val) => {
    // Only refetch on a real clear ('') or a fully-formed 'YYYY-MM' value —
    // ignore any transient partial state the native month picker might emit.
    if (val !== '' && !/^\d{4}-\d{2}$/.test(val)) return
    page.value = 1
    fetchProducts()
  })

  // Refetch when the product type filter changes
  watch(typeFilter, () => {
    page.value = 1
    handleSearch()
  })

  // Re-fetch card counts when the reference month or ignore list changes
  watch([expiryFilterValue, () => productIgnore.activeIgnoredIdsArray.value], () => {
    refreshStockStatusCounts()
  })

  // Fetch the dialog's row list the moment it opens, or when the bucket changes while open
  watch([showStockDialog, stockDialogType], ([open]) => {
    if (open) {
      stockDialogPage.value = 1
      stockDialogSearchQuery.value = ''
      refreshStockDialogProducts()
    }
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
    typeFilter,
    itemsPerPage,
    page,
    sortBy,
    expanded,
    showStockDialog,
    stockDialogType,
    selectedWarehouseId,
    showAddReservationDialog,
    selectedProductForReservation,
    reservationCustomerId,
    reservationQuantity,
    // Computed
    headers,
    products,
    loading,
    totalProducts,
    stockStatusCards,
    activeStockCard,
    stockDialogProducts,
    stockDialogSearchQuery,
    stockDialogPage,
    stockDialogItemsPerPage,
    stockDialogTotal,
    stockDialogLoading,
    stockDialogTotalPages,
    searchStockDialogProducts,
    handleStockDialogPageChange,
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
    getMainWarehouseStock,
    removeReservation,
    addReservation,
    fetchMainWarehouseReservations,
    openAddReservationDialog,
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
    refreshStockStatusCounts,
    refreshStockDialogProducts,
  }
}
