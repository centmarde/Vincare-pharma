// Purchasing applier: undoing a purchase requisition's approval.

import { supabase } from '@/lib/supabase'
import type { ApplyResult, ChangeRequestType } from './types'

// ── Purchase Requisition unapprove ─────────────────────────────────────────
// An "Unapprove" (void) for a PR reverts its status back to 'pending_approval'.
// On approval, retrieve the current reference_no, stamp it as to_transaction_no
// on the change_request row, and put the original recent_transaction_no (stored
// as from_transaction_no) back into the transaction as recent_transaction_no
// and reference_no. This effectively "undoes" the status progression while keeping
// an audit trail via the change_request record.
export async function applyPRChange(request: ChangeRequestType, userId: string): Promise<ApplyResult> {
  // Only 'undo_pr' type is supported for PR unapprove
  if (request.request_type !== 'undo_pr') {
    return {
      success: false,
      error: 'Purchase requisitions can only be unapproved (undo_pr) via change request.',
    }
  }

  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    // transactions.voided_at was dropped in the soft-void restructure --
    // status='voided' is the only void signal left on a transactions-level
    // document (collections/pos_sale_details keep their own columns).
    .select('id, reference_no, recent_transaction_no, status')
    .eq('id', request.transaction_id)
    .maybeSingle()

  if (txErr || !tx) return { success: false, error: 'Transaction not found.' }
  if (tx.status === 'voided')
    return { success: false, error: 'This purchase requisition has already been voided.' }

  // Retrieve the current reference_no to store as to_transaction_no
  const currentRefNo = tx.reference_no
  // Use the recent_transaction_no as the from (the original doc number before progression)
  const fromRefNo = tx.recent_transaction_no ?? request.from_transaction_no ?? currentRefNo

  // Guarded update: only revert if the status is not already pending_approval
  // (prevents double-revert on retry). Status → pending_approval clears the
  // review trail so the PR can be re-evaluated.
  const { data: updated, error: updateErr } = await supabase
    .from('transactions')
    .update({
      status: 'pending_approval',
      approved_by: null,
      updated_at: new Date().toISOString(),
      reference_no: fromRefNo, // put back the original doc ref
      recent_transaction_no: fromRefNo, // also restore the recent_transaction_no
    })
    .eq('id', request.transaction_id)
    .eq('status', tx.status) // race guard: only update if status hasn't changed
    .neq('status', 'pending_approval') // don't re-revert an already-reverted PR
    .select('id, reference_no')

  if (updateErr) return { success: false, error: updateErr.message }
  if (!updated?.length)
    return {
      success: false,
      error: 'This purchase requisition was already reverted to pending approval.',
    }

  // Now update the change_request row with the to_transaction_no = current reference_no
  // This links: from_transaction_no (original ref) → to_transaction_no (current ref before revert)
  // The change_request already has from_transaction_no set at propose time.
  const { data: crUpdatedata, error: crUpdateErr } = await supabase
    .from('change_requests')
    .update({
      to_transaction_no: currentRefNo,
    })
    .eq('id', request.id)

  if (crUpdateErr) {
    console.warn(
      'applyPRChange: failed to update change_request to_transaction_no:',
      crUpdateErr.message,
    )

    // Non-fatal: the status revert already succeeded
  }

  return {
    success: true,
    resultRef: currentRefNo ?? undefined,
  }
}
