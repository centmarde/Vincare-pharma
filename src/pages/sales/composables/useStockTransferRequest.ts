import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useStockTransfersDataStore } from '@/stores/stockTransfersData'
import type { ProductPickerResult } from '@/stores/productsData'
import { useWarehousesDataStore } from '@/stores/warehouseData'
import type { WarehouseType } from '@/stores/warehouseData'
import { useFormDraft } from '@/composables/useFormDraft'

const toast = useToast()

type RequestLineItem = {
  product_id: number | null
  // Held on the line rather than looked up from the products store, which only
  // ever returns the first 1,000 of 2,401 rows (Supabase caps an unranged
  // request) — a product picked through the search dialog is usually not in it.
  product_name: string
  brand: string | null
  unit: string
  requested_qty: number
}

export function useStockTransferRequest(onCreated: () => void) {
  const transfersStore = useStockTransfersDataStore()
  const warehouseStore = useWarehousesDataStore()

  const { warehouses } = storeToRefs(warehouseStore)

  // ─── State ────────────────────────────────────────────────────────
  const loading = ref(false)
  const warehouseId = ref<number | null>(null)
  const remarks = ref('')
  const items   = ref<RequestLineItem[]>([])

  // Persist a draft so a reload / crash mid-entry doesn't wipe the request.
  const draft = useFormDraft({
    key: 'stock-transfer-request',
    // v3: the destination moved from an outlet to a warehouse. Bumping discards
    // older drafts rather than restoring one carrying a dead outletId.
    version: 3,
    refs: { warehouseId, remarks, items },
    isEmpty: () => warehouseId.value == null && !remarks.value
      && !items.value.some((i) => i.product_id != null),
  })

  // ─── Computed ─────────────────────────────────────────────────────
  // Destination is any warehouse. No is_active filter -- `warehouses` has no
  // such column (schema finalised), unlike the outlets table this replaced.
  const warehouseOptions = computed(() =>
    warehouses.value.map((w: WarehouseType) => ({ title: w.name, value: w.id })),
  )

  const validItems = computed(() =>
    items.value.filter(i => i.product_id != null && i.requested_qty > 0)
  )

  // ─── Item Actions ─────────────────────────────────────────────────
  function addItem() {
    items.value.push({
      product_id: null, product_name: '', brand: null, unit: '', requested_qty: 1,
    })
  }

  function applyPickedProduct(index: number, product: ProductPickerResult) {
    const item = items.value[index]
    if (!item) return
    item.product_id   = product.id
    item.product_name = product.product_name ?? ''
    item.brand        = product.brand
    item.unit         = product.unit ?? ''
  }

  function removeItem(index: number) {
    items.value.splice(index, 1)
  }

  // ─── Submit ───────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!warehouseId.value) {
      toast.warning('Please select a destination warehouse.')
      return
    }
    if (!validItems.value.length) {
      toast.warning('Add at least one product with a quantity greater than 0.')
      return
    }

    loading.value = true
    const result = await transfersStore.createTransferRequest(
      warehouseId.value,
      validItems.value.map(i => ({ product_id: i.product_id!, requested_qty: i.requested_qty })),
      remarks.value || undefined,
    )
    loading.value = false

    if (result.success) {
      draft.clear()
      reset()
      onCreated()
    }
  }

  // ─── Reset ────────────────────────────────────────────────────────
  function reset() {
    warehouseId.value = null
    remarks.value = ''
    items.value = []
    addItem()
  }

  // ─── Init ─────────────────────────────────────────────────────────
  async function init() {
    if (!warehouses.value.length) await warehouseStore.fetchWarehouses()
    // Restore a saved draft first; only seed an empty row if there's nothing to restore.
    if (!draft.restore() && items.value.length === 0) addItem()
  }

  return {
    loading, warehouseId, remarks, items,
    warehouseOptions, validItems,
    addItem, removeItem, applyPickedProduct, handleSubmit, reset, init,
  }
}
