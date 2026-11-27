// Opening receivable applier: void, in-place edit, or reverse + re-record.
//
// An opening receivable is an in-house/ethical order row carrying a pre-cutover
// invoice, booked DR 1030 / CR 3050 Opening Balance Equity at the cutover date
// (openingReceivablesData). The request is filed on that order and marked with
// openingReceivableKey, so apply.ts sends it here rather than to the payment
// applier.
//
// What an edit does depends on what it touches:
//   their invoice no., term wording, notes   -> remarks, in place
//   invoice date, credit term                -> aging only, in place (the
//                                               ledger entry is dated at cutover)
//   original amount, paid before cutover,
//   the pre-cutover credit memo              -> the ledger amount, IN PLACE: the
//                                               same document keeps its number;
//                                               its entry is reversed and the
//                                               corrected one posted on the same
//                                               cutover date (see correctAmountsInPlace)
//
// Amount corrections used to void the receivable and record a copy under a new
// number. Staff saw their corrected invoice turn "Cancelled" next to a stranger
// EO number; the ledger effect was the same as this in-place correction.

import { supabase } from '@/lib/supabase'
import { useOpeningReceivablesStore, openingRemarks, isPreCutoverCredit, preCutoverCreditPrefix } from '@/stores/openingReceivablesData'
import type { OpeningReceivableRow } from '@/stores/openingReceivablesData'
import { useGLDataStore, openingBalanceEquityCode } from '@/stores/glData'
import type { ApplyResult, ChangeRequestType, Diff } from './types'
import { stripReservedKeys, toVal, firstStaleField, staleError, reissueReason, txnLabel, normVal } from './helpers'
import { restorePrevStatus } from './collections'

/** The fields a change request on an opening receivable may carry, keyed as the dialog sends them. */
export const openingReceivableFields = {
  original_amount: 'originalAmount',
  paid_before_cutover: 'paidBeforeCutover',
  credit_memo_amount: 'creditBeforeCutover',
  credit_memo_no: 'creditMemoNo',
  credit_memo_date: 'creditMemoDate',
  invoice_date: 'invoiceDate',
  term_days: 'termDays',
  original_no: 'originalNo',
  term_label: 'termLabel',
  notes: 'notes',
} as const satisfies Record<string, keyof OpeningReceivableRow>

// The credit memo's number and date are on its own ledger-backed record, so any
// change to it goes the reverse + record-again way too.
const ledgerKeys = ['original_amount', 'paid_before_cutover', 'credit_memo_amount', 'credit_memo_no', 'credit_memo_date']
const agingKeys = ['invoice_date', 'term_days']

const dayMs = 86400000
const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * dayMs).toISOString().slice(0, 10)

const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

const isValidDate = (iso: string) => /^\d{4}-\d{2}-\d{2}/.test(iso) && !Number.isNaN(new Date(iso).getTime())

export async function applyOpeningReceivableChange(request: ChangeRequestType, userId: string): Promise<ApplyResult> {
  const store = useOpeningReceivablesStore()
  const rows = await store.fetchOpeningReceivables()
  const cur = rows.find((r) => r.id === request.transaction_id)
  if (!cur) return { success: false, error: 'Opening receivable not found (it may already be voided).' }

  if (request.request_type === 'void') {
    if (cur.collectedSince > 0.005) {
      return { success: false, error: 'Payments were collected against this receivable — void those first.' }
    }
    const res = await store.voidOpeningReceivable(cur.id, request.reason || 'Voided via change request')
    return res.success
      ? { success: true, resultRef: request.from_transaction_no ?? undefined }
      : { success: false, error: 'Could not void the opening receivable.' }
  }

  const changes = stripReservedKeys(request.proposed_changes ?? {})
  const current: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(openingReceivableFields)) current[key] = cur[field]

  // The amount changed: corrected in place (its own stale check).
  if (ledgerKeys.some((k) => k in changes)) return correctAmountsInPlace(request, cur, changes, current, userId)

  const stale = firstStaleField(changes, current)
  if (stale) return staleError(stale)

  const next = (key: keyof typeof openingReceivableFields) =>
    key in changes ? toVal(changes, key) : current[key]
  const invoiceDate = String(next('invoice_date') ?? cur.invoiceDate)
  const termDays = numOrNull(next('term_days'))
  const originalNo = String(next('original_no') ?? '')
  const termLabel = String(next('term_label') ?? '')
  const notes = String(next('notes') ?? '')

  // The aging edit dates from these: a bad date or term is refused here,
  // before anything is written.
  if (agingKeys.some((k) => k in changes)) {
    if (!isValidDate(invoiceDate)) return { success: false, error: 'The invoice date is not a valid date.' }
    if (termDays !== null && !(Number.isInteger(termDays) && termDays >= 0)) {
      return { success: false, error: 'The credit term must be a whole number of days (or left blank).' }
    }
  }

  // ── Remarks and aging: in place ──
  const isInhouse = cur.department === 'inhouse'
  const txUpdate: Record<string, unknown> = {
    remarks: openingRemarks({ originalNo, termLabel, notes }),
    updated_at: new Date().toISOString(),
  }
  if (agingKeys.some((k) => k in changes)) {
    // The document's own date is the invoice date (it ages from there).
    txUpdate.created_at = invoiceDate
    txUpdate.paid_at = invoiceDate
    const dueDate = termDays === null ? null : addDays(invoiceDate, termDays)
    const detailUpdate: Record<string, unknown> = { due_date: dueDate }
    if (!isInhouse) detailUpdate.terms_days = termDays
    const { error: dErr } = await supabase
      .from(isInhouse ? 'inhouse_details' : 'ethical_details')
      .update(detailUpdate)
      .eq('transaction_id', cur.id)
    if (dErr) return { success: false, error: dErr.message }
  }
  const { error: tErr } = await supabase.from('transactions').update(txUpdate).eq('id', cur.id)
  if (tErr) return { success: false, error: tErr.message }

  await restorePrevStatus(request)
  await supabase.from('logs').insert({
    created_by: userId,
    action: 'opening_receivable_edit',
    description: `Change request #${request.id} applied to ${txnLabel(request.from_transaction_no, request.transaction_id)}`,
    module: 'finance',
    transaction_id: cur.id,
  })
  return { success: true, resultRef: request.from_transaction_no ?? undefined }
}

