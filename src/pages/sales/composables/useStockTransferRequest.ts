import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useStockTransfersDataStore } from '@/stores/stockTransfersData'
import type { StockTransferType } from '@/stores/stockTransfersData'
import type { ProductPickerResult } from '@/stores/productsData'
import { useWarehousesDataStore } from '@/stores/warehouseData'
import type { WarehouseType } from '@/stores/warehouseData'
import { useFormDraft } from '@/composables/useFormDraft'
import { useConfirmDialog } from '@/composables/useConfirmDialog'

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
  // The saved draft being edited, or null for a brand-new request.
  const draftId = ref<number | null>(null)
  const isEditingDraft = computed(() => draftId.value !== null)
  const { confirmDialog } = useConfirmDialog()

  // Persist a draft so a reload / crash mid-entry doesn't wipe the request.
  const draft = useFormDraft({
    key: 'stock-transfer-request',
    // v3: the destination moved from an outlet to a warehouse. Bumping discards
    // older drafts rather than restoring one carrying a dead outletId.
    version: 3,
    refs: { warehouseId, remarks, items },
    isEmpty: () => warehouseId.value == null && !remarks.value
      && !items.value.some((i) => i.product_id != null),
    // Off while a SAVED draft is open: it already lives in the database, and
    // autosaving it here would restore it into the next NEW request — a second
    // copy that could be submitted alongside the draft.
    enabled: () => draftId.value === null,
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

  const lineInputs = () =>
    validItems.value.map(i => ({ product_id: i.product_id!, requested_qty: i.requested_qty }))

  function finish() {
    draft.clear()
    reset()
    onCreated()
  }

  // ─── Submit ───────────────────────────────────────────────────────
  async function handleSubmit() {
    // One action at a time: a second click while one is in flight would save,
    // submit or delete twice.
    if (loading.value) return
    if (!warehouseId.value) {
      toast.warning('Please select a destination warehouse.')
      return
    }
    if (!validItems.value.length) {
      toast.warning('Add at least one product with a quantity greater than 0.')
      return
    }

    loading.value = true
    let success: boolean
    if (draftId.value !== null) {
      // A draft is saved first so what goes for approval is exactly what is on
      // screen, then submitted — which mints its ST number.
      const saved = await transfersStore.saveTransferDraft(
        { draftId: draftId.value, warehouseId: warehouseId.value, items: lineInputs(), remarks: remarks.value },
        { silent: true },
      )
      success = saved.success && (await transfersStore.submitTransferDraft(draftId.value)).success
    } else {
      success = (await transfersStore.createTransferRequest(
        warehouseId.value, lineInputs(), remarks.value || undefined,
      )).success
    }
    loading.value = false
    if (success) finish()
  }

  // ─── Drafts ───────────────────────────────────────────────────────
  /** Save without sending for approval. The warehouse may still be blank. */
  async function saveAsDraft() {
    if (loading.value) return
    if (!validItems.value.length) {
      toast.warning('Add at least one product with a quantity greater than 0.')
      return
    }
    loading.value = true
    const result = await transfersStore.saveTransferDraft({
      draftId: draftId.value, warehouseId: warehouseId.value, items: lineInputs(), remarks: remarks.value,
    })
    loading.value = false
    if (result.success) finish()
  }

  async function discardDraft() {
    if (loading.value || draftId.value === null) return
    const ok = await confirmDialog('Delete this draft? This cannot be undone.', {
      title: 'Delete draft', confirmText: 'Delete',
    })
    if (!ok) return
    loading.value = true
    const result = await transfersStore.deleteTransferDraft(draftId.value)
    loading.value = false
    if (result.success) finish()
  }

  /** Open a saved draft in the form, lines and all. */
  function loadDraft(transfer: StockTransferType) {
    draftId.value = transfer.id
    warehouseId.value = transfer.warehouse_id
    remarks.value = transfer.remarks ?? ''
    items.value = (transfer.stock_transfer_items ?? []).map((line) => ({
      product_id: line.product_id,
      product_name: line.product?.product_name ?? '',
      brand: line.product?.brand ?? null,
      unit: line.product?.unit ?? '',
      requested_qty: line.requested_qty ?? 1,
    }))
    if (!items.value.length) addItem()
  }

  // ─── Reset ────────────────────────────────────────────────────────
  function reset() {
    draftId.value = null
    warehouseId.value = null
    remarks.value = ''
    items.value = []
    addItem()
  }

  // ─── Init ─────────────────────────────────────────────────────────
  /** `fromDraft` opens a saved draft; otherwise a new request (restoring any unsaved entry). */
  async function init(fromDraft: StockTransferType | null = null) {
    if (!warehouses.value.length) await warehouseStore.fetchWarehouses()
    if (fromDraft) {
      loadDraft(fromDraft)
      return
    }
    // Coming back from editing a draft: start clean rather than showing it.
    if (draftId.value !== null) reset()
    // Restore a saved draft first; only seed an empty row if there's nothing to restore.
    if (!draft.restore() && items.value.length === 0) addItem()
  }

  return {
    loading, warehouseId, remarks, items, isEditingDraft,
    warehouseOptions, validItems,
    addItem, removeItem, applyPickedProduct, handleSubmit, saveAsDraft, discardDraft, reset, init,
  }
}
