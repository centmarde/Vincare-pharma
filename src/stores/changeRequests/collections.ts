// Collection appliers: an In-House payment, an Ethical collection or a payment
// on a POS sale charged to account (all `collections` rows) — void, memo-only
// edit, or reverse + re-record.

import { supabase } from '@/lib/supabase'
import { useInhouseDataStore } from '@/stores/inhouseData'
import { useEthicalDataStore } from '@/stores/ethicalData'
import { useSalesChargesStore } from '@/stores/salesChargesData'
import { prevStatusKey, collectionIdKey } from './types'
import type { ApplyResult, ChangeRequestType, Diff } from './types'
import {
  stripReservedKeys,
  toVal,
  firstStaleField,
  staleError,
  reissueReason,
  reissueRemarks,
} from './helpers'
import { reverseProjectedEntry } from './ledger'
import { chequeFor, chequeProblem } from '@/utils/paymentMethods'

// ── In-house payment / Ethical collection (both are `collections` rows) ─────
// request.transaction_id is the ORDER's transaction id (it has to be — the
// FK requires a real transactions row); the collection being voided/edited
// is carried separately in proposed_changes[__collection_id], stashed at
// propose time. Both project as 'collection' (DR Cash / CR AR). Void
// reverses that, rolls back the collection, and rolls the order's
// amount_paid + status back.
/**
 * Which document a payment is on. 'pos' is a sale charged to a customer
 * account: it keeps no amount_paid (what is paid is summed from its
 * collections), so voiding a payment on it has nothing to roll back.
 */
export type CollectionKind = 'inhouse' | 'ethical' | 'pos'

/** Payment fields an approved edit may change in place (no money moves). */
const memoKeys = ['payment_method', 'reference_no', 'remarks', 'cheque_bank', 'cheque_no', 'cheque_date']
const chequeKeys = ['cheque_bank', 'cheque_no', 'cheque_date']

// Reverse the collection's GL entry, soft-void it, then roll the order back.
export async function voidCollection(
  collectionId: number,
  userId: string,
  kind: CollectionKind,
  reason: string | null,
): Promise<{ success: boolean; error?: string }> {
  const { data: col } = await supabase
    .from('collections')
    .select('transaction_id, amount, voided_at')
    .eq('id', collectionId)
    .maybeSingle()
  if (!col) return { success: false, error: 'Payment not found.' }
  if (col.voided_at) return { success: false, error: 'This payment has already been voided.' }

  const rev = await reverseProjectedEntry('collection', collectionId, userId)
  if (!rev.ok)
    return {
      success: false,
      error: rev.error || 'Failed to reverse the collection journal entry.',
    }

  // Guarded on voided_at so a retry can't double-roll-back the order below.
  const { data: voided, error: voidErr } = await supabase
    .from('collections')
    .update({ voided_at: new Date().toISOString(), voided_by: userId, void_reason: reason })
    .eq('id', collectionId)
    .is('voided_at', null)
    .select('id')
  if (voidErr) return { success: false, error: voidErr.message }
  if (!voided?.length) return { success: false, error: 'This payment has already been voided.' }

  // A charged sale's balance is derived from its non-voided payments: the void
  // above already put the amount back on what they owe.
  if (kind === 'pos') return { success: true }

  // Roll the order back: subtract the voided amount, re-derive status.
  const detailsTable = kind === 'inhouse' ? 'inhouse_details' : 'ethical_details'
  const zeroStatus = kind === 'inhouse' ? 'delivered' : 'invoiced'
  const orderId = col.transaction_id
  const { data: order } = await supabase
    .from('transactions')
    .select('total_amount')
    .eq('id', orderId)
    .maybeSingle()
  const { data: details } = await supabase
    .from(detailsTable)
    .select('amount_paid')
    .eq('transaction_id', orderId)
    .maybeSingle()
  const total = order?.total_amount ?? 0
  const newPaid = Math.max(0, (details?.amount_paid ?? 0) - (col.amount ?? 0))
  const newStatus = newPaid <= 0 ? zeroStatus : newPaid < total ? 'partial' : 'paid'
  const nowIso = new Date().toISOString()
  const { error: dErr } = await supabase
    .from(detailsTable)
    .update({ amount_paid: newPaid, paid_at: newPaid > 0 ? nowIso : null })
    .eq('transaction_id', orderId)
  if (dErr) console.warn('voidCollection: amount_paid rollback failed:', dErr.message)
  const { error: sErr } = await supabase
    .from('transactions')
    .update({ status: newStatus, updated_at: nowIso })
    .eq('id', orderId)
  if (sErr) console.warn('voidCollection: status rollback failed:', sErr.message)
  return { success: true }
}

