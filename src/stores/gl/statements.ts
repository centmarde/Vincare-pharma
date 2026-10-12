// Financial statements: Trial Balance, Income Statement (single period and
// month by month), Balance Sheet, and the cash-basis view classified from the
// same ledger.

import { supabase } from '@/lib/supabase'
import type {
  BalanceSheet,
  CashBasisStatement,
  IncomeStatement,
  MonthlyCashBasisStatement,
  MonthlyIncomeStatement,
  TrialBalanceRow,
} from './types'
import { monthsBetween, monthBounds } from './helpers'
import {
  accounts,
  trialBalance,
  incomeStatement,
  balanceSheet,
  cashBasisStatement,
  monthlyIncomeStatement,
  monthlyCashBasisStatement,
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

/**
 * The classification, without touching store state — so the monthly view can
 * run it per month without each call clobbering the single-period ref or
 * invalidating the outer request's ticket.
 *
 * THROWS on failure rather than returning null: a month that silently yields
 * nothing would shift every later column under the wrong heading.
 */
export async function computeCashBasis(from: string, to: string): Promise<CashBasisStatement> {
  const cashCodes = new Set(['1010', '1020', '1100'])
  const isExpenseCode = (c: string) => {
    const n = parseInt(c, 10)
    return !isNaN(n) && n >= 5000 && n <= 8999
  }

  // Paged: PostgREST caps a response at 1000 rows and truncates SILENTLY
  // (200, fewer rows), which on a financial statement would just quietly
  // understate every figure.
  const PAGE = 1000
  const rows: any[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error: e } = await supabase
      .from('journal_entry_lines')
      .select('journal_entry_id, account_code, debit, credit, entry:journal_entry_id(entry_date, status)')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (e) throw e
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  const byEntry = new Map<string, { code: string; debit: number; credit: number }[]>()
  for (const l of rows) {
    const entry = Array.isArray(l.entry) ? l.entry[0] : l.entry
    if (!entry) continue
    if (entry.status !== 'posted' && entry.status !== 'reversed') continue
    if (entry.entry_date < from || entry.entry_date > to) continue
    const key = String(l.journal_entry_id)
    const bucket = byEntry.get(key) ?? []
    bucket.push({ code: l.account_code, debit: Number(l.debit ?? 0), credit: Number(l.credit ?? 0) })
    byEntry.set(key, bucket)
  }

  let collected = 0
  let paidToSuppliers = 0
  const expenseTotals = new Map<string, number>()
  const excludedTotals = new Map<string, number>()

  for (const lines of byEntry.values()) {
    for (const line of lines) {
      if (!cashCodes.has(line.code)) continue
      // Only the OPPOSITE side counts. A compound entry bundles independent
      // balanced pairs — a POS sale is DR cash / CR revenue AND DR cogs / CR
      // inventory in one entry — so spreading the cash across every non-cash
      // line would hand a slice of it to the cogs/inventory pair, which the
      // cash never touched.
      const wantCredit = line.debit > 0
      const counterparts = lines.filter(
        (o) => !cashCodes.has(o.code) && (wantCredit ? o.credit > 0 : o.debit > 0),
      )
      const magnitude = (o: { debit: number; credit: number }) => o.debit + o.credit
      const cashMagnitude = line.debit + line.credit

      // Prefer an exact match. Double entry does not record WHICH credit pairs
      // with which debit, but a counterpart of the same amount is that pair in
      // every real case — and matching it beats apportioning, which would
      // spread the cash over unrelated lines that merely share the entry.
      const exact = counterparts.find((o) => Math.abs(magnitude(o) - cashMagnitude) < 0.005)
      const targets = exact ? [exact] : counterparts
      const counterpartTotal = targets.reduce((sum, o) => sum + magnitude(o), 0)
      if (counterpartTotal <= 0) continue

      // SIGNED, not branched on direction. A debit to cash is money in, a
      // credit is money out — and a reversal is simply the same counterpart
      // with the opposite sign, so it subtracts from whichever bucket the
      // original added to instead of landing in a different one. Branching on
      // debit-vs-credit put a reversed collection (DR 1030 / CR cash) into
      // "excluded" while the original stayed in "collected", overstating cash
      // by the full amount of every reversal.
      const signedCash = line.debit - line.credit

      // Apportioned across counterparts by their share of the entry, so a
      // compound entry splits instead of assigning the whole cash line to
      // whichever counterpart happened to match first.
      for (const o of targets) {
        const share = signedCash * (magnitude(o) / counterpartTotal)
        if (o.code === '1030' || o.code === '4010') {
          collected += share
        } else if (o.code === '2010') {
          // Money out is a negative share; paid-to-suppliers is stated positive.
          paidToSuppliers -= share
        } else if (isExpenseCode(o.code)) {
          expenseTotals.set(o.code, (expenseTotals.get(o.code) ?? 0) - share)
        } else {
          excludedTotals.set(o.code, (excludedTotals.get(o.code) ?? 0) + share)
        }
      }
    }
  }

  const nameFor = (code: string) => accounts.value.find((a) => a.code === code)?.name ?? code
  const paidExpenses = [...expenseTotals.entries()]
    .map(([code, amount]) => ({ code, name: nameFor(code), amount }))
    .filter((e) => Math.abs(e.amount) > 0.005)
    .sort((a, b) => a.code.localeCompare(b.code))
  const excluded = [...excludedTotals.entries()]
    .map(([code, amount]) => ({ code, name: nameFor(code), amount }))
    .filter((e) => Math.abs(e.amount) > 0.005)
    .sort((a, b) => a.code.localeCompare(b.code))

  const paidExpensesTotal = paidExpenses.reduce((sum, e) => sum + e.amount, 0)
  return {
    from, to,
    collected,
    paidToSuppliers,
    paidExpenses,
    paidExpensesTotal,
    netCash: collected - paidToSuppliers - paidExpensesTotal,
    excluded,
    excludedTotal: excluded.reduce((sum, e) => sum + e.amount, 0),
  }
}

/**
 * Cash-basis performance for a period, classified from the ledger itself.
 *
 * Walks every posted/reversed entry in the range and looks at what each cash
 * line sits opposite. Entries are read whole (all their lines) because the
 * classification is a property of the ENTRY, not of one line -- a cash debit
 * means nothing until you know what it was credited against.
 *
 * 'reversed' counts alongside 'posted' for the same reason every other balance
 * query here does: a reversal leaves the original in the ledger and posts an
 * offsetting entry, so the pair nets to zero only if both are counted.
 */
export async function fetchCashBasisStatement(from: string, to: string) {
  const requestId = ++statementSeq
  loading.value = true
  clearError()
  try {
    const statement = await computeCashBasis(from, to)
    // A slower earlier request must not publish over a newer one: the header
    // would name the period the user picked while the figures came from the
    // one before it.
    if (requestId !== statementSeq) return cashBasisStatement.value
    cashBasisStatement.value = statement
    return statement
  } catch (err) {
    handleError(err, 'Failed to compute the cash-basis statement')
    if (requestId === statementSeq) cashBasisStatement.value = null
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

/** The cash view by month. Cheap next to the accrual one — the classification
 *  already walks the ledger, so this just runs it per month. */
export async function fetchMonthlyCashBasisStatement(from: string, to: string) {
  const requestId = ++statementSeq
  loading.value = true
  clearError()
  try {
    const months = monthsBetween(from, to)
    const perMonth: CashBasisStatement[] = []
    for (const month of months) {
      const { start, end } = monthBounds(month, from, to)
      // computeCashBasis, not the public fetch: the public one claims its own
      // ticket (which would invalidate this outer request) and publishes to
      // the single-period ref. It also THROWS on failure, so a bad month can
      // never be skipped — perMonth is positional against `months`, and a
      // skipped entry would print September's cash under August's heading.
      perMonth.push(await computeCashBasis(start, end))
    }
    const total = await computeCashBasis(from, to)
    const statement: MonthlyCashBasisStatement = { from, to, months, perMonth, total }
    if (requestId !== statementSeq) return monthlyCashBasisStatement.value
    monthlyCashBasisStatement.value = statement
    // Keep the single-period ref on the full range, so switching back to
    // Period shows the period asked for rather than the last month computed.
    cashBasisStatement.value = total
    return statement
  } catch (err) {
    handleError(err, 'Failed to compute the monthly cash statement')
    if (requestId === statementSeq) monthlyCashBasisStatement.value = null
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
