// composables/useProductCreateForm.ts
//
// Create-only slice of useProductsWidget. The Purchase Requisition page needs
// to let Admins/Super Admins add a product inline (a PR often requisitions a
// product that does not exist yet), but pulling in the whole products widget
// would drag along stock dialogs, reorder/disposal logic and warehouse filters
// the PR page has no use for. This keeps only the create-dialog state + submit
// so the same ProductFormDialog can be reused without the baggage.
import { computed, ref } from 'vue'
import { useToast } from 'vue-toastification'
import {
  useProductsDataStore,
  type CreateProductData,
  type UpdateProductData,
} from '@/stores/productsData'
import { useLogsDataStore } from '@/stores/logsData'

export const categoryOptions = [
  'Oral Medicines', 'Injectables','Medical Supplies','Laboratory Supplies','Dental Supplies','Dental Instruments','Medical Device','TOPICAL','Ophthalmic/Otic','Veterinary','Vitamins and Supplements','Surgical Supplies','Diagnostic Reagents','Disinfectants and Antiseptics','Contraceptives',
]

export const unitOptions = [
  'Ampoule','Bag','Blister','Bottle','Box','Canister','Capsule','Carton','Gallon','Jar','Kit','Nebule','Pack','Pair','Pcs','Piece','Roll','Sachet','Set','Strip','Suppository','Tablet','Tray','Tube','Unit','Vial',
]

const emptyForm = (): CreateProductData & UpdateProductData => ({
  barcode: '',
  sku: '',
  product_name: '',
  category: null,
  unit: null,
  brand: null,
  cost_price: null,
  selling_price: null,
  current_stock: null,
  reorder_level: null,
  supplier_id: null,
  batch_no: null,
  expiry_date: '',
  status: 'Active',
})

export function useProductCreateForm() {
  const toast = useToast()
  const productsStore = useProductsDataStore()
  const logsStore = useLogsDataStore()

  // Dialog state
  const showDialog = ref(false)
  const form = ref<any>(null)
  const dialogMode = ref<'create' | 'edit'>('create')
  const productForm = ref<CreateProductData & UpdateProductData>(emptyForm())
  const loading = computed(() => productsStore.loading)

  // Validation rules (identical to useProductsWidget)
  const rules = {
    required: (value: any) => !!value || 'Field is required',
    positiveNumber: (value: number | null) =>
      value === null || value >= 0 || 'Must be a positive number',
  }

  function openCreateDialog() {
    dialogMode.value = 'create'
    productForm.value = emptyForm()
    form.value?.resetValidation()
    showDialog.value = true
  }

  function closeDialog() {
    showDialog.value = false
  }

  async function handleSubmit() {
    if (!form.value) return
    const { valid } = await form.value.validate()
    if (!valid) return

    if (!productForm.value.sku || !productForm.value.product_name) return

    const cleaned: Record<string, any> = {}
    for (const [key, value] of Object.entries(productForm.value)) {
      cleaned[key] = value === '' ? null : value
    }

    const result = await productsStore.createProduct(cleaned as CreateProductData)
    if (result) {
      toast.success('Product created successfully')

      // Refresh the product picker so a just-created product is immediately
      // selectable in the requisition form. The picker reads its own
      // RPC-backed state (pickerProducts), so refetch it with the picker's
      // defaults (main warehouse, first page) — matches ProductPicker.vue.
      try {
        await productsStore.fetchProductPicker({ search: '', limit: 15, locationId: null })
      } catch (pickerErr) {
        console.error('[useProductCreateForm] Failed to refresh product picker:', pickerErr)
      }

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
  }

  return {
    showDialog,
    form,
    dialogMode,
    productForm,
    loading,
    rules,
    openCreateDialog,
    closeDialog,
    handleSubmit,
  }
}
