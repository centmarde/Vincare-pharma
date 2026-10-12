// Types and reserved keys for the changeRequestsData store, shared by its
// feature files. Re-exported from the barrel (../changeRequestsData.ts) so
// existing `@/stores/changeRequestsData` imports keep resolving.

import type { ProposedChange } from '@/utils/changeRequests'

// Reserved proposed_changes keys. change_requests.transaction_id is FK'd to
// transactions.id, but an in-house/ethical payment is a `collections` row, not
// a transactions row — so the collection being voided/edited travels here
// instead, keyed off the order's transaction_id. __prev_status stashes the
// pre-gate status at propose time so a REJECT (or a memo-only edit approve,
// which never sets a status of its own) can restore it instead of stranding
// the document on 'change_request' (same fix already applied in the finance/
// sales change-request stores).
export const prevStatusKey = '__prev_status'
export const collectionIdKey = '__collection_id'

// NOTE: the old `ChangeRequestTargetType` union was removed — it was a leftover
// from the v1 polymorphic schema (`target_type`/`target_id`, dropped when
// change_requests was restructured to a single transaction_id FK). It was
// referenced nowhere, and its values ('inhouse_payment', 'ethical_collection',
// 'journal_entry') were never real `transactions.transaction_type` values, so
// it actively misled dispatch code. Dispatch keys off transaction_type now.

// One editable field surfaced in the proposal dialog. `value` is the current
// value (prefilled) so the dialog can compute the diff automatically.
export type ChangeRequestField = {
  key: string
  label: string
  value: string | number | null
  type: 'text' | 'number' | 'select' | 'date'
  items?: { title: string; value: string | number }[]
}

// Lives in `@/utils/changeRequests` (pure, no side effects) so other stores can
// use it without eagerly loading this module's store/toast dependencies.
// Re-exported here so existing `from '@/stores/changeRequestsData'` type imports
// keep working.
export type { ProposedChange } from '@/utils/changeRequests'

export type ChangeRequestType = {
  id: number // change_requests.id
  created_at: string
  transaction_id: number // FK to transactions.id
  request_type: 'edit' | 'void' | 'undo_pr'
  proposed_changes: ProposedChange
  summary: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_by: string | null
  created_by_email?: string | null
  resolved_by: string | null
  resolved_at: string | null
  //module: string | null
  resolution_note: string | null
  from_transaction_no: string | null // Original transaction ref
  to_transaction_no: string | null // Replacement transaction ref after a ledger edit
}

export type ProposeChangePayload = {
  transactionId: number
  fromTransactionNo?: string | null
  toTransactionNo?: string | null
  requestType: 'edit' | 'void' | 'undo_pr'
  proposedChanges?: ProposedChange
  summary?: string
  reason?: string
}

export type ApplyResult = { success: boolean; resultId?: number; resultRef?: string; error?: string }

// One approved edit against a document, for the "Edited" chip.
export type AppliedEdit = {
  transaction_id: number
  summary: string | null
  reason: string | null
  resolved_at: string | null
  to_transaction_no: string | null
}

// One field's proposed edit inside proposed_changes.
export type Diff = { from: unknown; to: unknown }
