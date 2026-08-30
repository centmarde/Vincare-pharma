// composables/useDraftPRReview.ts
import { ref, computed } from 'vue'
import {
  useDraftPRDataStore,
  type DraftPRType,
  type ConvertWarning,
  type ConvertResult,
} from '@/stores/draftPRData'
import { useConfirmDialog } from '@/composables/useConfirmDialog'

const { confirmDialog } = useConfirmDialog()

/**
 * Composable for reviewing and submitting a draft purchase requisition
 * @param draftId - Function returning the draft PR ID to review
 * @returns Draft review state and actions including load and submit functions
 */
export function useDraftPRReview(draftId: () => number | null) {
  const draftStore = useDraftPRDataStore()

  const draft = ref<DraftPRType | null>(null)
  const warnings = ref<ConvertWarning[]>([])
  const checking = ref(false)
  const submitting = ref(false)
  const submitError = ref<string | null>(null)
  // Warnings are advisory only — anything that actually stops a submit shows up
  // in hasBlockingIssues and on the row chip — so they're safe to fold away.
  const warningsExpanded = ref(true)

  const totalEstimate = computed(() =>
    (draft.value?.items ?? []).reduce((sum, i) => sum + (i.unit_price ?? 0) * i.qty, 0),
  )

  const disqualifiedItemIds = computed(() =>
    warnings.value.filter((w) => w.kind === 'disqualified').map((w) => w.item_id),
  )

  const hasBlockingIssues = computed(() =>
    (draft.value?.items ?? []).some(
      (i) => !i.selected_supplier_offer_id || disqualifiedItemIds.value.includes(i.id),
    ),
  )

  const prCount = computed(() => {
    const supplierIds = new Set(
      (draft.value?.items ?? [])
        .map((i) => (i.selected_supplier_offer_id != null ? i.supplier_id : null))
        .filter((id): id is number => id != null),
    )
    return supplierIds.size
  })

  /**
   * Loads the draft PR and pre-checks it for validation warnings
   */
  async function load() {
    const id = draftId()
    if (id == null) return
    draft.value = await draftStore.fetchDraft(id)
    warningsExpanded.value = true
    submitError.value = null
    if (draft.value) {
      checking.value = true
      warnings.value = await draftStore.precheckDraft(draft.value)
      checking.value = false
    }
  }

  /**
   * Submits the draft PR for conversion to purchase requisition(s) after user confirmation
   * @returns Conversion result with success status, PR details, and any warnings or errors
   */
  async function submit(): Promise<ConvertResult> {
    if (!draft.value) return { success: false }
    submitError.value = null

    // One plain confirmation about the conversion itself. Warnings are not what
    // this asks about — they're on screen above, and the user can fold them away.
    const count = prCount.value
    const ok = await confirmDialog(
      `This will raise ${count} purchase requisition${count > 1 ? 's' : ''} from Draft PR #${draft.value.id} and send ${count > 1 ? 'them' : 'it'} for approval.`,
      {
        title: 'Convert draft to purchase requisition',
        confirmText: 'Convert',
        cancelText: 'Cancel',
      },
    )
    if (!ok) return { success: false }

    submitting.value = true
    const result = await draftStore.submitDraft(draft.value.id)
    submitting.value = false
    if (!result.success && result.error) submitError.value = result.error
    return result
  }

  return {
    draft,
    warnings,
    checking,
    submitting,
    submitError,
    warningsExpanded,
    totalEstimate,
    hasBlockingIssues,
    disqualifiedItemIds,
    prCount,
    load,
    submit,
  }
}