/**
 * Why a corrected payment would be refused by recordPayment / recordCollection,
 * or null if it would go through. Mirrors their checks — amount, account,
 * outstanding balance — so they can be run before the original is voided.
 * The balance allows for the void: it gives the original amount back first.
 */
async function reissueBlocker(
  kind: CollectionKind,
  payload: { orderId: number; amount: number; cashAccountId: number },
  originalAmount: number,
): Promise<string | null> {
  if (!payload.cashAccountId) {
    return 'This payment has no cash account on record, so it cannot be corrected in place. Void it and record the corrected payment instead.'
  }
  if (!(payload.amount > 0)) return 'The corrected amount must be greater than zero.'

  const { data: account } = await supabase
    .from('cash_accounts').select('id').eq('id', payload.cashAccountId).maybeSingle()
  if (!account) {
    return 'The cash account this payment went into no longer exists. Void it and record the corrected payment instead.'
  }

  if (kind === 'pos') {
    const { data: sale } = await supabase.from('transactions').select('total_amount').eq('id', payload.orderId).maybeSingle()
    if (!sale) return 'The sale this payment belongs to could not be found.'
    const paid = (await useSalesChargesStore().paidBySale([payload.orderId])).get(payload.orderId) ?? 0
    const outstandingAfterVoid = Number(sale.total_amount ?? 0) - (paid - originalAmount)
    if (payload.amount > outstandingAfterVoid + 0.005) {
      return `The corrected amount (${payload.amount}) is more than what is owed on the sale (${outstandingAfterVoid}).`
    }
    return null
  }

  const { data: order } = kind === 'inhouse'
    ? await supabase.from('transactions').select('total_amount, inhouse_details(amount_paid)').eq('id', payload.orderId).maybeSingle()
    : await supabase.from('transactions').select('total_amount, ethical_details(amount_paid)').eq('id', payload.orderId).maybeSingle()
  if (!order) return 'The order this payment belongs to could not be found.'
  const details = (kind === 'inhouse'
    ? (order as any).inhouse_details
    : (order as any).ethical_details) as { amount_paid: number | null } | null
  const outstandingAfterVoid = Number(order.total_amount ?? 0) - (Number(details?.amount_paid ?? 0) - originalAmount)
  if (payload.amount > outstandingAfterVoid + 0.005) {
    return `The corrected amount (${payload.amount}) is more than the order's outstanding balance (${outstandingAfterVoid}).`
  }
  return null
}

