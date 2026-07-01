// composables/useProductsWidget.ts
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import {
  useProductsDataStore,
  type ProductType,
  type CreateProductData,
  type UpdateProductData,
} from '@/stores/productsData'
import { useTransactionsDataStore } from '@/stores/transactionsData'
import { useTransactionItemsDataStore } from '@/stores/transactionsItemsData'

export function useProductsWidget() {
  const toast = useToast()
  const productsStore = useProductsDataStore()
  const transactionsStore = useTransactionsDataStore()
  const transactionItemsStore = useTransactionItemsDataStore()

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
    actual_count: null,
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

  const sortedProducts = computed(() =>
    [...products.value].sort((a, b) => {
      const aLow = (a.reorder_level ?? 0) > 0 && (a.current_stock ?? 0) <= (a.reorder_level ?? 0)
      const bLow = (b.reorder_level ?? 0) > 0 && (b.current_stock ?? 0) <= (b.reorder_level ?? 0)
      if (aLow && !bLow) return -1
      if (!aLow && bLow) return 1
      return (a.current_stock ?? 0) - (b.current_stock ?? 0)
    })
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
      const stockInTxs = await transactionsStore.fetchTransactions({ transaction_type: 'stock_in' })
      if (!stockInTxs?.length) {
        eligibleProductIds.value = new Set()
        return
      }
      const productIds = new Set<number>()
      for (const tx of stockInTxs) {
        const items = await transactionItemsStore.fetchTransactionItems({ transaction_id: tx.id })
        items?.forEach(item => { if (item.product_id) productIds.add(item.product_id) })
      }
      eligibleProductIds.value = productIds
      console.log('[ProductsWidget] Eligible product IDs from stock_in transactions:', [...productIds])
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
        closeDialog()
      } else {
        toast.error('Failed to create product: ' + (productsStore.error || 'Unknown error'))
      }
    } else if (dialogMode.value === 'edit' && currentProduct.value) {
      const result = await productsStore.updateProduct(currentProduct.value.id, cleaned as UpdateProductData)
      if (result) {
        toast.success('Product updated successfully')
        closeDialog()
      } else {
        toast.error('Failed to update product: ' + (productsStore.error || 'Unknown error'))
      }
    }
  }

  async function handleDelete() {
    if (!currentProduct.value) return
    const result = await productsStore.deleteProduct(currentProduct.value.id)
    if (result) {
      toast.success('Product deleted successfully')
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
    // Computed
    headers,
    products,
    loading,
    totalProducts,
    lowStockProducts,
    sortedProducts,
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