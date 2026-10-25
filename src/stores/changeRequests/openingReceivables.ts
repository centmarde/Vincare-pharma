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
//   original amount, paid before cutover     -> the ledger amount: the record is
//                                               voided (entry reversed) and
//                                               recorded again — the accountant's
//                                               reverse + reissue rule — keeping
//                                               its cutover date

import { supabase } from '@/lib/supabase'
import { useOpeningReceivablesStore, openingRemarks } from '@/stores/openingReceivablesData'
import type { OpeningReceivableRow } from '@/stores/openingReceivablesData'
import type { ApplyResult, ChangeRequestType } from './types'
import { stripReservedKeys, toVal, firstStaleField, staleError, reissueReason, txnLabel } from './helpers'
import { restorePrevStatus } from './collections'

/** The fields a change request on an opening receivable may carry, keyed as the dialog sends them. */
export const openingReceivableFields = {
  original_amount: 'originalAmount',
  paid_before_cutover: 'paidBeforeCutover',
  invoice_date: 'invoiceDate',
  term_days: 'termDays',
  original_no: 'originalNo',
  term_label: 'termLabel',
  notes: 'notes',
} as const satisfies Record<string, keyof OpeningReceivableRow>

const ledgerKeys = ['original_amount', 'paid_before_cutover']
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
  const stale = firstStaleField(changes, current)
  if (stale) return staleError(stale)

  const next = (key: keyof typeof openingReceivableFields) =>
    key in changes ? toVal(changes, key) : current[key]
  const invoiceDate = String(next('invoice_date') ?? cur.invoiceDate)
  const termDays = numOrNull(next('term_days'))
  const originalNo = String(next('original_no') ?? '')
  const termLabel = String(next('term_label') ?? '')
  const notes = String(next('notes') ?? '')

  // Both the re-record and the aging edit date from these: a bad date or term
  // would throw halfway through (after the void, on the re-record path), so
  // they are refused here, before anything is written.
  const touchesLedger = ledgerKeys.some((k) => k in changes)
  if (touchesLedger || agingKeys.some((k) => k in changes)) {
    if (!isValidDate(invoiceDate)) return { success: false, error: 'The invoice date is not a valid date.' }
    if (termDays !== null && !(Number.isInteger(termDays) && termDays >= 0)) {
      return { success: false, error: 'The credit term must be a whole number of days (or left blank).' }
    }
  }

  // ── The amount changed: reverse and record again ──
  if (touchesLedger) {
    const originalAmount = Number(next('original_amount') ?? 0)
    const paidBeforeCutover = Number(next('paid_before_cutover') ?? 0)
    // Everything the re-record would refuse is checked BEFORE the void, so a
    // refusal never leaves the receivable voided with nothing in its place.
    if (cur.collectedSince > 0.005) {
      return { success: false, error: 'Payments were collected against this receivable — its amount cannot be changed. Void those payments first.' }
    }
    if (!Number.isFinite(originalAmount) || !(originalAmount > 0)) return { success: false, error: 'The corrected invoice amount must be greater than zero.' }
    if (!Number.isFinite(paidBeforeCutover) || paidBeforeCutover < 0) return { success: false, error: 'The amount paid before cutover cannot be negative.' }
    if (originalAmount - paidBeforeCutover <= 0.005) {
      return { success: false, error: 'With these amounts nothing is outstanding — void the receivable instead.' }
    }
    if (cur.customerId == null) return { success: false, error: 'This receivable has no customer on record.' }
    if (!cur.cutoverDate) return { success: false, error: 'Its ledger entry could not be found, so it cannot be re-recorded. Check the General Journal.' }

    const voided = await store.voidOpeningReceivable(cur.id, reissueReason(request))
    if (!voided.success) return { success: false, error: 'Could not void the original receivable; nothing was changed.' }
    const backlink = `Replaces ${txnLabel(request.from_transaction_no, request.transaction_id)} (change request #${request.id})`
    const res = await store.addOpeningReceivable({
      customerId: cur.customerId,
      department: cur.department,
      originalNo,
      invoiceDate,
      termDays,
      termLabel,
      originalAmount,
      alreadyPaid: paidBeforeCutover,
      // An opening balance stays an opening balance: same date as before.
      cutoverDate: cur.cutoverDate,
      remarks: [backlink, notes].filter(Boolean).join(' · '),
    })
    if (!res.success) {
      return { success: false, error: 'The original was voided, but recording the corrected one failed — please re-enter it on the Opening Receivables page.' }
    }
    return { success: true, resultId: res.transactionId, resultRef: res.docNo ?? undefined }
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
