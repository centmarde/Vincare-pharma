// Shared by every receivable payment writer (Ethical collections, In-House
// payments, POS charge payments) so the payment date and the payment discount
// behave the same everywhere.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useGLDataStore } from '@/stores/glData'
import { toLocalISODate } from '@/utils/helpers'

/**
 * The `created_at` to store for a payment received on `paidOn` (YYYY-MM-DD).
 * The ledger books a collection on its created_at date, so a back-dated
 * payment lands in the right day. Today (or nothing) keeps the real
 * timestamp. A date-only value is stored as that day, the same way the
 * pre-cutover credit memo is.
 */
export function collectionCreatedAt(paidOn: string | null | undefined): string | undefined {
  if (!paidOn || paidOn === toLocalISODate(new Date())) return undefined
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

/** Pesos rounded to the centavo — sums like 75,065.63 + 18,772.35 drift in floating point. */
export function roundPeso(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
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
 * The day the ledger books a collection on: gl_project_events reads
 * created_at::date (the database runs in UTC), so the app books a discount on
 * the UTC date of the row it just saved — read from the row, not the clock,
 * so a save just before midnight UTC can't land a day apart. A back-dated
 * payment is stored as that date (midnight UTC), which gives the same day.
 */
export function ledgerDateOf(createdAt: string | null | undefined): string {
  if (createdAt && /^\d{4}-\d{2}-\d{2}$/.test(createdAt)) return createdAt
  const at = createdAt ? new Date(createdAt) : new Date()
  return (Number.isNaN(at.getTime()) ? new Date() : at).toISOString().slice(0, 10)
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
 * Book a payment discount the app itself: DR 4040 Sales discount / CR 1030
 * Accounts Receivable, on the collection's own reference so gl_project_events
 * skips it (it skips any collection that already has an entry) and never
 * debits cash for it. If the entry cannot be posted, the discount row is
 * removed again — a discount the ledger does not know about would leave the
 * bill settled with Accounts Receivable still showing it owed.
 */
export async function bookPaymentDiscount(
  collectionId: number,
  amount: number,
  /** The saved collection row's created_at. */
  rowCreatedAt: string | null | undefined,
  description: string,
  userId: string,
): Promise<{ ok: boolean; error?: string; stuck?: boolean }> {
  const result = await useGLDataStore().postJournalEntry(
    ledgerDateOf(rowCreatedAt),
    'collection',
    collectionId,
    description,
    [
      { account_code: '4040', debit: amount, credit: 0, memo: 'Discount given at payment' },
      { account_code: '1030', debit: 0, credit: amount, memo: 'Taken off what the customer owes' },
    ],
    userId,
  )
  if (result.success) return { ok: true }
  // The statements run the projector, which (since 2026-11-17) books a
  // discount row itself; if it got there first, the unique "one live entry per
  // reference" index refused ours and the discount IS in the ledger — keep it.
  // Only an entry that has lines counts: a bare header books nothing.
  // An unreadable ledger is NOT an empty one: the row stays (never deleted on
  // a guess) and the discount is reported as needing a manual check.
  const manualFix = (why: string) => ({
    ok: false,
    stuck: true,
    error: `${why} — discount #${collectionId} needs a manual check by Finance`,
  })
  const { data: live, error: liveError } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('reference_type', 'collection')
    .eq('reference_id', collectionId)
    .neq('status', 'reversed')
  if (liveError) return manualFix('Could not read the ledger')
  const liveIds = (live ?? []).map((e) => e.id as number)
  let bareHeader = false
  if (liveIds.length) {
    const { count: lineCount, error: countError } = await supabase
      .from('journal_entry_lines').select('id', { count: 'exact', head: true }).in('journal_entry_id', liveIds)
    if (countError) return manualFix('Could not read the ledger')
    if (lineCount) return { ok: true }
    bareHeader = true
  }
  const { error: deleteError } = await supabase.from('collections').delete().eq('id', collectionId)
  if (!deleteError) return { ok: false, error: result.error }
  console.warn('bookPaymentDiscount: could not remove the discount row:', deleteError.message)
  // The row stays and counts toward what was paid. With no entry at all, the
  // projector books a payment_discount row on the next statement view, so it
  // IS recorded. A bare header blocks that (the projector skips any row with
  // an entry): then nobody will book it, and it must be fixed by hand.
  if (bareHeader) return manualFix('The ledger entry failed and could not be undone')
  useToast().warning('The discount was saved; its ledger entry will be posted the next time a financial statement is opened.')
  return { ok: true }
}
