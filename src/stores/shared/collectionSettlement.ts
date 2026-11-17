// Shared by every receivable payment writer (Ethical collections, In-House
// payments, POS charge payments) so the payment date and the payment discount
// behave the same everywhere.

import { supabase } from '@/lib/supabase'
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
  paidOn: string | null | undefined,
  description: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await useGLDataStore().postJournalEntry(
    // Same day as the payment beside it: a back-dated one is stored as that
    // date, and one for today keeps created_at = now(), which the projector
    // books on its UTC date — so this uses the UTC date too, or between
    // 00:00 and 08:00 Manila the two would land on different days.
    paidOn || new Date().toISOString().slice(0, 10),
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
  // Likewise a header that landed without its lines must not lose its row.
  const { data: live } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('reference_type', 'collection')
    .eq('reference_id', collectionId)
    .neq('status', 'reversed')
    .limit(1)
  if (live?.length) return { ok: true }
  if (result.entryId) {
    console.warn('bookPaymentDiscount: entry header posted without its lines:', result.entryId, result.error)
    return { ok: false, error: result.error }
  }
  const { error: deleteError } = await supabase.from('collections').delete().eq('id', collectionId)
  if (deleteError) console.warn('bookPaymentDiscount: could not remove the discount row:', deleteError.message)
  return { ok: false, error: result.error }
}
