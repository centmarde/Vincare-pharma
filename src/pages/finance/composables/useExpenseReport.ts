import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'
import type { ExpenseCategory, ExpenseType } from '@/stores/financeData'
import { useExpenseAccounts } from './useExpenseAccounts'

export function useExpenseReport() {
  const store = useFinanceDataStore()
  const { expenses, loading } = storeToRefs(store)
  // Was a second, local copy of categoryTitle over the hardcoded slug list —
  // it would have labelled every account-code category as a bare code. The
  // shared resolver reads the chart and keeps the legacy slug fallback.
  const {
    expenseAccountLabel: categoryTitle, ensureLoaded: ensureAccountsLoaded, allAccounts,
  } = useExpenseAccounts()

  const dateFrom = ref<string | null>(null)
  const dateTo = ref<string | null>(null)

  async function load() {
    await store.fetchExpenses({ dateFrom: dateFrom.value ?? undefined, dateTo: dateTo.value ?? undefined })
  }

  function applyFilter() { load() }
  function clearFilter() { dateFrom.value = null; dateTo.value = null; load() }

  /**
   * Whether a stored category belongs on an expense report at all.
   *
   * A voucher can now be charged to any non-revenue account, so an
   * `expense` transaction may legitimately be a CAPITAL purchase (1530 Office
   * Equipment), a liability settled (2010) or an owner's drawing (3040). Those
   * are balance-sheet moves and counting them here would overstate operating
   * spend — the Income Statement is unaffected either way, since it reads the
   * GL where a 1530 debit never reaches the P&L.
   *
   * Legacy slugs ('supplies', 'utilities', …) are NOT account codes and are
   * always real expenses, so they stay in.
   */
  function isOperatingSpend(category: string | null): boolean {
    if (!category) return true
    const account = allAccounts.value.find((a) => a.code === category)
    // Unknown code or a legacy slug: keep it. Dropping rows we cannot classify
    // would silently shrink the report, which is worse than including them.
    if (!account) return true
    return account.section === 'income_statement'
  }

  // The store's expenses list deliberately INCLUDES voided documents so they
  // stay visible in the Expenses table, flagged. This is a report of what was
  // actually spent, so it works off the un-voided subset only — and only the
  // rows that represent operating spend rather than balance-sheet movements.
  const liveExpenses = computed(() =>
    expenses.value.filter((e) => e.status !== 'voided' && isOperatingSpend(e.category)),
  )

  /** Excluded capital/balance-sheet rows, so the page can say so rather than
   *  appearing to lose money that was genuinely disbursed. */
  const capitalExcluded = computed(() => {
    const rows = expenses.value.filter((e) => e.status !== 'voided' && !isOperatingSpend(e.category))
    return { count: rows.length, total: rows.reduce((sum, e) => sum + (e.amount ?? 0), 0) }
  })

  const usedCategories = computed(() => {
    const set = new Set<ExpenseCategory>()
    for (const e of liveExpenses.value) if (e.category) set.add(e.category)
    return Array.from(set).sort((a, b) => categoryTitle(a).localeCompare(categoryTitle(b)))
  })

  type DepartmentGroup = {
    department: string
    rows: ExpenseType[]
    categoryTotals: Record<string, number>
    total: number
  }

  const departmentGroups = computed<DepartmentGroup[]>(() => {
    const groups = new Map<string, ExpenseType[]>()
    for (const e of liveExpenses.value) {
      const dept = e.department ?? 'Unassigned'
      if (!groups.has(dept)) groups.set(dept, [])
      groups.get(dept)!.push(e)
    }
    return Array.from(groups.entries()).map(([department, rows]) => {
      const categoryTotals: Record<string, number> = {}
      let total = 0
      for (const row of rows) {
        const amount = row.amount ?? 0
        if (row.category) categoryTotals[row.category] = (categoryTotals[row.category] ?? 0) + amount
        total += amount
      }
      return { department, rows, categoryTotals, total }
    }).sort((a, b) => a.department.localeCompare(b.department))
  })

  const grandTotals = computed(() => {
    const categoryTotals: Record<string, number> = {}
    let total = 0
    for (const group of departmentGroups.value) {
      for (const cat of usedCategories.value) {
        categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (group.categoryTotals[cat] ?? 0)
      }
      total += group.total
    }
    return { categoryTotals, total }
  })

  // The report labels categories from the chart, so load both.
  onMounted(() => { void ensureAccountsLoaded(); load() })

  return {
    loading, dateFrom, dateTo, applyFilter, clearFilter,
    usedCategories, departmentGroups, grandTotals, categoryTitle, capitalExcluded,
  }
}
