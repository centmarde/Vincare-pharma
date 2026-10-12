// Barrel file for the changeRequestsData store.
//
// The store is split into 'stores/changeRequests/*' — this file re-exports
// every type (so existing `@/stores/changeRequestsData` imports keep working)
// and composes the feature files' actions into one Pinia defineStore. Shared
// state lives in `./changeRequests/state`.
//
// Approval-gated change requests: a staff member proposes an EDIT or an
// UNDO/VOID to an already-entered document; an executive approves before it's
// applied. On approval, applyChange dispatches to a per-type handler that
// reuses the module's existing undo/reversal functions.
//
// Storage: the `change_requests` table. `logs` keeps only its real job — one
// readable narrative row per event (change_requested / change_approved /
// change_rejected), carrying transaction_id so the request still appears on the
// document's cross-module timeline.
//
// Voids are SOFT: every handler below marks the document voided and leaves it
// in place (the accountant's requirement — a reversed document stays visible,
// flagged, for tracking). A ledger EDIT is reverse + reissue: the original is
// voided and a replacement is recorded at the CORRECTION date, with from_transaction_no /
// to_transaction_no linking the two ends.
//
// Best-effort, not atomic (JS-over-RPC convention): approve applies the change
// first and only then flips status, so a failure leaves the request pending and
// retryable rather than marking a change done that never landed.

import { defineStore } from 'pinia'
import {
  requests,
  loading,
  error,
  pendingCount,
  clearError,
  resetStore,
} from './changeRequests/state'
import {
  fetchRequests,
  fetchRequestById,
  hasPendingRequest,
  fetchPendingTargetIds,
  fetchAppliedEdits,
  proposeChange,
  approveRequest,
  rejectRequest,
} from './changeRequests/requests'

// Re-export the types so existing imports keep resolving from the barrel.
export type {
  ChangeRequestField,
  ProposedChange,
  ChangeRequestType,
  ProposeChangePayload,
  AppliedEdit,
} from './changeRequests/types'

export const useChangeRequestsDataStore = defineStore('changeRequestsData', () => {
  return {
    // State
    requests,
    loading,
    error,

    // Computed
    pendingCount,

    // Requests
    fetchRequests,
    fetchRequestById,
    hasPendingRequest,
    fetchPendingTargetIds,
    fetchAppliedEdits,
    proposeChange,
    approveRequest,
    rejectRequest,

    // Misc
    clearError,
    resetStore,
  }
})
