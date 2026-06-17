<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useToast } from 'vue-toastification'
import { useProductsDataStore, type ProductType, type CreateProductData, type UpdateProductData } from '@/stores/productsData'

const toast = useToast()
const productsStore = useProductsDataStore()

// Dialog states
const showDialog = ref(false)
const showDeleteDialog = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')

// Form state
const form = ref<any>(null)
const productForm = ref<CreateProductData & UpdateProductData>({
  barcode: '',
  sku: '',
  product_name: '',
  generic_name: '',
  category: '',
  unit: null,
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

// Current product being edited/deleted
const currentProduct = ref<ProductType | null>(null)

// Search and filter state
const searchQuery = ref('')
const itemsPerPage = ref(10)
const page = ref(1)
const sortBy = ref([{ key: 'created_at', order: 'desc' as 'asc' | 'desc' }])

// Expanded rows state - store expanded item keys
const expanded = ref<string[]>([])

// Headers for the data table
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

// Computed properties
const products = computed(() => productsStore.products)
const loading = computed(() => productsStore.loading)
const totalProducts = computed(() => productsStore.productsCount)

// Validation rules
const rules = {
  required: (value: any) => !!value || 'Field is required',
  positiveNumber: (value: number | null) => value === null || value >= 0 || 'Must be a positive number',
}

// Methods
const openCreateDialog = () => {
  dialogMode.value = 'create'
  productForm.value = {
    barcode: '',
    sku: '',
    product_name: '',
    generic_name: '',
    category: '',
    unit: null,
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
  }
  currentProduct.value = null
  if (form.value) form.value.resetValidation()
  showDialog.value = true
}

const openEditDialog = (product: ProductType) => {
  dialogMode.value = 'edit'
  currentProduct.value = product
  productForm.value = {
    barcode: product.barcode,
    sku: product.sku,
    product_name: product.product_name,
    generic_name: product.generic_name,
    category: product.category,
    unit: product.unit,
    cost_price: product.cost_price,
    selling_price: product.selling_price,
    current_stock: product.current_stock,
    reorder_level: product.reorder_level,
    supplier_id: product.supplier_id,
    batch_no: product.batch_no,
    expiry_date: product.expiry_date,
    status: product.status,
    item_decription: product.item_decription,
    offer_per_unit: product.offer_per_unit,
    cost_per_unit: product.cost_per_unit,
    no: product.no,
  }
  if (form.value) form.value.resetValidation()
  showDialog.value = true
}

const openDeleteDialog = (product: ProductType) => {
  currentProduct.value = product
  showDeleteDialog.value = true
}

const closeDialog = () => {
  showDialog.value = false
  currentProduct.value = null
}

const closeDeleteDialog = () => {
  showDeleteDialog.value = false
  currentProduct.value = null
}

const handleSubmit = async () => {
  if (!form.value) return
  const { valid } = await form.value.validate()
  if (!valid) return

  if (dialogMode.value === 'create') {
    const result = await productsStore.createProduct(productForm.value as CreateProductData)
    if (result) {
      toast.success('Product created successfully')
      closeDialog()
    } else {
      toast.error('Failed to create product')
    }
  } else if (dialogMode.value === 'edit' && currentProduct.value) {
    const result = await productsStore.updateProduct(currentProduct.value.id, productForm.value as UpdateProductData)
    if (result) {
      toast.success('Product updated successfully')
      closeDialog()
    } else {
      toast.error('Failed to update product')
    }
  }
}

const handleDelete = async () => {
  if (!currentProduct.value) return

  const result = await productsStore.deleteProduct(currentProduct.value.id)
  if (result) {
    toast.success('Product deleted successfully')
    closeDeleteDialog()
  } else {
    toast.error('Failed to delete product')
  }
}

const handleSearch = () => {
  fetchProducts()
}

const fetchProducts = async () => {
  await productsStore.fetchProducts({
    search: searchQuery.value,
    orderBy: sortBy.value[0]?.key as any || 'created_at',
    ascending: sortBy.value[0]?.order === 'asc',
    limit: itemsPerPage.value,
    offset: (page.value - 1) * itemsPerPage.value,
  })
}

// Lifecycle
onMounted(() => {
  fetchProducts()
  productsStore.startRealtime()
})

</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center flex-wrap ga-3">
      <v-icon icon="mdi-package-variant" class="mr-2" color="primary"></v-icon>
      <span class="text-h5 font-weight-bold">Products</span>
      <v-spacer></v-spacer>
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
        <v-icon icon="mdi-plus" class="mr-2"></v-icon>
        Add Product
      </v-btn>
    </v-card-title>

    <v-divider></v-divider>

    <v-card-text class="pa-0">
      <v-data-table-server
        v-model:items-per-page="itemsPerPage"
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
        @update:options="fetchProducts"
      >
        <template #[`item.selling_price`]="{ value }">
          <span v-if="value != null">${{ Number(value).toFixed(2) }}</span>
          <span v-else class="text-grey">-</span>
        </template>

        <template #[`item.cost_price`]="{ value }">
          <span v-if="value != null">${{ Number(value).toFixed(2) }}</span>
          <span v-else class="text-grey">-</span>
        </template>

        <template #[`item.current_stock`]="{ value }">
          <v-chip
            :color="value && value > 10 ? 'success' : value && value > 0 ? 'warning' : 'error'"
            size="small"
            variant="outlined"
          >
            {{ value ?? 0 }}
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
                      <div class="text-body-1 font-weight-medium">
                        {{ item.barcode || 'N/A' }}
                      </div>
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
                      <div class="text-body-1 font-weight-medium">
                        {{ item.status || 'N/A' }}
                      </div>
                    </div>
                  </v-col>
                </v-row>
              </div>
            </td>
          </tr>
        </template>

        <template #[`item.actions`]="{ item }">
          <div class="d-flex ga-2">
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
    </v-card-text>
  </v-card>

  <!-- Create/Edit Dialog -->
  <v-dialog v-model="showDialog" max-width="800px" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon :icon="dialogMode === 'create' ? 'mdi-plus-circle' : 'mdi-pencil-circle'" class="mr-2" color="primary"></v-icon>
        <span class="text-h6 font-weight-bold">{{ dialogMode === 'create' ? 'Add New Product' : 'Edit Product' }}</span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="closeDialog"></v-btn>
      </v-card-title>

      <v-card-text>
        <v-form ref="form" @submit.prevent="handleSubmit">
          <v-row>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="productForm.product_name"
                label="Product Name"
                prepend-inner-icon="mdi-package-variant"
                variant="outlined"
                density="comfortable"
                :rules="[rules.required]"
                required
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="productForm.generic_name"
                label="Generic Name"
                prepend-inner-icon="mdi-label"
                variant="outlined"
                density="comfortable"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="productForm.barcode"
                label="Barcode"
                prepend-inner-icon="mdi-barcode"
                variant="outlined"
                density="comfortable"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="productForm.sku"
                label="SKU"
                prepend-inner-icon="mdi-tag"
                variant="outlined"
                density="comfortable"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="productForm.current_stock"
                label="Current Stock"
                type="number"
                prepend-inner-icon="mdi-numeric"
                variant="outlined"
                density="comfortable"
                :rules="[rules.positiveNumber]"
                min="0"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="productForm.cost_price"
                label="Cost Price"
                type="number"
                step="0.01"
                prepend-inner-icon="mdi-currency-usd"
                variant="outlined"
                density="comfortable"
                :rules="[rules.positiveNumber]"
                min="0"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="productForm.selling_price"
                label="Selling Price"
                type="number"
                step="0.01"
                prepend-inner-icon="mdi-currency-usd"
                variant="outlined"
                density="comfortable"
                :rules="[rules.positiveNumber]"
                min="0"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="productForm.category"
                label="Category"
                prepend-inner-icon="mdi-category"
                variant="outlined"
                density="comfortable"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="productForm.supplier_id"
                label="Supplier ID"
                type="number"
                prepend-inner-icon="mdi-truck-delivery"
                variant="outlined"
                density="comfortable"
                min="0"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="productForm.batch_no"
                label="Batch No."
                type="number"
                prepend-inner-icon="mdi-numeric"
                variant="outlined"
                density="comfortable"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="productForm.expiry_date"
                label="Expiry Date"
                type="date"
                prepend-inner-icon="mdi-calendar-clock"
                variant="outlined"
                density="comfortable"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="productForm.reorder_level"
                label="Reorder Level"
                type="number"
                step="0.01"
                prepend-inner-icon="mdi-alert"
                variant="outlined"
                density="comfortable"
                :rules="[rules.positiveNumber]"
                min="0"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="productForm.status"
                label="Status"
                prepend-inner-icon="mdi-information"
                variant="outlined"
                density="comfortable"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="productForm.item_decription"
                label="Item Description"
                prepend-inner-icon="mdi-text"
                variant="outlined"
                density="comfortable"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="productForm.offer_per_unit"
                label="Offer Per Unit"
                type="number"
                step="0.01"
                prepend-inner-icon="mdi-percent"
                variant="outlined"
                density="comfortable"
                :rules="[rules.positiveNumber]"
                min="0"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="productForm.cost_per_unit"
                label="Cost Per Unit"
                type="number"
                step="0.01"
                prepend-inner-icon="mdi-currency-usd"
                variant="outlined"
                density="comfortable"
                :rules="[rules.positiveNumber]"
                min="0"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="productForm.unit"
                label="Unit"
                type="number"
                prepend-inner-icon="mdi-counter"
                variant="outlined"
                density="comfortable"
                :rules="[rules.positiveNumber]"
                min="0"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="productForm.no"
                label="No."
                type="number"
                prepend-inner-icon="mdi-numeric"
                variant="outlined"
                density="comfortable"
                min="0"
              ></v-text-field>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer></v-spacer>
        <v-btn color="grey" variant="text" @click="closeDialog" :disabled="loading">
          Cancel
        </v-btn>
        <v-btn color="primary" variant="flat" @click="handleSubmit" :loading="loading">
          {{ dialogMode === 'create' ? 'Create' : 'Update' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Delete Confirmation Dialog -->
  <v-dialog v-model="showDeleteDialog" max-width="400px" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-alert-circle" class="mr-2" color="error"></v-icon>
        <span class="text-h6 font-weight-bold">Confirm Delete</span>
      </v-card-title>

      <v-card-text>
        <p>Are you sure you want to delete this product?</p>
        <p v-if="currentProduct" class="font-weight-bold mt-2">
          {{ currentProduct.product_name }} (ID: {{ currentProduct.id }})
        </p>
        <p class="text-caption text-grey mt-2">This action cannot be undone.</p>
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer></v-spacer>
        <v-btn color="grey" variant="text" @click="closeDeleteDialog" :disabled="loading">
          Cancel
        </v-btn>
        <v-btn color="error" variant="flat" @click="handleDelete" :loading="loading">
          Delete
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.max-width-300 {
  max-width: 300px;
}
</style>