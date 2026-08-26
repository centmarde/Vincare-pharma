// composables/useDraftPRReview.ts
import { ref, computed } from 'vue'
import {
  useDraftPRDataStore,
  type DraftPRType,
  type ConvertWarning,
  type ConvertResult,
} from '@/stores/draftPRData'

export function useDraftPRReview(draftId: () => number | null) {
  const draftStore = useDraftPRDataStore()

  const draft = ref<DraftPRType | null>(null)
  const warnings = ref<ConvertWarning[]>([])
  const checking = ref(false)
  const submitting = ref(false)
  const confirmedOnce = ref(false)

  const totalEstimate = computed(() =>
    (draft.value?.items ?? []).reduce((sum, i) => sum + (i.unit_price ?? 0) * i.qty, 0),
  )

  const hasBlockingIssues = computed(() =>
    (draft.value?.items ?? []).some((i) => !i.selected_supplier_offer_id),
  )

  const prCount = computed(() => {
    const supplierIds = new Set(
      (draft.value?.items ?? [])
        .map((i) => (i.selected_supplier_offer_id != null ? i.supplier_id : null))
        .filter((id): id is number => id != null),
    )
    return supplierIds.size
  })

  async function load() {
    const id = draftId()
    if (id == null) return
    draft.value = await draftStore.fetchDraft(id)
    confirmedOnce.value = false
    if (draft.value) {
      checking.value = true
      warnings.value = await draftStore.precheckDraft(draft.value)
      checking.value = false
    }
  }

  async function submit(): Promise<ConvertResult> {
    if (!draft.value) return { success: false }
    if (warnings.value.length && !confirmedOnce.value) {
      confirmedOnce.value = true
      return { success: false }
    }
    submitting.value = true
    const result = await draftStore.submitDraft(draft.value.id)
    submitting.value = false
    return result
  }

  return {
    draft,
    warnings,
    checking,
    submitting,
    confirmedOnce,
    totalEstimate,
    hasBlockingIssues,
    prCount,
    load,
    submit,
  }
}
