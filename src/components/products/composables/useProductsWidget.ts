// composables/useProductsWidget.ts
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import {
  useProductsDataStore,
  type ProductType,
  type CreateProductData,
  type UpdateProductData,
} from '@/stores/productsData'
import { useLogsDataStore } from '@/stores/logsData'

export function useProductsWidget() {
  const toast = useToast()
  const productsStore = useProductsDataStore()
  const logsStore = useLogsDataStore()

  // Dialog states
  const showDialog = ref(false)
  const showDeleteDialog = ref(false)
  const dialogMode = ref<'create' | 'edit'>('create')


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

  // Stock status dialog
  const showStockDialog = ref(false)
  const stockDialogType = ref<'out-of-stock' | 'low-stock'>('out-of-stock')

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
    { title: 'Cost Price', key: 'cost_price', sortable: true },
    { title: 'Batch No.', key: 'batch_no' },
    { title: 'Expiry Date', key: 'expiry_date' },
    { title: 'Actions', key: 'actions', sortable: false },
  ])

  // Computed
  const products = computed(() =>
    productsStore.products.filter(
      p => p.sku != null && p.sku !== 'null' && eligibleProductIds.value.has(p.id)
    )
  )

  const loading = computed(() => productsStore.loading)
  const totalProducts = computed(() => productsStore.totalCount)

  const lowStockProducts = computed(() =>
    products.value.filter(p => {
      const stock = p.current_stock ?? 0
      const reorder = p.reorder_level ?? 0
      return reorder > 0 && stock <= reorder
    })
  )

  // All-products stock status counts (not paginated, from the full store)
  const allEligibleProducts = computed(() =>
    productsStore.products.filter(
      p => p.sku != null && p.sku !== 'null' && eligibleProductIds.value.has(p.id)
    )
  )

  const allOutOfStockCount = computed(
    () => allEligibleProducts.value.filter(p => (p.current_stock ?? 0) <= 0).length
  )

  const allLowStockCount = computed(
    () => allEligibleProducts.value.filter(p => {
      const stock = p.current_stock ?? 0
      return stock > 0 && p.reorder_level && stock <= p.reorder_level
    }).length
  )

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
      console.log('[ProductsWidget] Eligible product IDs from stock_in transactions:', ids)
    } catch (err) {
      console.error('[ProductsWidget] Failed to fetch eligible product IDs:', err)
      eligibleProductIds.value = new Set()
    }
  }

  async function fetchProducts() {
    await productsStore.fetchProducts({
      search: searchQuery.value,
      orderBy: (sortBy.value[0]?.key as any) || 'created_at',
      ascending: sortBy.value[0]?.order === 'asc',
      limit: itemsPerPage.value,
      offset: (page.value - 1) * itemsPerPage.value,
      eligibleIds: [...eligibleProductIds.value],
    })
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
      const result = await productsStore.updateProduct(currentProduct.value.id, cleaned as UpdateProductData)
      if (result) {
        toast.success('Product updated successfully')
        try {
          const changes: string[] = []
          if (oldData.current_stock !== result.current_stock) changes.push(`stock=${oldData.current_stock ?? 'N/A'} → ${result.current_stock ?? 'N/A'}`)
          if (oldData.cost_price !== result.cost_price) changes.push(`cost_price=${oldData.cost_price ?? 'N/A'} → ${result.cost_price ?? 'N/A'}`)
          if (oldData.selling_price !== result.selling_price) changes.push(`selling_price=${oldData.selling_price ?? 'N/A'} → ${result.selling_price ?? 'N/A'}`)
          if (oldData.reorder_level !== result.reorder_level) changes.push(`reorder_level=${oldData.reorder_level ?? 'N/A'} → ${result.reorder_level ?? 'N/A'}`)
          if (oldData.offer_per_unit !== result.offer_per_unit) changes.push(`offer_per_unit=${oldData.offer_per_unit ?? 'N/A'} → ${result.offer_per_unit ?? 'N/A'}`)
          if (oldData.cost_per_unit !== result.cost_per_unit) changes.push(`cost_per_unit=${oldData.cost_per_unit ?? 'N/A'} → ${result.cost_per_unit ?? 'N/A'}`)
          if (oldData.supplier_id !== result.supplier_id) changes.push(`supplier_id=${oldData.supplier_id ?? 'N/A'} → ${result.supplier_id ?? 'N/A'}`)
          if (oldData.batch_no !== result.batch_no) changes.push(`batch_no=${oldData.batch_no ?? 'N/A'} → ${result.batch_no ?? 'N/A'}`)
          if (oldData.expiry_date !== result.expiry_date) changes.push(`expiry_date=${oldData.expiry_date ?? 'N/A'} → ${result.expiry_date ?? 'N/A'}`)
          if (oldData.status !== result.status) changes.push(`status=${oldData.status ?? 'N/A'} → ${result.status ?? 'N/A'}`)
          if (oldData.item_decription !== result.item_decription) changes.push(`item_description=${oldData.item_decription ?? 'N/A'} → ${result.item_decription ?? 'N/A'}`)
          if (oldData.unit !== result.unit) changes.push(`unit=${oldData.unit ?? 'N/A'} → ${result.unit ?? 'N/A'}`)
          if (oldData.no !== result.no) changes.push(`no=${oldData.no ?? 'N/A'} → ${result.no ?? 'N/A'}`)
          if (oldData.barcode !== result.barcode) changes.push(`barcode=${oldData.barcode ?? 'N/A'} → ${result.barcode ?? 'N/A'}`)
          if (oldData.product_name !== result.product_name) changes.push(`product_name="${oldData.product_name ?? 'N/A'}" → "${result.product_name ?? 'N/A'}"`)
          if (oldData.generic_name !== result.generic_name) changes.push(`generic_name="${oldData.generic_name ?? 'N/A'}" → "${result.generic_name ?? 'N/A'}"`)
          if (oldData.category !== result.category) changes.push(`category="${oldData.category ?? 'N/A'}" → "${result.category ?? 'N/A'}"`)
          if (oldData.sku !== result.sku) changes.push(`sku="${oldData.sku ?? 'N/A'}" → "${result.sku ?? 'N/A'}"`)

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
    fetchProducts()
  }

  async function handleTableOptions(options: any) {
    page.value = options.page
    itemsPerPage.value = options.itemsPerPage
    sortBy.value = options.sortBy
    await fetchProducts()
  }

  // Lifecycle
  onMounted(async () => {
    await fetchEligibleProductIds()
    await fetchProducts()
    productsStore.startRealtime()
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
    // Computed
    headers,
    products,
    loading,
    totalProducts,
    lowStockProducts,
    allOutOfStockCount,
    allLowStockCount,
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
    handleTableOptions,
  }
}
