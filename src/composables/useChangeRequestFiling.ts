import { ref } from 'vue'
import {
  useChangeRequestsDataStore,
  type ChangeRequestTargetType, type ChangeRequestField, type ProposedChange,
} from '@/stores/changeRequestsData'

// Cross-module helper for wiring the "Request change / undo" flow into any
// document list/detail view without repeating the same state + handlers each
// time. A view calls `open(cfg)` for a specific document; the shared
// ChangeRequestDialog binds to `config`, and `submit` files the request.
export type ChangeRequestConfig = {
  id: number
  ref: string | null
  fields: ChangeRequestField[]
  voidSummary: string
  allowEdit: boolean
  allowVoid: boolean
}

export function useChangeRequestFiling(module: string, targetType: ChangeRequestTargetType) {
  const store = useChangeRequestsDataStore()

  const showDialog = ref(false)
  const config = ref<ChangeRequestConfig | null>(null)
  const pendingIds = ref<Set<number>>(new Set())
  const submitting = ref(false)

  async function loadPending() {
    pendingIds.value = new Set(await store.fetchPendingTargetIds(targetType))
  }

  function isPending(id: number): boolean {
    return pendingIds.value.has(id)
  }

  function open(cfg: ChangeRequestConfig) {
    config.value = cfg
    showDialog.value = true
  }

  async function submit(payload: { requestType: 'edit' | 'void'; proposedChanges: ProposedChange; summary: string; reason: string }) {
    if (!config.value) return
    submitting.value = true
    const result = await store.proposeChange({
      module,
      targetType,
      targetId: config.value.id,
      targetRef: config.value.ref,
      requestType: payload.requestType,
      proposedChanges: payload.proposedChanges,
      summary: payload.summary,
      reason: payload.reason,
    })
    submitting.value = false
    if (result.success) {
      showDialog.value = false
      await loadPending()
    }
  }

  return { showDialog, config, pendingIds, submitting, isPending, loadPending, open, submit }
}
