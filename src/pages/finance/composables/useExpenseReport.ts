import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore, expenseCategories } from '@/stores/financeData'
import type { ExpenseCategory, ExpenseType } from '@/stores/financeData'

const categoryTitle = (value: ExpenseCategory) =>
  expenseCategories.find((c) => c.value === value)?.title ?? value

export function useExpenseReport() {
  const store = useFinanceDataStore()
  const { expenses, loading } = storeToRefs(store)

  const dateFrom = ref<string | null>(null)
  const dateTo = ref<string | null>(null)

  async function load() {
    await store.fetchExpenses({ dateFrom: dateFrom.value ?? undefined, dateTo: dateTo.value ?? undefined })
  }

  function applyFilter() { load() }
  function clearFilter() { dateFrom.value = null; dateTo.value = null; load() }

  const usedCategories = computed(() => {
    const set = new Set<ExpenseCategory>()
    for (const e of expenses.value) if (e.category) set.add(e.category)
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
    for (const e of expenses.value) {
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

  onMounted(load)

  return {
    loading, dateFrom, dateTo, applyFilter, clearFilter,
    usedCategories, departmentGroups, grandTotals, categoryTitle,
  }
}
