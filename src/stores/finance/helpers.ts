// Pure helpers for the financeData store: category labels, AR/AP bucketing,
// date-range filters and the cash-account -> GL account resolver. No Supabase
// and no state, so any feature file (or another store) can use them.

import { legacyExpenseCategories } from './types'
import type { APAgeBucket, ARAgingTerm, CashClassification, DateRange, ExpenseCategory } from './types'

/**
 * An expense category's display label.
 *
 * Pass the chart of accounts and an account code resolves to its name
 * ('7050' -> 'Fuel & Lubricant Expense'); without it, or for a code the chart
 * no longer has, the legacy slug map answers and the raw value is the last
 * resort so a label is never blank. Callers with access to the GL store should
 * always pass `chart` — `useExpenseAccounts()` wraps this and is the one to
 * reach for in a component.
 */
export const categoryTitle = (
  value: ExpenseCategory | null | undefined,
  chart?: readonly { code: string; name: string }[],
): string => {
  if (!value) return ''
  const account = chart?.find((a) => a.code === value)
  if (account) return account.name
  return legacyExpenseCategories.find((c) => c.value === value)?.title ?? value
}

/**
 * The supplier's own document numbers on a receipt — "DO NO. 2026-557",
 * "DR NO. 235260", "SI NO. 4450". There is no column for them: Purchasing types
 * them into the receipt's remarks as "DO NO. 2026-557 = 190,000.00", one per
 * line, so they are read from there. A line in any other shape is ignored.
 */
export function supplierDocRefs(remarks: string | null | undefined): string[] {
  const refs: string[] = []
  for (const match of (remarks ?? '').matchAll(/\b([A-Z]{2,4})\s*NO\.?\s*([A-Z0-9][A-Z0-9/.-]*)\s*=/gi)) {
    refs.push(`${match[1].toUpperCase()} NO. ${match[2].replace(/\.+$/, '')}`)
  }
  return [...new Set(refs)]
}

/** The PO / SI numbers in a text, normalised ('PO-2026-073' -> 'PO-2026-73'). */
export function purchaseDocKeys(text: string | null | undefined): string[] {
  const keys: string[] = []
  for (const m of (text ?? '').matchAll(/\b(PO|SI)-(\d{4})-(\d+)\b/gi)) {
    keys.push(`${m[1].toUpperCase()}-${m[2]}-${Number(m[3])}`)
  }
  return [...new Set(keys)]
}

type AllocInvoice = { supplier_id: number; po_no: string | null; reference_no: string | null; total_amount: number }
type AllocPayment = { supplier_id: number; amount: number; remarks: string | null; payment_no: string | null }

/**
 * Which invoice each supplier payment paid. A payment pays the invoices whose
 * PO / SI number it names (a voucher raised from "Pay" names its PO), so money
 * paid for one PO never shows as paid on another. Only a payment that names no
 * PO / SI at all is spread over the supplier's oldest unpaid invoices.
 *
 * Whatever a named payment could not place — more than its invoice's balance
 * (e.g. the same PO paid twice) or a number no received invoice of that
 * supplier carries — is returned as `unapplied` instead of being spent on some
 * other PO.
 *
 * `invoices` must be sorted oldest first; `paid[i]` belongs to `invoices[i]`.
 */
