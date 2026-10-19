// The Income Statement BY COLLECTIONS (see CollectionIncomeStatement in
// ./types for what it recognises and why).
//
// It is the accrual statement with one thing moved: the credit sales. Each
// period's accrual figures come from gl_income_statement, the same RPC the
// "By deliveries" view uses; then the sales booked to AR in the period are
// taken back out and replaced by the share of each order collected in it.
// Everything else is untouched, so the two statements differ ONLY by the
// timing of credit sales, and agree once every order is fully collected.

import { supabase } from '@/lib/supabase'
import { fetchAllRows, fetchAllRowsForIds } from '@/stores/shared/paging'
import type { CollectionIncomeStatement, GLAccount, IncomeStatement } from './types'
import { openingBalanceEquityCode } from './types'
import { accounts } from './state'
import { projectEvents } from './journal'

const arCode = '1030'
const saleReferenceTypes = ['sales_invoice', 'sales_return']

type EntryLine = { account_code: string; debit: number | null; credit: number | null }
type LedgerEntry = {
  id: number
  entry_date: string
  reference_type: string
  reference_id: number
  lines: EntryLine[]
}

const entrySelect = 'id, entry_date, reference_type, reference_id, lines:journal_entry_lines(account_code, debit, credit)'

/** Same order gl_income_statement returns its sections in. */
const subsectionOrder = [
  'Revenue', 'Cost of Sales', 'Selling Expenses',
  'Administrative & Operating Expenses', 'Other Income', 'Finance Costs',
]

const round2 = (n: number) => Math.round(n * 100) / 100
const sumOf = (lines: EntryLine[], code: string, side: 'debit' | 'credit') =>
  lines.filter((l) => l.account_code === code).reduce((s, l) => s + Number(l[side] ?? 0), 0)

/**
 * A line as the statement states it — gl_statement_amounts' rule: signed by
 * the account's normal balance, then flipped for a contra account (so Sales
 * Discounts reads negative and nets into NET SALES).
 */
function statementAmount(account: GLAccount, line: EntryLine): number {
  const debit = Number(line.debit ?? 0)
  const credit = Number(line.credit ?? 0)
  const signed = account.normal_balance === 'credit' ? credit - debit : debit - credit
  return account.is_contra ? -signed : signed
}

/** Income-statement amounts on a set of entries, by account. Inactive accounts
 *  are skipped, as gl_income_statement skips them. */
function incomeLines(entries: LedgerEntry[], chart: Map<string, GLAccount>): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of entries) {
    for (const line of e.lines ?? []) {
      const account = chart.get(line.account_code)
      if (!account || account.section !== 'income_statement') continue
      out.set(line.account_code, (out.get(line.account_code) ?? 0) + statementAmount(account, line))
    }
  }
  return out
}

/** Rebuilds the statement from per-account amounts, the way gl_income_statement does. */
function shapeStatement(from: string, to: string, amounts: Map<string, number>, chart: Map<string, GLAccount>): IncomeStatement {
  const bySubsection = new Map<string, { code: string; name: string; amount: number }[]>()
  for (const [code, raw] of amounts) {
    const account = chart.get(code)
    const amount = round2(raw)
    if (!account || amount === 0) continue
    const list = bySubsection.get(account.subsection) ?? []
    list.push({ code, name: account.name, amount })
    bySubsection.set(account.subsection, list)
  }
  const rank = (s: string) => (subsectionOrder.includes(s) ? subsectionOrder.indexOf(s) : subsectionOrder.length)
  const sections = [...bySubsection.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([subsection, list]) => {
      list.sort((a, b) => a.code.localeCompare(b.code))
      return { subsection, accounts: list, subtotal: round2(list.reduce((s, a) => s + a.amount, 0)) }
    })
  const subtotal = (name: string) => sections.find((s) => s.subsection === name)?.subtotal ?? 0
  const netSales = subtotal('Revenue')
  const cogs = subtotal('Cost of Sales')
  const sellingExpenses = subtotal('Selling Expenses')
  const adminExpenses = subtotal('Administrative & Operating Expenses')
  const otherIncome = subtotal('Other Income')
  const financeCosts = subtotal('Finance Costs')
  const grossProfit = round2(netSales - cogs)
  const operatingIncome = round2(grossProfit - sellingExpenses - adminExpenses)
  return {
    from, to, sections, netSales, cogs, grossProfit, sellingExpenses, adminExpenses,
    operatingIncome, otherIncome, financeCosts, netIncome: round2(operatingIncome + otherIncome - financeCosts),
  }
}

/**
 * The statement by collections for each period asked for — one per month plus
 * the whole range in the monthly view, just the range otherwise. The ledger is
 * read ONCE for the full span and split per period.
 *
 * THROWS on failure, like the other statement maths: a period that silently
 * came back empty would read as a month with no sales.
 */
