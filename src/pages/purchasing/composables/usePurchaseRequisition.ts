import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import { toLocalISODate, fromLocalISODate } from '@/utils/helpers'
import { useProductsDataStore } from '@/stores/productsData'
import { useDraftPRDataStore } from '@/stores/draftPRData'
import type { ManualDraftLineInput } from '@/stores/draftPRData'
import { useLogRequisition } from './useLogRequisition'
import { useToast } from 'vue-toastification'
import { ref, computed, watch } from 'vue'
import { useFormDraft } from '@/composables/useFormDraft'
import { computePurchaseBreakdown, emptySupplierCharges } from '@/utils/computationHelpers'
import type { PurchaseBreakdown, SupplierCharges } from '@/utils/computationHelpers'

export const unitOptions = ['Box', 'Pc(s)', 'Unit(s)', 'Set', 'Kg', 'M']

export type PRFormItem = {
  no: number
  unit: string
  product_name: string
  supplier_id: number | null
  qty: number
  cost_per_unit: number
  expiry_date: Date | null
  batch_no: string
  product_id?: number | null // NEW
  reorder_request_id?: number | null // NEW — tracked so we can resolve it after save
  reorder_reason?: 'reorder_outofstock' | 'reorder_lowstock' | 'reorder_expiring' | 'reorder_expired' | null // NEW — set only when no reorder row exists yet and one should be created on successful submit
}

type SubmitResult = {
  success: boolean
  resolvedReorderIds: number[]
  requisitionNos: string[]
  productIds: number[]
  error?: string
}

export type SupplierPurchaseSummary = PurchaseBreakdown & {
  charges: SupplierCharges
}

