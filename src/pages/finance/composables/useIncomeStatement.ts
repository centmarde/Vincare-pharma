import { ref, computed } from 'vue'
import { useGLDataStore } from '@/stores/glData'

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`
}
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Which event recognises a peso.
 *
 * `accrual` is THE Income Statement — revenue when delivered, expense when
 * incurred. It is the statutory basis and the default.
 *
 * `cash` is a management view of the same ledger — revenue when collected,
 * expense when paid. Useful for "what did we actually take in", but it is NOT
 * a P&L and the page labels it as such rather than letting a printed copy pass
 * for one.
 */
export type StatementBasis = 'accrual' | 'cash'

/** One column for the whole period, or one column per month for comparison. */
export type StatementLayout = 'period' | 'monthly'

export const basisOptions: { value: StatementBasis; title: string }[] = [
  { value: 'accrual', title: 'By deliveries' },
  { value: 'cash', title: 'By collections' },
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
  /**
   * Suppress the section subtotal because the result line already IS it.
   * Net Sales is revenue less returns — i.e. the Revenue subtotal — so printing
   * "Total Revenue" and then "NET SALES" states the same figure twice, which is
   * the redundancy this restructure exists to remove. Cost of Sales is NOT such
   * a case: its subtotal is the deduction and Gross Profit is the result, two
   * different numbers that both belong.
   */
  subtotalIsResult?: boolean
}

export type SummaryKey =
  | 'netSales' | 'cogs' | 'grossProfit' | 'sellingExpenses' | 'adminExpenses'
  | 'operatingIncome' | 'otherIncome' | 'financeCosts' | 'netIncome'

const statementBlocks: StatementBlock[] = [
  { subsection: 'Revenue', subtotalIsResult: true, result: { key: 'netSales', label: 'NET SALES' } },
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
}

export function useIncomeStatement() {
  const gl = useGLDataStore()

  const dateFrom = ref(startOfYear())
  const dateTo = ref(today())
  const basis = ref<StatementBasis>('accrual')
  const layout = ref<StatementLayout>('period')

  const statement = computed(() => gl.incomeStatement)
  const cashStatement = computed(() => gl.cashBasisStatement)
  const monthly = computed(() => gl.monthlyIncomeStatement)
  const monthlyCash = computed(() => gl.monthlyCashBasisStatement)
  const loading = computed(() => gl.loading)
  /**
   * Surfaced so a failed fetch can say so. Without it the page falls through to
   * "nothing posted in this period", which asserts something false about the
   * business when the truth is that the request failed.
   */
  const error = computed(() => gl.error)

  const isCash = computed(() => basis.value === 'cash')
  const isMonthly = computed(() => layout.value === 'monthly')

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
    const rows: StatementRow[] = []
    for (const block of statementBlocks) {
      const section = block.subsection
        ? st.sections?.find((x) => x.subsection === block.subsection)
        : undefined
      if (section && section.accounts?.length) {
        rows.push({ kind: 'section', label: section.subsection, amounts: [], total: 0, negate: false })
        for (const a of section.accounts) {
          rows.push({ kind: 'account', label: a.name, amounts: [], total: a.amount, negate: !!block.negate })
        }
        if (!block.subtotalIsResult) {
          rows.push({ kind: 'subtotal', label: `Total ${section.subsection}`, amounts: [], total: section.subtotal, negate: !!block.negate })
        }
      }
      if (block.result) {
        rows.push({ kind: 'result', label: block.result.label, amounts: [], total: st[block.result.key] ?? 0, negate: false, final: block.final })
      }
    }
    return rows
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
    const rows: StatementRow[] = []

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

          if (!block.subtotalIsResult) {
            rows.push({
              kind: 'subtotal', label: `Total ${block.subsection}`,
              amounts: perMonthSections.map((x) => x?.subtotal ?? 0),
              total: totalSection?.subtotal ?? 0,
              negate: !!block.negate,
            })
          }
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
    return rows
  })

  async function load() {
    if (isMonthly.value) {
      if (isCash.value) await gl.fetchMonthlyCashBasisStatement(dateFrom.value, dateTo.value)
      else await gl.fetchMonthlyIncomeStatement(dateFrom.value, dateTo.value)
      return
    }
    if (isCash.value) await gl.fetchCashBasisStatement(dateFrom.value, dateTo.value)
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
    isCash, isMonthly, monthLabel,
    statement, cashStatement, monthly, monthlyCash, periodRows, monthlyRows,
    loading, error, load, setBasis, setLayout,
  }
}