export async function computeCollectionStatements(
  from: string,
  to: string,
  periods: { start: string; end: string }[],
): Promise<CollectionIncomeStatement[]> {
  const chart = new Map(accounts.value.map((a) => [a.code, a]))
  if (!chart.size) throw new Error('The chart of accounts is not loaded.')

  // Book everything up to the period's end first. A collection this month is
  // often on a sale delivered months ago, and the accrual statement only
  // books the events inside its own dates, so the sale might not be in the
  // ledger yet. Same reach as the Balance Sheet's projection.
  await projectEvents({ to })

  // Sales and collections dated in the span. 'reversed' counts with 'posted',
  // as in every balance here: a reversal leaves the original in the ledger.
  const inSpan = await fetchAllRows<LedgerEntry>(() => supabase
    .from('journal_entries')
    .select(entrySelect)
    .in('reference_type', [...saleReferenceTypes, 'collection'])
    .in('status', ['posted', 'reversed'])
    .gte('entry_date', from)
    .lte('entry_date', to)
    .order('id', { ascending: true }))
  const touchesAR = (e: LedgerEntry) => (e.lines ?? []).some((l) => l.account_code === arCode)
  // POS sales never touch AR (paid on the spot), so they stay exactly as booked.
  const creditSales = inSpan.filter((e) => saleReferenceTypes.includes(e.reference_type) && touchesAR(e))
  const collectionEntries = inSpan.filter((e) => e.reference_type === 'collection')

  // Sales booked by manual journal entry stay as booked (no collection data
  // to apply); read only to say how much of the statement that is.
  const manualEntries = await fetchAllRows<LedgerEntry>(() => supabase
    .from('journal_entries')
    .select(entrySelect)
    .eq('reference_type', 'manual')
    .in('status', ['posted', 'reversed'])
    .gte('entry_date', from)
    .lte('entry_date', to)
    .order('id', { ascending: true }))
  const netSalesOf = (lines: Map<string, number>) =>
    [...lines].reduce((sum, [code, amount]) => sum + (chart.get(code)?.subsection === 'Revenue' ? amount : 0), 0)

  // Which order each collection paid. A collection entry's reference is the
  // collections row; the row names the order.
  const collectionIds = [...new Set(collectionEntries.map((e) => Number(e.reference_id)))]
  const collectionRows = await fetchAllRowsForIds<{ id: number; transaction_id: number }>(collectionIds, (batch) =>
    supabase.from('collections').select('id, transaction_id').in('id', batch).order('id', { ascending: true }))
  const orderOfCollection = new Map(collectionRows.map((c) => [Number(c.id), Number(c.transaction_id)]))

  // Every sale entry of those orders, whenever it was booked (to the span's
  // end): the order's total on AR and what that total is made of.
  const orderIds = [...new Set(collectionRows.map((c) => Number(c.transaction_id)))]
  const orderEntries = await fetchAllRowsForIds<LedgerEntry>(orderIds, (batch) => supabase
    .from('journal_entries')
    .select(entrySelect)
    .in('reference_type', saleReferenceTypes)
    .in('reference_id', batch)
    .in('status', ['posted', 'reversed'])
    .lte('entry_date', to)
    .order('id', { ascending: true }))
  const entriesByOrder = new Map<number, LedgerEntry[]>()
  for (const e of orderEntries) {
    const list = entriesByOrder.get(Number(e.reference_id)) ?? []
    list.push(e)
    entriesByOrder.set(Number(e.reference_id), list)
  }
  const orderFacts = new Map<number, { ar: number; opening: boolean; lines: Map<string, number> }>()
  for (const [orderId, entries] of entriesByOrder) {
    const allLines = entries.flatMap((e) => e.lines ?? [])
    orderFacts.set(orderId, {
      ar: sumOf(allLines, arCode, 'debit') - sumOf(allLines, arCode, 'credit'),
      // An opening receivable is AR against Opening Balance Equity: no sale here.
      opening: allLines.some((l) => l.account_code === openingBalanceEquityCode),
      lines: incomeLines(entries, chart),
    })
  }

  const results: CollectionIncomeStatement[] = []
  for (const { start, end } of periods) {
    // The accrual figures for the period, already booked above.
    const { data, error } = await supabase.rpc('gl_income_statement', { p_from: start, p_to: end, p_project: false })
    if (error) throw error
    const accrual = data as IncomeStatement
    const amounts = new Map<string, number>()
    for (const section of accrual.sections ?? []) {
      for (const a of section.accounts ?? []) amounts.set(a.code, Number(a.amount))
    }
    const add = (code: string, amount: number) => amounts.set(code, (amounts.get(code) ?? 0) + amount)
    const inPeriod = (e: LedgerEntry) => e.entry_date >= start && e.entry_date <= end

    // Out: the credit sales the accrual statement booked in this period.
    for (const [code, amount] of incomeLines(creditSales.filter(inPeriod), chart)) add(code, -amount)

    // In: the part of each order collected in this period.
    let collectedOnOpeningReceivables = 0
    let collectedUnmatched = 0
    for (const entry of collectionEntries.filter(inPeriod)) {
      const lines = entry.lines ?? []
      // Net of AR: a collection credits it, the reversal of a voided one debits it back.
      const collected = sumOf(lines, arCode, 'credit') - sumOf(lines, arCode, 'debit')
      const orderId = orderOfCollection.get(Number(entry.reference_id))
      const facts = orderId == null ? undefined : orderFacts.get(orderId)
      if (facts?.opening) { collectedOnOpeningReceivables += collected; continue }
      if (!facts || facts.ar <= 0.005) { collectedUnmatched += collected; continue }
      const share = collected / facts.ar
      for (const [code, amount] of facts.lines) add(code, amount * share)
    }

    results.push({
      ...shapeStatement(start, end, amounts, chart),
      collectedOnOpeningReceivables: round2(collectedOnOpeningReceivables),
      collectedUnmatched: round2(collectedUnmatched),
      salesFromManualEntries: round2(netSalesOf(incomeLines(manualEntries.filter(inPeriod), chart))),
    })
  }
  return results
}
