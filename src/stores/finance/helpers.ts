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

export function termFor(daysOverdue: number | null): ARAgingTerm {
  if (daysOverdue == null) return 'no-term'
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return '1-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  if (daysOverdue <= 180) return '91-180'
  return '180+'
}
