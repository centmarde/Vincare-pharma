// Pure helpers for the changeRequestsData store: reserved-key stripping, the
// row mapper, and the edit-model helpers the appliers share. No Supabase and no
// state.

import { parseProposedChanges } from '@/utils/changeRequests'
import type { ProposedChange } from '@/utils/changeRequests'
import { prevStatusKey, collectionIdKey } from './types'
import type { ChangeRequestType, Diff } from './types'

export function stripReservedKeys(changes: ProposedChange): ProposedChange {
  const out: ProposedChange = {}
  for (const [k, v] of Object.entries(changes)) {
    if (k !== prevStatusKey && k !== collectionIdKey) out[k] = v
  }
  return out
}

export function mapRequestRow(row: any): ChangeRequestType {
  return {
    id: row.id,
    created_at: row.created_at,
    transaction_id: row.transaction_id,
    request_type: row.request_type,
    proposed_changes: parseProposedChanges(row.proposed_changes),
    summary: row.summary ?? null,
    reason: row.reason ?? null,
    status: row.status,
    created_by: row.created_by ?? null,
    resolved_by: row.resolved_by ?? null,
    resolved_at: row.resolved_at ?? null,
    resolution_note: row.resolution_note ?? null,
    from_transaction_no: row.from_transaction_no ?? null,
    to_transaction_no: row.to_transaction_no ?? null,
    // module: row.module ?? null,
  }
}

export const txnLabel = (no: string | null, id: number) => no ?? `#${id}`

// ── Edit model ──────────────────────────────────────────────────────────────
// Edits are hold-until-approve. On approval a MEMO field (no GL impact) is
// updated in place (same document); a LEDGER field (amount/date/account/
// category) is applied by REVERSE + REISSUE — the old document is voided
// (its GL cleanly backed out) and a corrected replacement is recorded (new
// document number, projects cleanly). This is the auditor-standard way to
// fix a posted document.

export const toVal = (changes: ProposedChange, key: string): unknown =>
  key in changes ? (changes[key] as Diff).to : undefined
export const normVal = (v: unknown) => (v == null ? '' : String(v))
// First changed field whose LIVE value no longer matches the request's `from`
// (the document drifted since the request was filed) — don't apply stale edits.
export function firstStaleField(
  changes: ProposedChange,
  current: Record<string, unknown>,
): string | null {
  for (const [k, diff] of Object.entries(changes)) {
    if (normVal((diff as Diff).from) !== normVal(current[k])) return k
  }
  return null
}
export const staleError = (k: string) => ({
  success: false as const,
  error: `"${k}" changed since this request was filed — please re-file the edit.`,
})
// Reverse + reissue dates the replacement at the correction date (accountant's
// call), so a fix never lands back in an already-reported period.
export const correctionDate = () => new Date().toISOString().slice(0, 10)
export const reissueReason = (r: ChangeRequestType) =>
  `Corrected via change request #${r.id}${r.reason ? `: ${r.reason}` : ''}`
// Backlink stamped onto the REPLACEMENT document's remarks, so a corrected
// document points at what it superseded without needing a self-FK on
// transactions.
export function reissueRemarks(r: ChangeRequestType, remarks: unknown) {
  const backlink = `Replaces ${txnLabel(r.from_transaction_no, r.transaction_id)} (change request #${r.id})`
  const existing = (remarks ?? '') as string
  return existing ? `${backlink} | ${existing}` : backlink
}