export function allocateSupplierPayments(invoices: readonly AllocInvoice[], payments: readonly AllocPayment[]) {
  const remaining = invoices.map((inv) => inv.total_amount)
  const byKey = new Map<string, number[]>()
  invoices.forEach((inv, i) => {
    const keys = new Set([...purchaseDocKeys(inv.po_no), ...purchaseDocKeys(inv.reference_no)])
    for (const key of keys) {
      const k = `${inv.supplier_id}|${key}`
      byKey.set(k, [...(byKey.get(k) ?? []), i])
    }
  })
  const cents = (n: number) => Math.round(n * 100) / 100
  const pool = new Map<number, number>()
  const unapplied: { supplier_id: number; payment_no: string | null; refs: string[]; amount: number; reason: 'over' | 'no_invoice' }[] = []

  for (const p of payments) {
    const refs = purchaseDocKeys(p.remarks)
    if (!refs.length) {
      pool.set(p.supplier_id, (pool.get(p.supplier_id) ?? 0) + p.amount)
      continue
    }
    const targets = [...new Set(refs.flatMap((key) => byKey.get(`${p.supplier_id}|${key}`) ?? []))].sort((a, b) => a - b)
    let left = p.amount
    for (const i of targets) {
      const take = Math.min(left, remaining[i])
      remaining[i] = cents(remaining[i] - take)
      left = cents(left - take)
      if (left <= 0) break
    }
    if (left > 0.005) {
      // Shown as written ('PO-2026-073'), not as the matching key.
      const written = [...new Set((p.remarks ?? '').match(/\b(PO|SI)-\d{4}-\d+\b/gi) ?? [])].map((ref) => ref.toUpperCase())
      unapplied.push({ supplier_id: p.supplier_id, payment_no: p.payment_no, refs: written, amount: left, reason: targets.length ? 'over' : 'no_invoice' })
    }
  }

  // Unreferenced payments: the supplier's oldest unpaid invoices first.
  invoices.forEach((inv, i) => {
    const available = pool.get(inv.supplier_id) ?? 0
    if (available <= 0) return
    const take = Math.min(available, remaining[i])
    remaining[i] = cents(remaining[i] - take)
    pool.set(inv.supplier_id, cents(available - take))
  })

  return { paid: invoices.map((inv, i) => cents(inv.total_amount - remaining[i])), unapplied }
}

export function apBucketFor(daysOutstanding: number): APAgeBucket {
  if (daysOutstanding <= 30) return '0-30'
  if (daysOutstanding <= 60) return '31-60'
  if (daysOutstanding <= 90) return '61-90'
  if (daysOutstanding <= 180) return '91-180'
  return '180+'
}

export function applyDateRange<T>(q: T, column: string, range?: DateRange): T {
  let query: any = q
  if (range?.dateFrom) query = query.gte(column, range.dateFrom)
  if (range?.dateTo) query = query.lte(column, range.dateTo)
  return query
}

/**
 * Legacy classification -> GL asset account map (was the gl_cash_code SQL
 * helper). Superseded by `cash_accounts.gl_account_code`, which records the link
 * instead of inferring it — three classifications cannot address the chart's
 * eight cash-ish asset accounts.
 *
 * Kept only as the fallback for rows created before that column existed, and as
 * the default the create form offers. Prefer `glAccountCodeFor(account)`.
 */
export function glCashCode(classification: CashClassification): string {
  if (classification === 'PETTY_CASH') return '1010'      // Cash on Hand
  if (classification === 'TIME_INVESTMENT') return '1100' // Other Investment
  return '1020'                                           // Cash in Bank (CASA / default)
}

/**
 * Which GL account a cash account posts to. The recorded link wins; the
 * classification map is the fallback for rows that predate it.
 *
 * Every cash posting must go through here. Two separate inline copies of the
 * classification map had already drifted apart before this existed — one of them
 * sent time deposits to 1020 instead of 1100.
 */
export function glAccountCodeFor(
  account: { classification: CashClassification; gl_account_code?: string | null },
): string {
  return account.gl_account_code || glCashCode(account.classification)
}

/**
 * The account an expense's category books to when the category is not itself
 * an account code in the chart — rows written before categories became account
 * codes still carry these slugs. The SAME frozen map as `gl_project_events`'
 * expense loop: an expense corrected in place is posted by the app, and it must
 * land where the projector would have put it. Anything unknown falls to 7080.
 */
const legacyExpenseAccountCodes: Record<string, string> = {
  rent: '7130', utilities: '7270', supplies: '7080', maintenance: '7150',
  transportation: '7250', taxes_fees: '7240', taxes_licenses: '7240',
  representation: '6040', fuel_lubricants: '7050', labor_services: '7070',
  freight_handling: '5030', meals: '6040',
}

/** The debit account for an expense category, given whether it is a chart code. */
export function expenseDebitAccount(category: string | null | undefined, isChartCode: boolean): string {
  if (category && isChartCode) return category
  return (category && legacyExpenseAccountCodes[category]) || '7080'
}

export function termFor(daysOverdue: number | null): ARAgingTerm {
  if (daysOverdue == null) return 'no-term'
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return '1-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  if (daysOverdue <= 180) return '91-180'
  return '180+'
}
