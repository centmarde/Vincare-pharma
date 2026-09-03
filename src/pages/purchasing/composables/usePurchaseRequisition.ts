import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import { useProductsDataStore } from '@/stores/productsData'
import { useLogRequisition } from './useLogRequisition'
import { useToast } from 'vue-toastification'
import { ref, computed } from 'vue'
import { useFormDraft } from '@/composables/useFormDraft'

export const unitOptions = ['Box', 'Pcs', 'Set', 'Unit', 'Kg', 'M']

type PRFormItem = {
  no: number
  unit: string
  item_description: string
  supplier_id: number | null
  qty: number
  cost_per_unit: number
  expiry_date: Date | null
  product_id?: number | null // NEW
  reorder_request_id?: number | null // NEW — tracked so we can resolve it after save
  reorder_reason?: 'reorder_outofstock' | 'reorder_lowstock' | 'reorder_expiring' | 'reorder_expired' | null // NEW — set only when no reorder row exists yet and one should be created on successful submit
}

type SubmitResult = { success: boolean; resolvedReorderIds: number[]; productIds: number[] }

export type ReorderPrefillItem = {
  reorder_request_id?: number | null   // CHANGED — optional now. Only set when the row already exists.
  reorder_reason?: 'reorder_outofstock' | 'reorder_lowstock' | 'reorder_expiring' | 'reorder_expired' | null // NEW
  product_id: number
  item_description: string
  unit: string
  supplier_id: number | null
  cost_per_unit: number
}

