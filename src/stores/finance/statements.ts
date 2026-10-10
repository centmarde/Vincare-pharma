// P&L and the financial statements, all derived from the General Ledger. The
// statement RPCs belong to glData; this file only shapes their results for the
// Finance and Executive dashboards.

import { supabase } from '@/lib/supabase'
import { useGLDataStore } from '@/stores/glData'
import type {
  DateRange, GLBalanceSheet, GLIncomeStatement, PnLByOutletRow, PnLSummary, TrialBalanceLine,
} from './types'
import { pnl, incomeStatement, balanceSheet, trialBalance, loading, handleError, clearError } from './state'

let glStore: ReturnType<typeof useGLDataStore> | null = null
const getGLStore = () => (glStore ??= useGLDataStore())

// ─── P&L, derived from the General Ledger ───────────────────────────────
// The finance_daily_summary cache and its backfill/day-slice machinery were
// removed with this: they existed only to make an operational-table P&L
// cheap, and nothing reads that cache any more. The table itself is left in
// place (dropping it is a schema change) but is no longer written to.

// Revenue split by channel, derived from the GL so it ties to the same
// netSales the Income Statement reports. The projector books every revenue
// channel (POS sale, ethical order, in-house order) identically — account
// 4010, reference_type 'sales_invoice', reference_id = the source
// transactions.id — so the channel is recovered by looking the source
// document back up rather than by re-reading operational tables.
//
// Gross of sales returns: 4020 is a separate contra account netted at
// statement level, not attributable to a channel here.
export async function fetchRevenueByChannel(from?: string, to?: string): Promise<PnLByOutletRow[]> {
  let linesQ = supabase.from('journal_entry_lines')
    .select('credit, journal_entry:journal_entry_id!inner(reference_id, reference_type, entry_date, status)')
    .eq('account_code', '4010')
    .eq('journal_entry.reference_type', 'sales_invoice')
    // Both statuses count: a reversal leaves the original in the ledger as
    // 'reversed' AND posts an offsetting entry, so the pair nets to zero.
    .in('journal_entry.status', ['posted', 'reversed'])
  if (from) linesQ = linesQ.gte('journal_entry.entry_date', from)
  if (to) linesQ = linesQ.lte('journal_entry.entry_date', to)

  const { data: lines, error: linesErr } = await linesQ
  if (linesErr) throw linesErr

  const rows = (lines ?? []) as any[]
  const sourceIds = [...new Set(rows.map(r => r.journal_entry?.reference_id).filter(Boolean))]
  if (!sourceIds.length) return []

  const { data: sources, error: srcErr } = await supabase
    .from('transactions').select('id, transaction_type').in('id', sourceIds)
  if (srcErr) throw srcErr

  const typeById = new Map(((sources ?? []) as any[]).map(t => [t.id, t.transaction_type]))
  const channelOf: Record<string, PnLByOutletRow['outlet']> = {
    sale: 'EXELMED', ethical_order: 'ETHICAL', inhouse_order: 'INHOUSE',
  }

  const totals = new Map<PnLByOutletRow['outlet'], number>()
  for (const line of rows) {
    const channel = channelOf[typeById.get(line.journal_entry?.reference_id) ?? ''] ?? 'OTHER'
    totals.set(channel, (totals.get(channel) ?? 0) + Number(line.credit ?? 0))
  }
  return [...totals.entries()]
    .map(([outlet, revenue]) => ({ outlet, revenue }))
    .filter(r => r.revenue !== 0)
}

// P&L for the dashboards, derived from the GENERAL LEDGER — the same source
// as the Income Statement page, so the two can never disagree.
//
// This replaces an operational-table computation that broke the module's
// governing rule ("reports tie to the GL, never to operational tables") in
// two ways: it summed `stock_in.total_amount` as "cogs" when that is
// PURCHASES (receiving stock is DR 1040 Inventory / CR 2010 AP, a
// balance-sheet move, not a P&L hit), and it counted Ethical/In-House
// revenue from `collections` (cash basis) while the GL books at
// invoice/delivery (accrual). A ₱1,000,000 PO receipt was showing as a
// ₱1,000,000 loss on a period with no sales.
//
// Caveat inherited from the Income Statement, and the reason both now agree:
// the GL only reflects events that have been PROJECTED, which is a manual
// step ("Resync Ledger" on General Journal). Unprojected activity is absent
// from this and the Income Statement alike, rather than only from one.
export async function fetchPnL(range: DateRange = {}) {
  loading.value = true
  clearError()
  try {
    const [statement, byOutlet] = await Promise.all([
      getGLStore().fetchIncomeStatement(range.dateFrom, range.dateTo),
      fetchRevenueByChannel(range.dateFrom, range.dateTo),
    ])
    if (!statement) {
      pnl.value = null
      return null
    }

    const revenueFor = (outlet: string) =>
      byOutlet.find(r => r.outlet === outlet)?.revenue ?? 0

    const summary: PnLSummary = {
      revenuePos: revenueFor('EXELMED'),
      revenueEthical: revenueFor('ETHICAL'),
      revenueInhouse: revenueFor('INHOUSE'),
      revenueTotal: statement.netSales,
      cogs: statement.cogs,
      opex: statement.sellingExpenses + statement.adminExpenses + statement.financeCosts,
      // Taken from the GL rather than recomputed: netIncome already accounts
      // for other income, which sits below operating income and so isn't
      // part of revenueTotal.
      net: statement.netIncome,
      byOutlet,
    }
    pnl.value = summary
    return summary
  } catch (err) {
    handleError(err, 'Failed to compute P&L')
    return null
  } finally {
    loading.value = false
  }
}

// ─── GL: authoritative financial statements ──────────────────────────────
// Delegates entirely to glData.ts (the store that owns GL logic) — this
// store never calls Supabase for GL statements itself, matching the layer
// rule that only one store owns each Supabase call. glStore's fetch*
// actions already run the ledger projection before computing, so there's
// no separate runGLProjection step here anymore.

export async function fetchIncomeStatement(range: DateRange = {}) {
  loading.value = true
  clearError()
  try {
    incomeStatement.value = (await getGLStore().fetchIncomeStatement(range.dateFrom, range.dateTo)) as GLIncomeStatement | null
    return incomeStatement.value
  } catch (err) {
    handleError(err, 'Failed to fetch income statement')
    return null
  } finally {
    loading.value = false
  }
}

export async function fetchBalanceSheet(asOf?: string) {
  loading.value = true
  clearError()
  try {
    balanceSheet.value = (await getGLStore().fetchBalanceSheet(asOf)) as GLBalanceSheet | null
    return balanceSheet.value
  } catch (err) {
    handleError(err, 'Failed to fetch balance sheet')
    return null
  } finally {
    loading.value = false
  }
}

export async function fetchTrialBalance(asOf?: string) {
  loading.value = true
  clearError()
  try {
    trialBalance.value = (await getGLStore().fetchTrialBalance(asOf)) as TrialBalanceLine[]
    return trialBalance.value
  } catch (err) {
    handleError(err, 'Failed to fetch trial balance')
    return []
  } finally {
    loading.value = false
  }
}
