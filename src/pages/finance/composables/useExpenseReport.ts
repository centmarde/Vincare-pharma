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
  const { expenseAccountLabel: categoryTitle, ensureLoaded: ensureAccountsLoaded } = useExpenseAccounts()

  const dateFrom = ref<string | null>(null)
  const dateTo = ref<string | null>(null)

  async function load() {
    await store.fetchExpenses({ dateFrom: dateFrom.value ?? undefined, dateTo: dateTo.value ?? undefined })
  }

  function applyFilter() { load() }
  function clearFilter() { dateFrom.value = null; dateTo.value = null; load() }

  // The store's expenses list deliberately INCLUDES voided documents so they
  // stay visible in the Expenses table, flagged. This is a report of what was
  // actually spent, so it works off the un-voided subset only.
  const liveExpenses = computed(() => expenses.value.filter((e) => e.status !== 'voided'))

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
    usedCategories, departmentGroups, grandTotals, categoryTitle,
  }
}
