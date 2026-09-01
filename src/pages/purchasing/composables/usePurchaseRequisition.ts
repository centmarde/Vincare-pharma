import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import { useProductsDataStore } from '@/stores/productsData'
import { useDraftPRDataStore } from '@/stores/draftPRData'
import { useLogRequisition } from './useLogRequisition'
import { useToast } from 'vue-toastification'
import { ref, computed } from 'vue'
import { useFormDraft } from '@/composables/useFormDraft'

export const unitOptions = ['Box', 'Pcs', 'Set', 'Unit', 'Kg', 'M']

type PRFormItem = {
  no: number
  unit: string
  product_name: string
  supplier_id: number | null
  qty: number
  cost_per_unit: number
  expiry_date: Date | null
  product_id?: number | null // NEW
  reorder_request_id?: number | null // NEW — tracked so we can resolve it after save
  reorder_reason?: 'reorder_outofstock' | 'reorder_lowstock' | 'reorder_expiring' | 'reorder_expired' | null // NEW — set only when no reorder row exists yet and one should be created on successful submit
}

type SubmitResult = {
  success: boolean
  resolvedReorderIds: number[]
  requisitionNos: string[]
}

export type ReorderPrefillItem = {
  reorder_request_id?: number | null   // CHANGED — optional now. Only set when the row already exists.
  reorder_reason?: 'reorder_outofstock' | 'reorder_lowstock' | 'reorder_expiring' | 'reorder_expired' | null // NEW
  product_id: number
  product_name: string
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

// new Date('2026-09-01') reads as UTC midnight and lands a day early west of Greenwich.
function fromLocalISODate(value: string): Date | null {
  const parts = value.split('-')
  if (parts.length !== 3) return null
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

type ReorderReason =
  | 'reorder_outofstock'
  | 'reorder_lowstock'
  | 'reorder_expiring'
  | 'reorder_expired'

const reorderReasons: ReorderReason[] = [
  'reorder_outofstock',
  'reorder_lowstock',
  'reorder_expiring',
  'reorder_expired',
]

function toReorderReason(value: string | null | undefined): ReorderReason | null {
  if (!value) return null
  return reorderReasons.find((reason) => reason === value) ?? null
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

  // Set while editing a saved draft so the next save updates it instead of creating a second one.
  const currentDraftId = ref<number | null>(null)

  // Persist a draft so a reload / crash mid-entry doesn't wipe the requisition.
  // expiry_date is a Date; JSON stores it as an ISO string, so revive it on
  // restore or the datepicker's .getFullYear()/.getMonth() calls would crash.
  const draft = useFormDraft({
    key: 'purchasing-requisition',
    version: 3,
    refs: { currentPR, items, currentDraftId },
    isEmpty: () => !currentPR.value.remarks
      && !items.value.some((i) => i.product_name.trim() || i.supplier_id != null
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

  // Submitting raises one requisition per supplier, so this is how many documents the form will produce.
  const supplierCount = computed(() => {
    const supplierIds = new Set(
      items.value
        .filter(i => i.product_name.trim() && i.supplier_id != null)
        .map(i => i.supplier_id),
    )
    return supplierIds.size
  })

  // ─── Item Actions ─────────────────────────────────────────────────
  function addItem() {
    items.value.push({
      no:               items.value.length + 1,
      unit:             'Box',
      product_name: '',
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
      !items.value[0].product_name.trim() &&
      !items.value[0].qty
    ) {
      items.value = []
    }

    entries.forEach(entry => {
      items.value.push({
        no:                 items.value.length + 1,
        unit:               entry.unit || 'Box',
        product_name:   entry.product_name,
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
    const validItems = items.value.filter(i => i.product_name.trim())
    if (!validItems.length) {
      toast.warning('Please add at least one item.')
      return { success: false, resolvedReorderIds: [], requisitionNos: [] }
    }

    const rules: { check: (i: typeof validItems[number]) => boolean; message: string }[] = [
      { check: i => !i.product_name.trim(), message: 'description' },
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
      return { success: false, resolvedReorderIds: [], requisitionNos: [] }
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
      product_name: i.product_name,
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

    const result = await prStore.savePurchaseRequisition()

    loading.value = false

    const createdPRs = result?.createdPRs ?? []

    if (result?.success && createdPRs.length) {
      const requisitionNos = createdPRs.map(pr => pr.requisitionNo)

      for (const pr of createdPRs) {
        await logPRSubmission(
          pr.transactionId,
          pr.requisitionNo,
          'purchase_requisition',
          pr.itemCount,
        )
      }

      if (currentDraftId.value != null) {
        const removed = await useDraftPRDataStore()
          .deleteDraft(currentDraftId.value, { silent: true })
        if (!removed) {
          toast.warning(
            `${requisitionNos.join(', ')} created, but the draft could not be removed — delete it manually so it isn't submitted twice.`,
          )
        }
      }

      draft.clear()
      reset()
      return { success: true, resolvedReorderIds, requisitionNos }
    }

    // NOTE: if savePurchaseRequisition fails here, any reorder rows created
    // above are now orphaned as 'pending' with no PR attached. They're
    // low-risk (each item's reorder_request_id is now set, so retrying this
    // same submit won't create duplicates) but worth a follow-up cleanup pass
    // if PR-save failures turn out to be common.
    return { success: false, resolvedReorderIds: [], requisitionNos: [] }
  }

  // ─── Reset ────────────────────────────────────────────────────────
  function reset() {
    currentPR.value      = { remarks: '' }
    items.value          = []
    currentDraftId.value = null
    addItem()
  }

  // ─── Clear form (single blank row, no draft) ──────────────────────
  function clearForm() {
    currentPR.value      = { remarks: '' }
    items.value          = []
    currentDraftId.value = null
    addItem()
    draft.clear()
  }

  // ─── Saved drafts ─────────────────────────────────────────────────
  // Not validated like handleSubmit — a draft is meant to hold a half-finished requisition.
  async function saveDraft(): Promise<{ success: boolean }> {
    const namedItems = items.value.filter(i => i.product_name.trim())
    if (!namedItems.length) {
      toast.warning('Add at least one item before saving a draft.')
      return { success: false }
    }

    loading.value = true

    const draftStore = useDraftPRDataStore()
    const result = await draftStore.saveManualDraft({
      draftId: currentDraftId.value,
      remarks: currentPR.value.remarks || null,
      lines: namedItems.map(i => ({
        product_id:         i.product_id ?? null,
        product_name:       i.product_name,
        unit:               i.unit,
        supplier_id:        i.supplier_id,
        qty:                i.qty,
        cost_per_unit:      i.cost_per_unit,
        expiry_date:        i.expiry_date ? toLocalISODate(i.expiry_date) : null,
        reorder_request_id: i.reorder_request_id ?? null,
        reorder_reason:     i.reorder_reason ?? null,
      })),
    })

    loading.value = false

    if (!result.success) return { success: false }

    if (result.draftId != null) currentDraftId.value = result.draftId
    draft.clear()
    return { success: true }
  }

  async function loadDraft(draftId: number): Promise<boolean> {
    loading.value = true

    const draftStore = useDraftPRDataStore()
    const loaded = await draftStore.fetchDraft(draftId)

    // fetchDraft isn't scoped by origin, and a canvass draft's offers have nowhere to go in this form.
    if (!loaded || loaded.origin !== 'manual') {
      loading.value = false
      return false
    }

    const productsStore = useProductsDataStore()
    const linkedReorderIds = loaded.items
      .map(i => i.reorder_request_id)
      .filter((id): id is number => id != null)
    const stillPending = await productsStore.filterPendingReorderRequestIds(linkedReorderIds)

    currentPR.value = { remarks: loaded.remarks ?? '' }
    items.value = loaded.items.map((item, index) => ({
      no:               index + 1,
      unit:             item.unit ?? 'Box',
      product_name:     item.product_name ?? '',
      supplier_id:      item.supplier_id ?? null,
      qty:              item.qty ?? 0,
      cost_per_unit:    item.unit_price ?? 0,
      expiry_date:      item.expiry_date ? fromLocalISODate(item.expiry_date) : null,
      product_id:       item.product_id ?? null,
      // Dropped when resolved elsewhere, so approval can't resolve a row this PR no longer owns.
      reorder_request_id:
        item.reorder_request_id != null && stillPending.includes(item.reorder_request_id)
          ? item.reorder_request_id
          : null,
      reorder_reason: toReorderReason(item.reorder_reason),
    }))

    currentDraftId.value = loaded.id
    if (!items.value.length) addItem()

    loading.value = false
    return true
  }

  // ─── Init ─────────────────────────────────────────────────────────
  // Restore a saved draft first; only seed an empty row if there's nothing to restore.
const draftWasRestored = draft.restore()
if (!draftWasRestored && items.value.length === 0) addItem()


  return {
    currentPR,
    items,
    loading,
    currentDraftId,
    companyCostTotal,
    supplierCount,
    addReorderItems,
    addItem,
    removeItem,
    handleSubmit,
    saveDraft,
    loadDraft,
    reset,
    clearForm,
    draftWasRestored,
  }
}
