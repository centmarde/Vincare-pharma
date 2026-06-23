import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useStockTransfersDataStore } from '@/stores/stockTransfersData'
import { useOutletsDataStore } from '@/stores/outletsData'
import { useProductsDataStore } from '@/stores/productsData'

const toast = useToast()

type RequestLineItem = {
  product_id: number | null
  requested_qty: number
}

export function useStockTransferRequest(onCreated: () => void) {
  const transfersStore = useStockTransfersDataStore()
  const outletsStore   = useOutletsDataStore()
  const productsStore  = useProductsDataStore()

  const { outlets } = storeToRefs(outletsStore)
  const { products } = storeToRefs(productsStore)

  // ─── State ────────────────────────────────────────────────────────
  const loading  = ref(false)
  const outletId = ref<number | null>(null)
  const remarks   = ref('')
  const items     = ref<RequestLineItem[]>([])

  // ─── Computed ─────────────────────────────────────────────────────
  const outletOptions = computed(() =>
    outlets.value.map(o => ({ title: o.name ?? '—', value: o.id }))
  )

  const productOptions = computed(() =>
    products.value.map(p => ({
      title: `${p.product_name ?? '—'}${p.sku ? ` (${p.sku})` : ''}`,
      value: p.id,
      current_stock: p.current_stock ?? 0,
    }))
  )

  const validItems = computed(() =>
    items.value.filter(i => i.product_id != null && i.requested_qty > 0)
  )

  // ─── Item Actions ─────────────────────────────────────────────────
  function addItem() {
    items.value.push({ product_id: null, requested_qty: 1 })
  }

  function removeItem(index: number) {
    items.value.splice(index, 1)
  }

  // ─── Submit ───────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!outletId.value) {
      toast.warning('Please select an outlet.')
      return
    }

    if (!validItems.value.length) {
      toast.warning('Add at least one product with a quantity greater than 0.')
      return
    }

    loading.value = true

    const result = await transfersStore.createTransferRequest(
      outletId.value,
      validItems.value.map(i => ({ product_id: i.product_id!, requested_qty: i.requested_qty })),
      remarks.value || undefined,
    )

    loading.value = false

    if (result.success) {
      reset()
      onCreated()
    }
  }

  // ─── Reset ────────────────────────────────────────────────────────
  function reset() {
    outletId.value = null
    remarks.value   = ''
    items.value     = []
    addItem()
  }

  // ─── Init ─────────────────────────────────────────────────────────
  async function init() {
    if (!outlets.value.length) await outletsStore.fetchOutlets({ activeOnly: true })
    if (!products.value.length) await productsStore.fetchProducts()
    if (items.value.length === 0) addItem()
  }

  return {
    loading, outletId, remarks, items,
    outletOptions, productOptions, validItems,
    addItem, removeItem, handleSubmit, reset, init,
  }
}
