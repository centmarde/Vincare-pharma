// Shared by every receivable payment writer (Ethical collections, In-House
// payments, POS charge payments) so the payment date and the payment discount
// behave the same everywhere.

import { supabase } from '@/lib/supabase'
import { toLocalISODate } from '@/utils/helpers'
import { reverseProjectedEntry } from '@/stores/changeRequests/ledger'

/**
 * The `created_at` to store for a payment received on `paidOn` (YYYY-MM-DD).
 * The ledger books every collection — payments AND discounts — on
 * created_at::date in the database's UTC session, so the stored value must
 * fall on the picked day in UTC. A date-only value is stored as midnight UTC
 * of that day. Today keeps the real save time, except before 08:00 in Manila,
 * when that instant is still yesterday in UTC — then the picked date is
 * stored, or a payment dated Nov 1 at 00:30 would book on Oct 31.
 */
export function collectionCreatedAt(paidOn: string | null | undefined): string | undefined {
  if (!paidOn) return undefined
  const now = new Date()
  if (paidOn === toLocalISODate(now) && now.toISOString().slice(0, 10) === paidOn) return undefined
  return paidOn
}

/**
 * A payment dated before the bill existed — the ledger would book the
 * collection before the sale and drive Accounts Receivable negative that day.
 */
export function paidBeforeDocument(paidOn: string | null | undefined, documentCreatedAt: string | null | undefined): string | null {
  if (!paidOn || !documentCreatedAt) return null
  const issued = toLocalISODate(new Date(documentCreatedAt))
  return paidOn < issued ? `The payment date cannot be before the bill was issued (${issued}).` : null
}

/**
 * Pesos rounded to the centavo, half away from zero — sums like 75,065.63 +
 * 18,772.35 drift in floating point, and a product like 20.15 × 0.5 is
 * 10.074999… in binary, which a plain Math.round(x * 100) takes down to
 * 10.07. Trimming to 15 significant digits first restores the 10.075 that
 * was meant, and the shift is done in the exponent (no second multiply), so
 * it rounds to 10.08.
 */
export function roundPeso(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value === 0 ? 0 : value
  const sign = value < 0 ? -1 : 1
  const [mantissa, exponent] = Number(Math.abs(value).toPrecision(15)).toExponential().split('e')
  const cents = Math.round(Number(`${mantissa}e${Number(exponent) + 2}`))
  return sign * Number(`${cents}e-2`)
}

/**
 * The balance left on a bill and whether `amount` fits inside it, compared to
 * the centavo: "pay X, discount the exact rest" must never be refused (or leave
 * the bill at partial with ₱0 owed) because of a floating-point remainder.
 */
export function settleAgainst(total: number, paid: number, amount: number) {
  const balance = roundPeso(total - paid)
  const newPaid = roundPeso(paid + amount)
  return {
    balance,
    newPaid,
    exceeds: roundPeso(amount) > balance + 0.005,
    settled: newPaid >= roundPeso(total) - 0.005,
  }
}

/**
 * What has been paid on a bill so far: the larger of the cached amount_paid
 * and the sum of its live payment rows. The cache can lag a payment whose
 * cache write failed (and must not let the same amount be entered again);
 * older orders carry amount_paid with no payment rows behind it. null when
 * the payments could not be read.
 */
export async function paidSoFar(transactionId: number, cachedPaid: number | null | undefined): Promise<number | null> {
  const { data, error } = await supabase
    .from('collections').select('amount').eq('transaction_id', transactionId).is('voided_at', null)
  if (error) return null
  const rows = roundPeso((data ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0))
  return Math.max(roundPeso(Number(cachedPaid ?? 0)), rows)
}

/** A payment date staff entered, refused if it is in the future. */
export function paymentDateProblem(paidOn: string | null | undefined): string | null {
  if (!paidOn) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return 'Enter a valid payment date.'
  if (paidOn > toLocalISODate(new Date())) return 'The payment date cannot be in the future.'
  return null
}

/**
 * Write an order's paid-amount cache after a payment row was saved. Tried
 * twice; if it still fails, the payment row is undone (soft-voided, and its
 * ledger entry reversed should the projector have booked it already), so the
 * cache never falls behind the rows. That matters because older orders carry
 * amount_paid with no payment rows behind it — a lagging cache could not be
 * rebuilt from the rows, and the same payment could be entered again.
 *
 * Discounts need nothing else: gl_project_events books a payment_discount row
 * itself (DR 4040 / CR 1030, no cash) on its created_at date, like every other
 * collection — so the app never posts or deletes a discount entry.
 */
export async function saveOrderBalance(
  write: () => PromiseLike<{ error: { message: string } | null }>,
  collectionId: number,
  userId: string,
): Promise<{ saved: true } | { saved: false; undone: boolean; error: string }> {
  let { error } = await write()
  if (!error) return { saved: true }
  ;({ error } = await write())
  if (!error) return { saved: true }
  console.warn('saveOrderBalance: paid amount not saved, undoing the payment:', error.message)
  const { data: voided, error: voidError } = await supabase
    .from('collections')
    .update({ voided_at: new Date().toISOString(), voided_by: userId, void_reason: 'Not recorded: the order balance could not be updated' })
    .eq('id', collectionId)
    .is('voided_at', null)
    .select('id')
  if (voidError || !voided?.length) return { saved: false, undone: false, error: error.message }
  const reversed = await reverseProjectedEntry('collection', collectionId, userId)
  if (!reversed.ok) console.warn('saveOrderBalance: ledger entry not reversed:', reversed.error)
  return { saved: false, undone: true, error: error.message }
}
