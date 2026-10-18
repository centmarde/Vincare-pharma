import { ref, computed } from 'vue'
import { useGLDataStore, type CollectionIncomeStatement, type IncomeStatement } from '@/stores/glData'
import { toLocalISODate } from '@/utils/helpers'

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`
}
// The local date, not toISOString's UTC one: before 8am in Manila that is
// still yesterday, and the statement would stop a day short.
function today(): string {
  return toLocalISODate(new Date())
}

/**
 * Which event recognises a sale.
 *
 * `accrual` is THE Income Statement — revenue when delivered, expense when
 * incurred. It is the statutory basis and the default.
 *
 * `collections` is the same statement with a credit sale (and its cost)
 * recognised as it is collected; every other line is as booked. A management
 * view — see CollectionIncomeStatement in stores/gl/types.
 */
export type StatementBasis = 'accrual' | 'collections'

/** One column for the whole period, or one column per month for comparison. */
export type StatementLayout = 'period' | 'monthly'

export const basisOptions: { value: StatementBasis; title: string }[] = [
  { value: 'accrual', title: 'By deliveries' },
  { value: 'collections', title: 'By collections' },
]

export const layoutOptions: { value: StatementLayout; title: string }[] = [
  { value: 'period', title: 'Period' },
  { value: 'monthly', title: 'Monthly' },
]

/** 'YYYY-MM' -> 'Jan 2026'. Built from the string, never parsed as a Date: an
 *  ISO date is read as UTC and rendered local, which in Asia/Manila can show
 *  the previous month. */
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function monthLabel(month: string): string {
  const m = Number(month.slice(5, 7))
  return `${monthNames[m - 1] ?? month} ${month.slice(0, 4)}`
}


/**
 * The statement as ONE flowing document, not a list of sections followed by a
 * summary that restates every one of them.
 *
 * The old layout printed each section's total ("Total Revenue") and then again
 * as a summary line ("Net Sales") — the same figure twice, which the accountant
 * flagged as redundant. A section subtotal IS the result line that closes it,
 * so the results sit inline where they are derived and nothing is stated twice.
 *
 * Order is fixed here rather than taken from the data: `gl_income_statement`
 * only returns sections that HAVE activity, so a month with no selling expenses
 * simply omits that section — but GROSS PROFIT and NET INCOME must still appear,
 * and always in the same place, or two periods would not be comparable.
 */
type StatementBlock = {
  /** Section to render above the result line, if the period has any. */
  subsection?: string
  /** Expenses and cost of sales are shown parenthesised. */
  negate?: boolean
  /** The running result this block closes, if any. */
  result?: { key: SummaryKey; label: string }
  /** Marks the block whose result closes the statement. */
  final?: boolean
}

export type SummaryKey =
  | 'netSales' | 'cogs' | 'grossProfit' | 'sellingExpenses' | 'adminExpenses'
  | 'operatingIncome' | 'otherIncome' | 'financeCosts' | 'netIncome'

// Revenue is not a block here: it is laid out as GROSS SALES / Less: … / NET
// SALES by revenueRows below, from the chart of accounts.
const statementBlocks: StatementBlock[] = [
  { subsection: 'Cost of Sales', negate: true, result: { key: 'grossProfit', label: 'GROSS PROFIT' } },
  { subsection: 'Selling Expenses', negate: true },
  { subsection: 'Administrative & Operating Expenses', negate: true, result: { key: 'operatingIncome', label: 'OPERATING INCOME' } },
  { subsection: 'Other Income' },
  { subsection: 'Finance Costs', negate: true, result: { key: 'netIncome', label: 'NET INCOME' }, final: true },
]

/** A rendered line. `amounts` carries one entry per month in the monthly view
 *  and is empty in the period view, which reads `total`. */
export type StatementRow = {
  kind: 'section' | 'account' | 'subtotal' | 'result'
  label: string
  amounts: number[]
  total: number
  negate: boolean
  /** The closing figure. Carries the double rule that says nothing follows. */
  final?: boolean
  /** Each amount as a % of that column's NET SALES; null where sales are nil. */
  ratios?: (number | null)[]
  totalRatio?: number | null
}

/**
 * A figure as a percentage of net sales — the common-size view the OM and the
 * accountant read the statement by: COGS 62%, expenses 21%, net income 9%.
 * Null when there are no sales to divide by, so the column shows a dash rather
 * than a meaningless or infinite figure.
 */
export function ratioOfSales(amount: number, netSales: number): number | null {
  if (!netSales || netSales <= 0) return null
  return (amount / netSales) * 100
}

/** Fills in each row's % of sales, one per column plus the total. Section headings carry none. */
function withRatios(rows: StatementRow[], salesPerColumn: number[], totalSales: number): StatementRow[] {
  return rows.map((row) => (row.kind === 'section'
    ? row
    : {
        ...row,
        ratios: row.amounts.map((amount, i) => ratioOfSales(amount, salesPerColumn[i] ?? 0)),
        totalRatio: ratioOfSales(row.total, totalSales),
      }))
}

export function useIncomeStatement() {
  const gl = useGLDataStore()

  const dateFrom = ref(startOfYear())
  const dateTo = ref(today())
  const basis = ref<StatementBasis>('accrual')
  const layout = ref<StatementLayout>('period')

  const isCollections = computed(() => basis.value === 'collections')
  // Both bases are the same statement, so the rows below are built the same
  // way from whichever one is showing.
  const statement = computed(() => (isCollections.value ? gl.collectionIncomeStatement : gl.incomeStatement))
  const monthly = computed(() => (isCollections.value ? gl.monthlyCollectionIncomeStatement : gl.monthlyIncomeStatement))
  const loading = computed(() => gl.loading)
  /**
   * Surfaced so a failed fetch can say so. Without it the page falls through to
   * "nothing posted in this period", which asserts something false about the
   * business when the truth is that the request failed.
   */
  const error = computed(() => gl.error)

  const isMonthly = computed(() => layout.value === 'monthly')

  /**
   * What the statement by collections could not apply collections to, shown
   * under it: sales entered by manual journal entry (kept as booked), and
   * money collected that is not revenue here — on pre-cutover (opening)
   * receivables, and on orders with no sale in the ledger to match. Null when
   * there is none.
   */
  const collectionNote = computed(() => {
    if (!isCollections.value) return null
    const st: CollectionIncomeStatement | null | undefined = isMonthly.value
      ? gl.monthlyCollectionIncomeStatement?.total
      : gl.collectionIncomeStatement
    if (!st) return null
    const manualSales = st.salesFromManualEntries ?? 0
    const opening = st.collectedOnOpeningReceivables ?? 0
    const unmatched = st.collectedUnmatched ?? 0
    return manualSales || opening || unmatched ? { manualSales, opening, unmatched } : null
  })

  /**
   * Revenue accounts from the chart, split the way the statement reads them:
   * the contra accounts (Sales Returns & Allowances, Sales Discounts) are the
   * deductions between GROSS SALES and NET SALES; the rest are gross sales.
   * Taken from the chart rather than a list here, so a deduction account added
   * in Chart of Accounts shows up without a code change.
   */
  const revenueAccounts = computed(() => {
    const revenue = gl.accounts
      .filter((a) => a.subsection === 'Revenue')
      .sort((a, b) => a.code.localeCompare(b.code))
    return {
      gross: revenue.filter((a) => !a.is_contra),
      deductions: revenue.filter((a) => a.is_contra),
    }
  })

  /** An account's signed amount in one statement's Revenue section (0 if no activity). */
  function revenueAmount(st: IncomeStatement | null | undefined, code: string): number {
    const section = st?.sections?.find((x) => x.subsection === 'Revenue')
    return section?.accounts?.find((a) => a.code === code)?.amount ?? 0
  }

  /**
   * GROSS SALES, each deduction as "Less: …", then NET SALES — one entry per
   * statement passed (one per month in the monthly view, the period alone
   * otherwise). Every line shows even at zero so the structure is always there.
   *
   * The GL returns contra accounts already flipped negative and nets them into
   * netSales, so a deduction is shown as its absolute value in parentheses and
   * GROSS SALES is derived as netSales + deductions: the three figures always
   * tie, whatever the gross accounts are.
   */
  function revenueRows(statements: (IncomeStatement | null | undefined)[], total: IncomeStatement | null | undefined): StatementRow[] {
    const { gross, deductions } = revenueAccounts.value
    // `0 - x`, not `-x`: negating a zero gives -0, which prints as "(-₱0.00)".
    const deductionOf = (st: IncomeStatement | null | undefined, code: string) => 0 - revenueAmount(st, code)
    const totalDeductions = (st: IncomeStatement | null | undefined) =>
      deductions.reduce((sum, a) => sum + deductionOf(st, a.code), 0)
    const grossOf = (st: IncomeStatement | null | undefined) => (st?.netSales ?? 0) + totalDeductions(st)

    const rows: StatementRow[] = [
      { kind: 'section', label: 'Revenue', amounts: statements.map(() => 0), total: 0, negate: false },
    ]
    // A single gross account IS the gross sales line; listing it as well would
    // state the same figure twice. Several are listed, then totalled.
    if (gross.length > 1) {
      for (const a of gross) {
        rows.push({
          kind: 'account', label: a.name, negate: false,
          amounts: statements.map((st) => revenueAmount(st, a.code)), total: revenueAmount(total, a.code),
        })
      }
    }
    rows.push({ kind: 'result', label: 'GROSS SALES', negate: false, amounts: statements.map(grossOf), total: grossOf(total) })
    for (const a of deductions) {
      rows.push({
        kind: 'account', label: `Less: ${a.name}`, negate: true,
        amounts: statements.map((st) => deductionOf(st, a.code)), total: deductionOf(total, a.code),
      })
    }
    rows.push({
      kind: 'result', label: 'NET SALES', negate: false,
      amounts: statements.map((st) => st?.netSales ?? 0), total: total?.netSales ?? 0,
    })
    return rows
  }

  /**
   * The period view as one flowing statement.
   *
   * Sections the period has no activity in are skipped, but their result lines
   * still render — a month with no selling expenses must still show OPERATING
   * INCOME in the same place, or two periods cannot be read side by side.
   */
  const periodRows = computed<StatementRow[]>(() => {
    const st = statement.value
    if (!st) return []
    const rows: StatementRow[] = revenueRows([], st)
    for (const block of statementBlocks) {
      const section = block.subsection
        ? st.sections?.find((x) => x.subsection === block.subsection)
        : undefined
      if (section && section.accounts?.length) {
        rows.push({ kind: 'section', label: section.subsection, amounts: [], total: 0, negate: false })
        for (const a of section.accounts) {
          rows.push({ kind: 'account', label: a.name, amounts: [], total: a.amount, negate: !!block.negate })
        }
        rows.push({ kind: 'subtotal', label: `Total ${section.subsection}`, amounts: [], total: section.subtotal, negate: !!block.negate })
      }
      if (block.result) {
        rows.push({ kind: 'result', label: block.result.label, amounts: [], total: st[block.result.key] ?? 0, negate: false, final: block.final })
      }
    }
    return withRatios(rows, [], st.netSales ?? 0)
  })

  /**
   * The same statement with one column per month. Built from the SAME block
   * order as the period view so the two cannot drift — that drift is exactly
   * what produced the duplicated totals the accountant flagged.
   *
   * An account is carried across every column even in months where it had no
   * activity, or the columns would each hold a different set of rows.
   */
  const monthlyRows = computed<StatementRow[]>(() => {
    const m = monthly.value
    if (!m) return []
    const n = m.months.length
    const rows: StatementRow[] = revenueRows(m.perMonth, m.total)

    for (const block of statementBlocks) {
      if (block.subsection) {
        const perMonthSections = m.perMonth.map((p) => p?.sections?.find((x) => x.subsection === block.subsection))
        const totalSection = m.total?.sections?.find((x) => x.subsection === block.subsection)
        const hasAny = perMonthSections.some((x) => x?.accounts?.length) || !!totalSection?.accounts?.length

        if (hasAny) {
          rows.push({ kind: 'section', label: block.subsection, amounts: new Array(n).fill(0), total: 0, negate: false })

          const byCode = new Map<string, StatementRow>()
          perMonthSections.forEach((section, i) => {
            for (const a of section?.accounts ?? []) {
              const row = byCode.get(a.code) ?? {
                kind: 'account' as const, label: a.name,
                amounts: new Array(n).fill(0), total: 0, negate: !!block.negate,
              }
              row.amounts[i] = a.amount
              byCode.set(a.code, row)
            }
          })
          for (const a of totalSection?.accounts ?? []) {
            const row = byCode.get(a.code)
            if (row) row.total = a.amount
            else byCode.set(a.code, {
              kind: 'account', label: a.name, amounts: new Array(n).fill(0), total: a.amount, negate: !!block.negate,
            })
          }
          rows.push(...[...byCode.values()])

          rows.push({
            kind: 'subtotal', label: `Total ${block.subsection}`,
            amounts: perMonthSections.map((x) => x?.subtotal ?? 0),
            total: totalSection?.subtotal ?? 0,
            negate: !!block.negate,
          })
        }
      }

      if (block.result) {
        rows.push({
          kind: 'result', label: block.result.label,
          amounts: m.perMonth.map((p) => p?.[block.result!.key] ?? 0),
          total: m.total?.[block.result!.key] ?? 0,
          negate: false,
          final: block.final,
        })
      }
    }
    return withRatios(rows, m.perMonth.map((p) => p?.netSales ?? 0), m.total?.netSales ?? 0)
  })

  async function load() {
    // The revenue block is laid out from the chart, so it needs the accounts.
    // Without them every sales deduction drops out and GROSS SALES prints the
    // net figure — so a chart that will not load stops the report instead
    // (fetchAccounts has already reported the error).
    if (!gl.accounts.length) await gl.fetchAccounts()
    if (!gl.accounts.length) return
    if (isMonthly.value) {
      if (isCollections.value) await gl.fetchMonthlyCollectionIncomeStatement(dateFrom.value, dateTo.value)
      else await gl.fetchMonthlyIncomeStatement(dateFrom.value, dateTo.value)
      return
    }
    if (isCollections.value) await gl.fetchCollectionIncomeStatement(dateFrom.value, dateTo.value)
    else await gl.fetchIncomeStatement(dateFrom.value, dateTo.value)
  }

  async function setBasis(next: StatementBasis) {
    if (basis.value === next) return
    basis.value = next
    await load()
  }

  async function setLayout(next: StatementLayout) {
    if (layout.value === next) return
    layout.value = next
    await load()
  }

  return {
    dateFrom, dateTo, basis, layout, basisOptions, layoutOptions,
    isCollections, isMonthly, monthLabel, collectionNote,
    statement, monthly, periodRows, monthlyRows,
    loading, error, load, setBasis, setLayout,
  }
}