type DraftPayload = {
  remarks: string | null
  supplierCharges: SupplierCharges[]
  lines: ManualDraftLineInput[]
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

function hasInvalidCharges(charges: SupplierCharges): boolean {
  if (charges.discount_percent < 0 || charges.discount_percent > 100) return true
  return charges.tax_amount < 0 || charges.shipping_amount < 0
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

  // One entry per supplier on the form: each supplier's order slip carries its own discount and fees.
  const supplierCharges = ref<SupplierCharges[]>([])

  // Set while editing a saved draft so the next save updates it instead of creating a second one.
  const currentDraftId = ref<number | null>(null)

  // The open saved draft as it was last loaded or saved, so closing the form only writes when something changed.
  const lastSavedDraftSnapshot = ref<string | null>(null)

  // Persist a draft so a reload / crash mid-entry doesn't wipe the requisition.
  // expiry_date is a Date; JSON stores it as an ISO string, so revive it on
  // restore or the datepicker's .getFullYear()/.getMonth() calls would crash.
  const draft = useFormDraft({
    key: 'purchasing-requisition',
    version: 3,
    refs: { currentPR, items, currentDraftId, supplierCharges, lastSavedDraftSnapshot },
    isEmpty: () => !currentPR.value.remarks
      && !items.value.some((i) => i.product_name.trim() || i.supplier_id != null
        || i.qty > 0 || i.cost_per_unit > 0 || i.expiry_date != null),
    deserialize: (data) => ({
      ...data,
      items: Array.isArray(data.items)
        ? (data.items as PRFormItem[]).map((i) => ({
            ...i,
            expiry_date: i.expiry_date ? new Date(i.expiry_date as unknown as string) : null,
            batch_no: i.batch_no ?? '',
          }))
        : data.items,
    }),
  })

  // ─── Computed ─────────────────────────────────────────────────────
  const companyCostTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)
  )

  const supplierIdsOnForm = computed(() => {
    const supplierIds: number[] = []
    for (const item of items.value) {
      if (!item.product_name.trim() || item.supplier_id == null) continue
      if (!supplierIds.includes(item.supplier_id)) supplierIds.push(item.supplier_id)
    }
    return supplierIds
  })

  // Submitting raises one requisition per supplier, so this is how many documents the form will produce.
  const supplierCount = computed(() => supplierIdsOnForm.value.length)

  function netTotalForSupplier(supplierId: number): number {
    let total = 0
    for (const item of items.value) {
      if (item.supplier_id !== supplierId || !item.product_name.trim()) continue
      total += (item.qty || 0) * (item.cost_per_unit || 0)
    }
    return total
  }

  const supplierSummaries = computed(() => {
    const summaries: SupplierPurchaseSummary[] = []
    for (const supplierId of supplierIdsOnForm.value) {
      const charges = supplierCharges.value.find((entry) => entry.supplier_id === supplierId)
      if (!charges) continue
      const breakdown = computePurchaseBreakdown(netTotalForSupplier(supplierId), charges)
      summaries.push({ ...breakdown, charges })
    }
    return summaries
  })

  const purchaseGrandTotal = computed(() => {
    let total = 0
    for (const summary of supplierSummaries.value) total += summary.purchaseTotal
    return total
  })

  const hasUnsavedDraftChanges = computed(() => {
    if (currentDraftId.value == null || lastSavedDraftSnapshot.value == null) return false
    return draftSnapshot() !== lastSavedDraftSnapshot.value
  })

  // Suppliers join the form from the picker, reorder prefill or a draft; each gets a zero entry to bind to.
  function addMissingSupplierCharges(supplierIds: number[]) {
    for (const supplierId of supplierIds) {
      const alreadyTracked = supplierCharges.value.some((entry) => entry.supplier_id === supplierId)
      if (!alreadyTracked) supplierCharges.value.push(emptySupplierCharges(supplierId))
    }
  }

  watch(supplierIdsOnForm, addMissingSupplierCharges, { immediate: true })

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
      batch_no:         '',
    })
  }

  function removeItem(index: number) {
    items.value.splice(index, 1)
    items.value.forEach((item, i) => (item.no = i + 1))
  }

  // Once the line is a different item, a leftover link would copy the old product's SKU/category and settle its reorder request.
  function unlinkPickedProduct(item: PRFormItem) {
    item.product_id = null
    item.reorder_request_id = null
    item.reorder_reason = null
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
        batch_no:           '',
        product_id:         entry.product_id,
        reorder_request_id: entry.reorder_request_id,
        reorder_reason:     entry.reorder_reason ?? null,   // NEW
      })
    })
  }

  // ─── Submit ───────────────────────────────────────────────────────
  // Zero charges stand in until the charges watch adds a supplier's entry, so the result never depends on its timing; '' becomes 0.
  function chargesForSuppliersOnForm(): SupplierCharges[] {
    return supplierIdsOnForm.value.map((supplierId) => {
      const charges =
        supplierCharges.value.find((entry) => entry.supplier_id === supplierId) ??
        emptySupplierCharges(supplierId)
      return {
        supplier_id: supplierId,
        discount_percent: Number(charges.discount_percent) || 0,
        tax_amount: Number(charges.tax_amount) || 0,
        shipping_amount: Number(charges.shipping_amount) || 0,
      }
    })
  }

  async function handleSubmit(): Promise<SubmitResult> {
    const validItems = items.value.filter(i => i.product_name.trim())
    if (!validItems.length) {
      toast.warning('Please add at least one item.')
      return { success: false, resolvedReorderIds: [], requisitionNos: [], productIds: [] }
    }

    const rules: { check: (i: typeof validItems[number]) => boolean; message: string }[] = [
      { check: i => !i.product_name.trim(), message: 'product name' },
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
      return { success: false, resolvedReorderIds: [], requisitionNos: [], productIds: [] }
    }

    const chargesToSave = chargesForSuppliersOnForm()
    if (chargesToSave.some(hasInvalidCharges)) {
      toast.info('Discount must be between 0% and 100%, and tax and shipping cannot be negative.')
      return { success: false, resolvedReorderIds: [], requisitionNos: [], productIds: [] }
    }

    loading.value = true

    // Claimed before anything else so a retry after a failed post-submit delete — or
    // the same draft resumed in a second tab — can't raise a second set of PRs.
    if (currentDraftId.value != null) {
      const claimed = await useDraftPRDataStore().claimManualDraftForSubmit(currentDraftId.value)
      if (!claimed) {
        loading.value = false
        toast.error('This draft was already submitted or is no longer available — reopen it from Saved Drafts.')
        return { success: false, resolvedReorderIds: [], requisitionNos: [], productIds: [] }
      }
    }

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
      batch_no:         i.batch_no.trim() || null,
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

    const result = await prStore.savePurchaseRequisition(chargesToSave)

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

      // Submitted products are now being re-ordered — persist is_reorder = true
      // and keep the local products list / currentProduct in sync.
      await productsStore.setProductsReorderFlag(productIds, true)

      // A failed delete needs no warning: the claim above already left the draft
      // 'converted', so it's out of Saved Drafts and loadDraft won't reopen it.
      if (currentDraftId.value != null) {
        await useDraftPRDataStore().deleteDraft(currentDraftId.value, { silent: true })
      }

      draft.clear()
      reset()
      return { success: true, resolvedReorderIds, requisitionNos, productIds }
    }

    // NOTE: if savePurchaseRequisition fails here, any reorder rows created
    // above are now orphaned as 'pending' with no PR attached. They're
    // low-risk (each item's reorder_request_id is now set, so retrying this
    // same submit won't create duplicates) but worth a follow-up cleanup pass
    // if PR-save failures turn out to be common.
    if (currentDraftId.value != null) {
      const released = await useDraftPRDataStore().releaseManualDraftClaim(currentDraftId.value)
      if (!released) {
        return {
          success: false,
          resolvedReorderIds: [],
          requisitionNos: [],
          productIds: [],
          error: 'The saved draft could not be released. Please reopen Saved Drafts and try again.',
        }
      }
    }
    return { success: false, resolvedReorderIds: [], requisitionNos: [], productIds: [] }
  }

  // ─── Reset ────────────────────────────────────────────────────────
  function reset() {
    currentPR.value      = { remarks: '' }
    items.value          = []
    currentDraftId.value = null
    supplierCharges.value = []
    lastSavedDraftSnapshot.value = null
    addItem()
  }

  // ─── Clear form (single blank row, no draft) ──────────────────────
  function clearForm() {
    currentPR.value      = { remarks: '' }
    items.value          = []
    currentDraftId.value = null
    supplierCharges.value = []
    lastSavedDraftSnapshot.value = null
    addItem()
    draft.clear()
  }

  // ─── Saved drafts ─────────────────────────────────────────────────
  function draftLinesFromForm(): ManualDraftLineInput[] {
    return items.value
      .filter((i) => i.product_name.trim())
      .map((i) => ({
        product_id:         i.product_id ?? null,
        product_name:       i.product_name,
        unit:               i.unit,
        supplier_id:        i.supplier_id,
        qty:                i.qty,
        cost_per_unit:      i.cost_per_unit,
        expiry_date:        i.expiry_date ? toLocalISODate(i.expiry_date) : null,
        batch_no:           i.batch_no.trim() || null,
        reorder_request_id: i.reorder_request_id ?? null,
        reorder_reason:     i.reorder_reason ?? null,
      }))
  }

  function draftPayloadFromForm(): DraftPayload {
    return {
      remarks: currentPR.value.remarks || null,
      supplierCharges: chargesForSuppliersOnForm(),
      lines: draftLinesFromForm(),
    }
  }

  function draftSnapshot(): string {
    return JSON.stringify(draftPayloadFromForm())
  }

  // The draft was deleted or submitted elsewhere, so the edits stay in the form as a new, unsaved requisition.
  function forgetOpenDraft() {
    currentDraftId.value = null
    lastSavedDraftSnapshot.value = null
    toast.warning('Your changes are still in the form. Use Save as Draft to keep them as a new draft.')
  }

  // Not validated like handleSubmit — a draft is meant to hold a half-finished requisition.
  async function saveDraft(): Promise<{ success: boolean }> {
    const payload = draftPayloadFromForm()
    if (!payload.lines.length) {
      toast.warning('Add at least one item before saving a draft.')
      return { success: false }
    }

    loading.value = true

    const draftStore = useDraftPRDataStore()
    const result = await draftStore.saveManualDraft({ draftId: currentDraftId.value, ...payload })

    loading.value = false

    if (result.draftMissing) forgetOpenDraft()
    if (!result.success) return { success: false }

    if (result.draftId != null) currentDraftId.value = result.draftId
    if (!result.needsAnotherSave) lastSavedDraftSnapshot.value = JSON.stringify(payload)
    draft.clear()
    return { success: true }
  }

  // Runs on close and after a reload, so a saved draft's edits never live only in this browser.
  async function autoSaveOpenDraft(outcome: 'saved.' | 'restored and saved.'): Promise<void> {
    const draftId = currentDraftId.value
    if (draftId == null || loading.value || !hasUnsavedDraftChanges.value) return

    const payload = draftPayloadFromForm()
    if (!payload.lines.length) {
      toast.info(`Draft #${draftId} was not updated because the form has no items.`)
      return
    }

    loading.value = true
    try {
      const result = await useDraftPRDataStore().saveManualDraft(
        { draftId, ...payload },
        { successMessage: `Draft #${draftId} ${outcome}` },
      )
      const sameDraftStillOpen = currentDraftId.value === draftId

      if (result.success) {
        if (sameDraftStillOpen && !result.needsAnotherSave) {
          lastSavedDraftSnapshot.value = JSON.stringify(payload)
        }
      } else if (result.draftMissing) {
        if (sameDraftStillOpen) forgetOpenDraft()
      } else {
        warnChangesKept(draftId)
      }
    } catch (error) {
      console.warn('autoSaveOpenDraft: saving the draft threw:', error)
      warnChangesKept(draftId)
    } finally {
      loading.value = false
    }
  }

  function warnChangesKept(draftId: number) {
    toast.warning(
      `Your changes to Draft #${draftId} are kept in this browser and will be saved the next time the form closes.`,
    )
  }

  function saveDraftOnClose(): Promise<void> {
    return autoSaveOpenDraft('saved.')
  }

  async function loadDraft(draftId: number): Promise<boolean> {
    loading.value = true

    const draftStore = useDraftPRDataStore()
    const loaded = await draftStore.fetchDraft(draftId)

    // fetchDraft isn't scoped by origin or status: a canvass draft's offers have nowhere
    // to go in this form, and a converted one already raised its PR — reloading it would
    // let a second Submit raise a duplicate.
    if (!loaded || loaded.origin !== 'manual' || loaded.status !== 'draft') {
      loading.value = false
      return false
    }

    const productsStore = useProductsDataStore()
    const linkedReorderIds = loaded.items
      .map(i => i.reorder_request_id)
      .filter((id): id is number => id != null)
    const stillPending = await productsStore.filterPendingReorderRequestIds(linkedReorderIds)

    currentPR.value = { remarks: loaded.remarks ?? '' }
    supplierCharges.value = loaded.supplier_charges ?? []
    items.value = loaded.items.map((item, index) => ({
      no:               index + 1,
      unit:             item.unit ?? 'Box',
      product_name:     item.product_name ?? '',
      supplier_id:      item.supplier_id ?? null,
      qty:              item.qty ?? 0,
      cost_per_unit:    item.unit_price ?? 0,
      expiry_date:      item.expiry_date ? fromLocalISODate(item.expiry_date) : null,
      batch_no:         item.batch_no ?? '',
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
    lastSavedDraftSnapshot.value = draftSnapshot()

    loading.value = false
    return true
  }

  // ─── Init ─────────────────────────────────────────────────────────
  // Restore a saved draft first; only seed an empty row if there's nothing to restore.
  const draftWasRestored = draft.restore()
  if (!draftWasRestored && items.value.length === 0) addItem()
  autoSaveOpenDraft('restored and saved.')

  return {
    currentPR,
    items,
    loading,
    currentDraftId,
    companyCostTotal,
    supplierCount,
    supplierSummaries,
    purchaseGrandTotal,
    addReorderItems,
    addItem,
    removeItem,
    unlinkPickedProduct,
    handleSubmit,
    saveDraft,
    loadDraft,
    reset,
    clearForm,
    draftWasRestored,
    hasUnsavedDraftChanges,
    saveDraftOnClose,
  }
}
