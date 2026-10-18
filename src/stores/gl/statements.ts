// Financial statements: Trial Balance, Income Statement (single period and
// month by month, by deliveries and by collections) and Balance Sheet.

import { supabase } from '@/lib/supabase'
import type {
  BalanceSheet,
  IncomeStatement,
  MonthlyCollectionIncomeStatement,
  MonthlyIncomeStatement,
  TrialBalanceRow,
} from './types'
import { monthsBetween, monthBounds } from './helpers'
import { computeCollectionStatements } from './collectionBasis'
import {
  trialBalance,
  incomeStatement,
  balanceSheet,
  collectionIncomeStatement,
  monthlyIncomeStatement,
  monthlyCollectionIncomeStatement,
  loading,
  handleError,
  clearError,
} from './state'

/**
 * Claimed by every statement fetch before its first await and re-checked
 * before it publishes. Rapid date / basis / layout changes fire overlapping
 * requests, and without this an older one can resolve last and put its
 * figures under the newer period's heading — on screen and in the PDF.
 */
let statementSeq = 0

/** The Income Statement by collections for one period. See ./collectionBasis. */
export async function fetchCollectionIncomeStatement(from: string, to: string) {
  const requestId = ++statementSeq
  loading.value = true
  clearError()
  try {
    const [statement] = await computeCollectionStatements(from, to, [{ start: from, end: to }])
    // A slower earlier request must not publish over a newer one: the header
    // would name the period the user picked while the figures came from the
    // one before it.
    if (requestId !== statementSeq) return collectionIncomeStatement.value
    collectionIncomeStatement.value = statement
    return statement
  } catch (err) {
    handleError(err, 'Failed to compute the income statement by collections')
    if (requestId === statementSeq) collectionIncomeStatement.value = null
    return null
  } finally {
    if (requestId === statementSeq) loading.value = false
  }
}

export async function fetchMonthlyIncomeStatement(from: string, to: string) {
  const requestId = ++statementSeq
  loading.value = true
  clearError()
  try {
    const months = monthsBetween(from, to)
    const perMonth: IncomeStatement[] = []
    for (const month of months) {
      const { start, end } = monthBounds(month, from, to)
      const { data, error: e } = await supabase.rpc('gl_income_statement', { p_from: start, p_to: end })
      // Throws rather than skipping: perMonth is read positionally against
      // `months`, so dropping one entry would slide every later month under
      // the wrong column heading.
      if (e) throw e
      perMonth.push(data as IncomeStatement)
    }
    const { data: totalData, error: totalError } = await supabase.rpc('gl_income_statement', { p_from: from, p_to: to })
    if (totalError) throw totalError

    const statement: MonthlyIncomeStatement = {
      from, to, months, perMonth, total: totalData as IncomeStatement,
    }
    if (requestId !== statementSeq) return monthlyIncomeStatement.value
    monthlyIncomeStatement.value = statement
    return statement
  } catch (err) {
    handleError(err, 'Failed to compute the monthly income statement')
    if (requestId === statementSeq) monthlyIncomeStatement.value = null
    return null
  } finally {
    if (requestId === statementSeq) loading.value = false
  }
}

/**
 * By collections, one column per month. Each month and the whole-range total
 * are computed in one pass over the ledger; the total is its own figure, not
 * the sum of the columns, exactly as in the accrual monthly view.
 */
export async function fetchMonthlyCollectionIncomeStatement(from: string, to: string) {
  const requestId = ++statementSeq
  loading.value = true
  clearError()
  try {
    const months = monthsBetween(from, to)
    const periods = [...months.map((m) => monthBounds(m, from, to)), { start: from, end: to }]
    const statements = await computeCollectionStatements(from, to, periods)
    const total = statements[statements.length - 1]
    const statement: MonthlyCollectionIncomeStatement = { from, to, months, perMonth: statements.slice(0, -1), total }
    if (requestId !== statementSeq) return monthlyCollectionIncomeStatement.value
    monthlyCollectionIncomeStatement.value = statement
    // Keep the single-period ref on the full range, so switching back to
    // Period shows the period asked for rather than the last month computed.
    collectionIncomeStatement.value = total
    return statement
  } catch (err) {
    handleError(err, 'Failed to compute the monthly income statement by collections')
    if (requestId === statementSeq) monthlyCollectionIncomeStatement.value = null
    return null
  } finally {
    if (requestId === statementSeq) loading.value = false
  }
}

// The three statements are now single SECURITY DEFINER RPC calls (2026-07-07):
// each RPC runs gl_project_events internally then computes the statement in
// one round-trip, replacing ~30–50 client queries per page. The returned jsonb
// is shaped to match the view-model types, so no mapping is needed.
export async function fetchTrialBalance(asOf?: string) {
  loading.value = true
  clearError()
  try {
    const { data, error: e } = await supabase.rpc('gl_trial_balance', { p_as_of: asOf ?? undefined })
    if (e) throw e
    trialBalance.value = (data as TrialBalanceRow[]) ?? []
    return trialBalance.value
  } catch (err) {
    handleError(err, 'Failed to compute trial balance')
    return []
  } finally {
    loading.value = false
  }
}

export async function fetchIncomeStatement(from?: string, to?: string) {
  const requestId = ++statementSeq
  loading.value = true
  clearError()
  try {
    const { data, error: e } = await supabase.rpc('gl_income_statement', { p_from: from ?? undefined, p_to: to ?? undefined })
    if (e) throw e
    if (requestId !== statementSeq) return incomeStatement.value
    incomeStatement.value = (data as IncomeStatement) ?? null
    return incomeStatement.value
  } catch (err) {
    handleError(err, 'Failed to compute income statement')
    // Clear rather than leave the previous period published: the header is
    // built from the pickers, which already moved, so keeping the old figures
    // would put January's numbers under September's heading -- and the print
    // dialog would reproduce that onto a letterheaded PDF.
    if (requestId === statementSeq) incomeStatement.value = null
    return null
  } finally {
    // Only the newest request clears the spinner — a superseded one finishing
    // first would otherwise stop it while the current fetch is still running.
    if (requestId === statementSeq) loading.value = false
  }
}

export async function fetchBalanceSheet(asOf?: string) {
  loading.value = true
  clearError()
  try {
    const { data, error: e } = await supabase.rpc('gl_balance_sheet', { p_as_of: asOf ?? undefined })
    if (e) throw e
    balanceSheet.value = (data as BalanceSheet) ?? null
    return balanceSheet.value
  } catch (err) {
    handleError(err, 'Failed to compute balance sheet')
    return null
  } finally {
    loading.value = false
  }
}
