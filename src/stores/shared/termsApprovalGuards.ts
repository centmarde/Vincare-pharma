// Executive approval to LOCK an order's terms — In-House "Agree" and Ethical
// "Invoice" — and to UNLOCK them again. The requests live in change_requests
// (see termsApprovalData.ts); these checks are what the order stores call to
// enforce them.
//
// A separate module rather than part of termsApprovalData because that store
// calls INTO the order stores to apply an approval, while the order stores call
// these checks to refuse an edit — importing one another would be a cycle.
// Store-side, because they query.

import { supabase } from '@/lib/supabase'

export const lockTermsRequestType = 'lock_terms'
export const unlockTermsRequestType = 'unlock_terms'
export const termsRequestTypes = [lockTermsRequestType, unlockTermsRequestType]

/**
 * Whether the order has a terms request (lock or unlock) awaiting a decision.
 * A pending request FREEZES the order: what the executive was shown is what
 * they approve. A failed read counts as pending — an unreadable lock is not
 * permission to edit.
 */
export async function hasPendingTermsRequest(orderId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('change_requests')
    .select('id')
    .eq('transaction_id', orderId)
    .in('request_type', termsRequestTypes)
    .eq('status', 'pending')
    .limit(1)
  if (error) return true
  return !!data?.length
}

/**
 * Whether `requestId` is an APPROVED lock-terms request for this order — the
 * only way Agree / Invoice may run. Passed in by the approval itself, so an
 * older approval (from before an unlock) can never be reused.
 */
export async function isApprovedLockRequest(requestId: number | undefined, orderId: number): Promise<boolean> {
  if (!requestId) return false
  const { data, error } = await supabase
    .from('change_requests')
    .select('id')
    .eq('id', requestId)
    .eq('transaction_id', orderId)
    .eq('request_type', lockTermsRequestType)
    .eq('status', 'approved')
    .maybeSingle()
  return !error && !!data
}

/**
 * Why an agreed order can no longer be unlocked, or null when it still can.
 * Once goods have left or money has come in, undoing the terms would strand a
 * delivery receipt or a payment against an order that no longer agreed to it.
 */
export async function unlockBlocker(orderId: number): Promise<string | null> {
  // Delivery receipts, not the lines' counts: on an Ethical order the count is
  // the stock DRAWN at invoicing, set before anything is delivered. Every
  // delivery, In-House or Ethical, issues a receipt.
  const [receipts, payments] = await Promise.all([
    supabase.from('delivery_receipts').select('id', { count: 'exact', head: true }).eq('order_id', orderId),
    supabase.from('collections').select('id', { count: 'exact', head: true }).eq('transaction_id', orderId).is('voided_at', null),
  ])
  if (receipts.error || payments.error) return 'Could not check the order\'s deliveries and payments. Try again.'
  if ((receipts.count ?? 0) > 0) return 'A delivery receipt has been issued for this order.'
  if ((payments.count ?? 0) > 0) return 'A payment has been recorded against this order.'
  return null
}