/**
 * Correct an opening receivable's AMOUNTS on the same document.
 *
 * Order, so that approving again after a part-way failure finishes the job:
 *   1. the opening entry (DR 1030 / CR 3050): reversed and re-posted on the
 *      cutover date, unless it already carries the corrected amount;
 *   2. the pre-cutover credit memo: voided and recorded again, unless it
 *      already matches;
 *   3. the document (face value, the cached amount paid, remarks, aging);
 *   4. its status lifted.
 *
 * "Paid before cutover" is not stored: it is the cached amount_paid less the
 * credit memo rows. Between steps 2 and 3 the two disagree, so the stale check
 * accepts that in-between state, and an unchanged "paid before cutover" is
 * then read off the corrected entry (step 1 is always done by then).
 */
async function correctAmountsInPlace(
  request: ChangeRequestType,
  cur: OpeningReceivableRow,
  changes: ReturnType<typeof stripReservedKeys>,
  current: Record<string, unknown>,
  userId: string,
): Promise<ApplyResult> {
  const store = useOpeningReceivablesStore()
  const isInhouse = cur.department === 'inhouse'
  const fromOf = (key: string) => (key in changes ? (changes[key] as Diff).from : undefined)
  const toOf = (key: string) => (key in changes ? (changes[key] as Diff).to : undefined)
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005
  const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100

  if (cur.collectedSince > 0.005) {
    return { success: false, error: 'Payments were collected against this receivable — its amount cannot be changed. Void those payments first.' }
  }
  if (cur.customerId == null) return { success: false, error: 'This receivable has no customer on record.' }

  // ── What is live now ──
  const [entry, creditsRes, detailRes] = await Promise.all([
    store.openingEntryState(cur.id),
    supabase.from('collections')
      .select('id, amount, reference_no, created_at, remarks, voided_at')
      .eq('transaction_id', cur.id)
      .order('id', { ascending: true }),
    supabase.from(isInhouse ? 'inhouse_details' : 'ethical_details')
      .select('amount_paid').eq('transaction_id', cur.id).maybeSingle(),
  ])
  if ('error' in entry) return { success: false, error: `Could not read its ledger entry (${entry.error}). Nothing was changed — try again.` }
  if (creditsRes.error) return { success: false, error: 'Could not read its credit memo. Nothing was changed — try again.' }
  if (detailRes.error) return { success: false, error: 'Could not read what was paid on it. Nothing was changed — try again.' }
  if (!entry.cutoverDate) return { success: false, error: 'Its ledger entry could not be found, so it cannot be corrected. Check the General Journal.' }
  const cutover = entry.cutoverDate

  const allCredits = ((creditsRes.data ?? []) as any[]).filter((c) => isPreCutoverCredit(c.remarks))
  const liveCredits = allCredits.filter((c) => !c.voided_at)
  // When a correction stopped between voiding the old memo and recording the
  // new one, the old memo's number, date and reason are read from it.
  const lastCredit = liveCredits[0] ?? allCredits[allCredits.length - 1] ?? null
  const liveCredit = {
    credit_memo_amount: money(liveCredits.reduce((sum, c) => sum + Number(c.amount ?? 0), 0)),
    credit_memo_no: liveCredits[0]?.reference_no ?? '',
    credit_memo_date: liveCredits[0]?.created_at ? String(liveCredits[0].created_at).slice(0, 10) : null,
  }
  const creditReason = lastCredit
    ? String(lastCredit.remarks ?? '').slice(preCutoverCreditPrefix.length).replace(/^ — /, '')
    : cur.creditMemoReason
  const cache = money((detailRes.data as { amount_paid?: number } | null)?.amount_paid)
  const since = cur.collectedSince

  // ── Stale check ──
  const creditKeys = ['credit_memo_amount', 'credit_memo_no', 'credit_memo_date'] as const
  const creditChanging = creditKeys.some((k) => k in changes)
  for (const k of creditKeys) {
    if (!(k in changes)) continue
    const live = normVal(liveCredit[k])
    const okNow = live === normVal(fromOf(k)) || live === normVal(toOf(k))
    // Between voiding the old memo and recording the new one there is none.
    if (!okNow && !(liveCredits.length === 0 && creditChanging)) return staleError(k)
  }
  // Paid before cutover, read two ways: against the credit memo as it stands,
  // and against the memo as it was (while the cached amount still holds it).
  const paidCandidates = [money(cache - since - liveCredit.credit_memo_amount)]
  if ('credit_memo_amount' in changes) paidCandidates.push(money(cache - since - Number(fromOf('credit_memo_amount') ?? 0)))
  const others = Object.keys(changes).filter((k) => !(creditKeys as readonly string[]).includes(k) && k !== 'paid_before_cutover')
  const otherStale = firstStaleField(Object.fromEntries(others.map((k) => [k, changes[k]])), current, true)
  if (otherStale) return staleError(otherStale)

  let paidBeforeCutover: number
  if ('paid_before_cutover' in changes) {
    const ok = paidCandidates.some((p) => near(p, Number(fromOf('paid_before_cutover') ?? 0)) || near(p, Number(toOf('paid_before_cutover') ?? 0)))
    if (!ok) return staleError('paid_before_cutover')
    paidBeforeCutover = money(toOf('paid_before_cutover'))
  } else if (paidCandidates.every((p) => near(p, paidCandidates[0]))) {
    paidBeforeCutover = paidCandidates[0]
  } else if (entry.live) {
    // The credit memo has moved but the cached amount not yet: the entry,
    // already corrected in step 1, carries face value less paid before cutover.
    const originalTarget = 'original_amount' in changes ? money(toOf('original_amount')) : cur.originalAmount
    paidBeforeCutover = money(originalTarget - entry.live.amount)
  } else {
    return { success: false, error: 'This correction stopped part-way and its amounts cannot be worked out safely. Check the receivable on the Opening Receivables page, then re-file the request.' }
  }

  // ── The corrected figures ──
  const next = (key: keyof typeof openingReceivableFields) => (key in changes ? toOf(key) : current[key])
  const originalAmount = money(next('original_amount'))
  const creditAmount = money('credit_memo_amount' in changes ? toOf('credit_memo_amount') : (liveCredits.length ? liveCredit.credit_memo_amount : cur.creditBeforeCutover))
  const creditNo = String(('credit_memo_no' in changes ? toOf('credit_memo_no') : (liveCredit.credit_memo_no || lastCredit?.reference_no)) ?? '')
  const creditDateRaw = 'credit_memo_date' in changes
    ? toOf('credit_memo_date')
    : liveCredit.credit_memo_date ?? (lastCredit?.created_at ? String(lastCredit.created_at).slice(0, 10) : null)
  const creditDate = creditDateRaw ? String(creditDateRaw).slice(0, 10) : cutover
  const invoiceDate = String(next('invoice_date') ?? cur.invoiceDate)
  const termDays = numOrNull(next('term_days'))
  const originalNo = String(next('original_no') ?? '')
  const termLabel = String(next('term_label') ?? '')
  const notes = String(next('notes') ?? '')

  if (!isValidDate(invoiceDate)) return { success: false, error: 'The invoice date is not a valid date.' }
  if (termDays !== null && !(Number.isInteger(termDays) && termDays >= 0)) {
    return { success: false, error: 'The credit term must be a whole number of days (or left blank).' }
  }
  if (!Number.isFinite(originalAmount) || !(originalAmount > 0)) return { success: false, error: 'The corrected invoice amount must be greater than zero.' }
  if (!Number.isFinite(paidBeforeCutover) || paidBeforeCutover < 0) return { success: false, error: 'The amount paid before cutover cannot be negative.' }
  if (!Number.isFinite(creditAmount) || creditAmount < 0) return { success: false, error: 'The credit memo amount cannot be negative.' }
  if (creditAmount > 0 && (!isValidDate(creditDate) || creditDate > cutover)) {
    return { success: false, error: 'The credit memo must be dated on or before the cutover date.' }
  }
  if (originalAmount - paidBeforeCutover - creditAmount <= 0.005) {
    return { success: false, error: 'With these amounts nothing is outstanding — void the receivable instead.' }
  }

  const gl = useGLDataStore()
  const label = txnLabel(request.from_transaction_no, request.transaction_id)

  // 1. The opening entry.
  const beforeCredit = money(originalAmount - paidBeforeCutover)
  if (!(entry.live && near(entry.live.amount, beforeCredit))) {
    if (entry.live) {
      const reversed = await gl.reverseJournalEntry(entry.live.id, userId, undefined, undefined, cutover)
      if (!reversed.success) return { success: false, error: reversed.error || 'Could not reverse its ledger entry. Nothing was changed.' }
    }
    const posted = await gl.postJournalEntry(
      cutover,
      'sales_invoice',
      cur.id,
      `Opening receivable ${label} — ${originalNo || 'unnumbered'} (corrected via change request #${request.id})`,
      [
        { account_code: '1030', debit: beforeCredit, credit: 0 },
        { account_code: openingBalanceEquityCode, debit: 0, credit: beforeCredit },
      ],
      userId,
    )
    if (!posted.success) {
      return { success: false, error: `The old ledger entry was reversed, but the corrected one could not be posted (${posted.error ?? 'unknown error'}). Approve the request again to finish.` }
    }
  }

  // 2. The pre-cutover credit memo.
  const creditMatches = near(liveCredit.credit_memo_amount, creditAmount)
    && (creditAmount === 0 || (normVal(liveCredit.credit_memo_no) === normVal(creditNo) && normVal(liveCredit.credit_memo_date) === normVal(creditDate)))
  if (!creditMatches) {
    if (liveCredits.length) {
      const voided = await store.voidPreCutoverCredits(liveCredits.map((c) => c.id), reissueReason(request), userId)
      if (!voided.success) return { success: false, error: `${voided.error} The ledger entry is already corrected — approve the request again to finish.` }
    }
    if (creditAmount > 0) {
      const recorded = await store.recordPreCutoverCredit(cur.id, request.from_transaction_no, {
        number: creditNo, date: creditDate, amount: creditAmount, reason: creditReason,
      }, cutover, userId)
      if (!recorded.success) return { success: false, error: `The corrected credit memo could not be recorded (${recorded.error}). Approve the request again to finish.` }
    }
  }

  // 3. The document: details first, then the header.
  const dueDate = termDays === null ? null : addDays(invoiceDate, termDays)
  const detailUpdate: Record<string, unknown> = { amount_paid: money(paidBeforeCutover + creditAmount + since), due_date: dueDate }
  if (!isInhouse) detailUpdate.terms_days = termDays
  const { error: dErr } = await supabase
    .from(isInhouse ? 'inhouse_details' : 'ethical_details').update(detailUpdate).eq('transaction_id', cur.id)
  if (dErr) return { success: false, error: `The ledger is corrected, but the receivable itself could not be updated (${dErr.message}). Approve the request again to finish.` }
  const { error: tErr } = await supabase.from('transactions').update({
    total_amount: originalAmount,
    subtotal: originalAmount,
    remarks: openingRemarks({ originalNo, termLabel, notes }),
    created_at: invoiceDate,
    paid_at: invoiceDate,
    updated_at: new Date().toISOString(),
  }).eq('id', cur.id)
  if (tErr) return { success: false, error: `The ledger is corrected, but the receivable itself could not be updated (${tErr.message}). Approve the request again to finish.` }

  // 4. Lift the gate and leave a trail.
  await restorePrevStatus(request)
  await supabase.from('logs').insert({
    created_by: userId,
    action: 'opening_receivable_correct',
    description: `Change request #${request.id} corrected ${label} in place: face ${originalAmount}, paid before cutover ${paidBeforeCutover}`
      + (creditAmount > 0 ? `, credit memo ${creditNo || '(unnumbered)'} ${creditAmount}` : ''),
    module: 'finance',
    transaction_id: cur.id,
  })
  return { success: true, resultRef: request.from_transaction_no ?? undefined }
}
