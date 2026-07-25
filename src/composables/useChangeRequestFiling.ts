import { ref } from 'vue'
import type { ChangeRequestField, ProposedChange, AppliedEdit } from '@/stores/changeRequestsData'

// Cross-module helper for wiring the "Request change / undo" flow into any
// document list/detail view without repeating the same state + handlers each
// time. A view calls `open(cfg)` for a specific document; the shared
// ChangeRequestDialog binds to `config`, and `submit` files the request.
//
// Takes the module's own change-request store as a parameter, so this stays
// pure cross-module glue rather than being tied to one store: pass the shared
// `useChangeRequestsDataStore()` for inhouse/ethical/GL (unchanged), or a
// per-module store (e.g. `useFinanceChangeRequestStore()`,
// `useSalesChangeRequestStore()`) for modules that own their own change
// requests.
export type ChangeRequestFilingStore = {
  fetchPendingTargetIds: () => Promise<number[]>
  fetchAppliedEdits: () => Promise<AppliedEdit[]>
  proposeChange: (payload: {
    transactionId: number
    fromTransactionNo?: string | null
    toTransactionNo?: string | null
    requestType: 'edit' | 'void'
    proposedChanges?: ProposedChange
    summary?: string
    reason?: string
  }) => Promise<{ success: boolean; requestId?: number }>
}

export type ChangeRequestConfig = {
  id: number
  ref: string | null
  fields: ChangeRequestField[]
  voidSummary: string
  allowEdit: boolean
  allowVoid: boolean
}

export function useChangeRequestFiling(store: ChangeRequestFilingStore) {
  const showDialog = ref(false)
  const config = ref<ChangeRequestConfig | null>(null)
  const pendingIds = ref<Set<number>>(new Set())
  const appliedEdits = ref<Map<number, AppliedEdit>>(new Map())
  const submitting = ref(false)

  // Loads both the pending requests and the already-applied edits. Kept as one
  // call (and the original name) so existing callers pick the edit markers up
  // without changing.
  async function loadPending() {
    const [pending, edits] = await Promise.all([
      store.fetchPendingTargetIds(),
      store.fetchAppliedEdits(),
    ])
    pendingIds.value = new Set(pending)
    // Ordered newest-first by the store, so the first entry per target wins.
    const map = new Map<number, AppliedEdit>()
    for (const e of edits) if (!map.has(e.transaction_id)) map.set(e.transaction_id, e)
    appliedEdits.value = map
  }

  function isPending(id: number): boolean {
    return pendingIds.value.has(id)
  }

  // An approved edit was applied to this exact document (memo edits — a ledger
  // edit voids the original, which the row's own voided_at already shows).
  function isEdited(id: number): boolean {
    return appliedEdits.value.has(id)
  }

  function editTooltip(id: number): string {
    const e = appliedEdits.value.get(id)
    if (!e) return ''
    const when = e.resolved_at ? new Date(e.resolved_at).toLocaleDateString() : ''
    return [e.summary ?? 'Edited via approved change request', e.reason, when && `Applied ${when}`]
      .filter(Boolean).join(' — ')
  }

  function open(cfg: ChangeRequestConfig) {
    config.value = cfg
    showDialog.value = true
  }

  async function submit(payload: { requestType: 'edit' | 'void'; proposedChanges: ProposedChange; summary: string; reason: string }) {
    if (!config.value) return
    submitting.value = true
    const result = await store.proposeChange({
      transactionId: config.value.id,
      fromTransactionNo: config.value.ref,
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

  return {
    showDialog, config, pendingIds, appliedEdits, submitting,
    isPending, isEdited, editTooltip, loadPending, open, submit,
  }
}