// Add near the top of usePurchaseRequisition.ts
function toLocalISODate(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function usePurchaseRequisition() {
  const toast = useToast()
  const prStore = usePurchaseRequisitionStore()
  const { logPRSubmission } = useLogRequisition()

  // ─── State ────────────────────────────────────────────────────────
  const loading = ref(false)

  const currentPR = ref({
    remarks: '',
  })

  const items = ref<PRFormItem[]>([])

  // Persist a draft so a reload / crash mid-entry doesn't wipe the requisition.
  // expiry_date is a Date; JSON stores it as an ISO string, so revive it on
  // restore or the datepicker's .getFullYear()/.getMonth() calls would crash.
  const draft = useFormDraft({
    key: 'purchasing-requisition',
    version: 2,
    refs: { currentPR, items },
    isEmpty: () => !currentPR.value.remarks
      && !items.value.some((i) => i.item_description.trim() || i.supplier_id != null
        || i.qty > 0 || i.cost_per_unit > 0 || i.expiry_date != null),
    deserialize: (data) => ({
      ...data,
      items: Array.isArray(data.items)
        ? (data.items as PRFormItem[]).map((i) => ({
            ...i,
            expiry_date: i.expiry_date ? new Date(i.expiry_date as unknown as string) : null,
          }))
        : data.items,
    }),
  })

  // ─── Computed ─────────────────────────────────────────────────────
  const companyCostTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)
  )

  // ─── Item Actions ─────────────────────────────────────────────────
  function addItem() {
    items.value.push({
      no:               items.value.length + 1,
      unit:             'Box',
      item_description: '',
      qty:              0,
      cost_per_unit:    0,
      supplier_id:      null,
      expiry_date:      null,
    })
  }

  function removeItem(index: number) {
    items.value.splice(index, 1)
    items.value.forEach((item, i) => (item.no = i + 1))
  }

  function addReorderItems(entries: ReorderPrefillItem[]) {
    // Drop the single blank starter row if it hasn't been touched
    if (
      items.value.length === 1 &&
      !items.value[0].item_description.trim() &&
      !items.value[0].qty
    ) {
      items.value = []
    }

    entries.forEach(entry => {
      items.value.push({
        no:                 items.value.length + 1,
        unit:               entry.unit || 'Box',
        item_description:   entry.item_description,
        qty:                0,
        cost_per_unit:      entry.cost_per_unit,
        supplier_id:        entry.supplier_id,
        expiry_date:        null, // still needs to be picked — batch-specific
        product_id:         entry.product_id,
        reorder_request_id: entry.reorder_request_id,
        reorder_reason:     entry.reorder_reason ?? null,   // NEW
      })
    })
  }

  // ─── Submit ───────────────────────────────────────────────────────
  async function handleSubmit(): Promise<SubmitResult> {
    const validItems = items.value.filter(i => i.item_description.trim())
    if (!validItems.length) {
      toast.warning('Please add at least one item.')
      return { success: false, resolvedReorderIds: [], productIds: [] }
    }

    const rules: { check: (i: typeof validItems[number]) => boolean; message: string }[] = [
      { check: i => !i.item_description.trim(), message: 'description' },
      { check: i => !i.supplier_id, message: 'supplier' },
      { check: i => !i.expiry_date, message: 'expiry date' },
      { check: i => i.qty <= 0, message: 'quantity greater than zero' },
      { check: i => i.cost_per_unit <= 0, message: 'cost per unit greater than zero' },
    ]

    const failedMessages = rules
      .filter(rule => validItems.some(rule.check))
      .map(rule => rule.message)

    if (failedMessages.length) {
      toast.info(`Please provide ${failedMessages.join(', ')} for each item.`)
      return { success: false, resolvedReorderIds: [], productIds: [] }
    }

    loading.value = true

    const productsStore = useProductsDataStore()

    for (const item of validItems) {
      if (item.reorder_reason && item.product_id != null && item.reorder_request_id == null) {
        const result = await productsStore.createReorderRequest({
          product_id: item.product_id,
          reason:     item.reorder_reason,
        })
        if (result.success && result.id != null) {
          item.reorder_request_id = result.id
        }
      }
    }

    // Sync to store state so savePurchaseRequisition can read it
    prStore.currentPR.remarks     = currentPR.value.remarks || null
    prStore.currentPR.supplier_id = null
    prStore.items                 = validItems.map(i => ({
      no:               i.no,
      unit:             i.unit,
      item_description: i.item_description,
      qty:              i.qty,
      cost_per_unit:    i.cost_per_unit,
      supplier_id:      i.supplier_id != null ? String(i.supplier_id) : null,
      expiry_date:      i.expiry_date ? toLocalISODate(i.expiry_date) : null,
      product_id:       i.product_id ?? undefined,
      reorder_request_id: i.reorder_request_id ?? null,
    }))

    const resolvedReorderIds = validItems
      .map(i => i.reorder_request_id)
      .filter((id): id is number => id != null)

    // The actual products being requisitioned — flagged for reorder once the PR
    // is accepted, so the warehouse/reorder views keep showing them until the
    // order is delivered.
    const productIds = validItems
      .map(i => i.product_id)
      .filter((id): id is number => id != null)

    const result = await prStore.savePurchaseRequisition()

    loading.value = false

    if (result?.success && result.transactionId && result.requisitionNo) {
      await logPRSubmission(
        result.transactionId,
        result.requisitionNo,
        'purchase_requisition',
        validItems.length,
      )

      // Submitted products are now being re-ordered — persist is_reorder = true
      // and keep the local products list / currentProduct in sync.
      await productsStore.setProductsReorderFlag(productIds, true)

      draft.clear()
      reset()
      return { success: true, resolvedReorderIds, productIds }
    }

    // NOTE: if savePurchaseRequisition fails here, any reorder rows created
    // above are now orphaned as 'pending' with no PR attached. They're
    // low-risk (each item's reorder_request_id is now set, so retrying this
    // same submit won't create duplicates) but worth a follow-up cleanup pass
    // if PR-save failures turn out to be common.
    return { success: false, resolvedReorderIds: [], productIds: [] }
  }

  // ─── Reset ────────────────────────────────────────────────────────
  function reset() {
    currentPR.value = { remarks: '' }
    items.value     = []
    addItem()
  }

  // ─── Clear form (single blank row, no draft) ──────────────────────
  function clearForm() {
    currentPR.value = { remarks: '' }
    items.value     = []
    addItem()
    draft.clear()
  }

  // ─── Init ─────────────────────────────────────────────────────────
  // Restore a saved draft first; only seed an empty row if there's nothing to restore.
const draftWasRestored = draft.restore()
if (!draftWasRestored && items.value.length === 0) addItem()


  return {
    currentPR,
    items,
    loading,
    companyCostTotal,
    addReorderItems,
    addItem,
    removeItem,
    handleSubmit,
    reset,
    clearForm,
    draftWasRestored,
  }
}