export async function applyCollectionChange(
  request: ChangeRequestType,
  userId: string,
  kind: CollectionKind,
): Promise<ApplyResult> {
  const collectionId = Number(
    (request.proposed_changes?.[collectionIdKey] as { to?: unknown } | undefined)?.to,
  )
  if (!collectionId || Number.isNaN(collectionId))
    return { success: false, error: 'This request is missing its payment reference — please re-file it.' }

  if (request.request_type === 'void') {
    const v = await voidCollection(collectionId, userId, kind, request.reason)
    if (!v.success) return v
    // The order's own void rolls its status back; a charged sale's 'change_request'
    // gate has to be lifted here.
    if (kind === 'pos') await restorePrevStatus(request)
    return { success: true, resultRef: request.from_transaction_no ?? undefined }
  }

  const changes = stripReservedKeys(request.proposed_changes ?? {})
  const { data: cur } = await supabase
    .from('collections')
    // '*' rather than a list: the cheque columns (20261023) are read when
    // present, and a request filed before they existed still applies.
    .select('*')
    .eq('id', collectionId)
    .maybeSingle()
  if (!cur) return { success: false, error: 'Payment not found.' }
  if (cur.voided_at) return { success: false, error: 'This payment has already been voided.' }
  const current: Record<string, unknown> = {
    amount: cur.amount,
    payment_method: cur.payment_method,
    reference_no: cur.reference_no,
    remarks: cur.remarks,
    cheque_bank: cur.cheque_bank ?? null,
    cheque_no: cur.cheque_no ?? null,
    cheque_date: cur.cheque_date ?? null,
  }
  const stale = firstStaleField(changes, current)
  if (stale) return staleError(stale)

  // The payment as it would stand after the edit. A cheque needs its bank,
  // number and date — the forms insist, and so does this, since an approved
  // request is the last point a blank cheque can be stopped.
  const method = ((toVal(changes, 'payment_method') ?? cur.payment_method) as string | undefined) || undefined
  const chequeVal = (key: string) => String(toVal(changes, key) ?? cur[key] ?? '')
  const chequeInput = { bank: chequeVal('cheque_bank'), number: chequeVal('cheque_no'), date: chequeVal('cheque_date') }
  const chequeMissing = chequeProblem(method, chequeInput)

  // Memo-only (method/reference/note/cheque details) → in place. This path never sets a
  // status of its own (unlike void/reissue), so the 'change_request' gate
  // set at propose time must be cleared explicitly here.
  if (!('amount' in changes)) {
    // Only when the edit touches the method or the cheque: a note fixed on an
    // older cheque payment recorded without details still goes through.
    const touchesCheque = 'payment_method' in changes || chequeKeys.some((k) => k in changes)
    if (touchesCheque && chequeMissing)
      return { success: false, error: `This payment would be a cheque without ${chequeMissing}. Re-file the request with the cheque details.` }
    const colUpdate: Record<string, unknown> = {}
    for (const [key, diff] of Object.entries(changes)) {
      if (memoKeys.includes(key)) colUpdate[key] = (diff as Diff).to
    }
    if (Object.keys(colUpdate).length) {
      const { error: e } = await supabase
        .from('collections')
        .update(colUpdate)
        .eq('id', collectionId)
      if (e) return { success: false, error: e.message }
    }
    await restorePrevStatus(request)
    return { success: true, resultRef: request.from_transaction_no ?? undefined }
  }

  // Amount edit → reverse the collection + re-record the corrected one.
  // Checked before anything is voided (see below).
  if (chequeMissing)
    return { success: false, error: `This payment would be a cheque without ${chequeMissing}. Re-file the request with the cheque details.` }
  const payload = {
    orderId: Number(cur.transaction_id),
    amount: Number(toVal(changes, 'amount') ?? cur.amount ?? 0),
    method,
    reference:
      ((toVal(changes, 'reference_no') ?? cur.reference_no) as string | undefined) || undefined,
    remarks: reissueRemarks(request, toVal(changes, 'remarks') ?? cur.remarks),
    // A reissue lands in the same account the original did — the correction
    // is to the amount, not to where the money went. Collections recorded
    // before cash_account_id existed have none, and the store rejects a
    // missing account rather than silently crediting a default.
    cashAccountId: Number(cur.cash_account_id),
    // The cheque comes along (with any corrected details); none for cash.
    cheque: chequeFor(method, chequeInput),
  }
  // Everything the re-record would refuse is checked BEFORE the original is
  // voided. A refusal after the void left the payment voided with no
  // replacement — and a retry then failed on "already voided", so the request
  // could only be rejected and the payment re-entered by hand.
  const blocker = await reissueBlocker(kind, payload, Number(cur.amount ?? 0))
  if (blocker) return { success: false, error: blocker }
  const v = await voidCollection(collectionId, userId, kind, reissueReason(request))
  if (!v.success) return v
  // A charged sale refuses payments while its 'change_request' gate is up.
  if (kind === 'pos') await restorePrevStatus(request)
  const res =
    kind === 'inhouse'
      ? await useInhouseDataStore().recordPayment(payload)
      : kind === 'ethical'
        ? await useEthicalDataStore().recordCollection(payload)
        : await useSalesChargesStore().recordPayment({ ...payload, saleId: payload.orderId })
  if (!res.success)
    return {
      success: false,
      error:
        'Old payment voided, but reissuing the corrected payment failed — please re-record it manually.',
    }
  return {
    success: true,
    resultId: (res as any).paymentId ?? (res as any).collectionId ?? undefined,
  }
}


/**
 * Lifts the 'change_request' gate set when the request was filed, putting the
 * document back to the status it had. Guarded on the gate so a status the
 * apply itself already set (an order's void re-deriving partial/paid) stands.
 */
export async function restorePrevStatus(request: ChangeRequestType) {
  const prevStatus = (request.proposed_changes?.[prevStatusKey] as { from?: unknown } | undefined)?.from
  if (typeof prevStatus !== 'string') return
  const { error: e } = await supabase
    .from('transactions')
    .update({ status: prevStatus, updated_at: new Date().toISOString() })
    .eq('id', request.transaction_id)
    .eq('status', 'change_request')
  if (e) console.warn('applyCollectionChange: failed to restore order status:', e.message)
}
