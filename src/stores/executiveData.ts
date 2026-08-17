import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useFinanceDataStore } from '@/stores/financeData'
import { useTransactionsDataStore } from '@/stores/transactionsData'
import { supabase } from '@/lib/supabase'

// One P&L snapshot — either "this period" or "the period before it"
export type PnLSnapshot = {
  revenue: number
  net: number
  cogs: number
  opex: number
}

// A single revenue-by-outlet row (e.g. "EXELMED: 120000")
export type OutletRevenue = {
  label: string
  value: number
  color: string
}

// One month of the Executive Dashboard's live P&L chart — accrual-basis from
// the General Ledger (revenue 4xxx, costs/expenses 5xxx–8xxx), matching the
// Income Statement and KPI cards.
export type MonthlyPnL = {
  month: string
  revenue: number
  expenses: number
  net: number
}

export const useExecutiveStore = defineStore('executive', () => {
  const financeStore = useFinanceDataStore()
  const transactionsStore = useTransactionsDataStore()

  // ── State ─────────────────────────────────────────────────────────────
  const loading = ref(true)
  const error = ref('')
  const pendingPrApprovalCount = ref(0)
  const currentPnL = ref<PnLSnapshot | null>(null)
  const prevPnL = ref<PnLSnapshot | null>(null)
  const overdueTotal = ref(0)
  const overdueByTerm = ref<Record<string, number>>({})
  const openPOs = ref(0)
  const revenueByOutlet = ref<OutletRevenue[]>([])
  const sparkline = ref<number[]>([])
  const monthlyPnL = ref<MonthlyPnL[]>([])
  const PAGE_SIZE = 1000 // for fetching all open POs in one go

  // ── Getters ───────────────────────────────────────────────────────────
  function getPreviousPeriod(dateFrom: string, dateTo: string) {
    const oneDayInMs = 86400000
    const currentPeriodLengthInDays =
      Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / oneDayInMs) + 1

    const previousTo = new Date(new Date(dateFrom).getTime() - oneDayInMs)
    const previousFrom = new Date(previousTo.getTime() - (currentPeriodLengthInDays - 1) * oneDayInMs)

    return {
      from: previousFrom.toISOString().slice(0, 10),
      to: previousTo.toISOString().slice(0, 10),
    }
  }

  async function fetchSparkline() {
    try {
      const year = new Date().getFullYear().toString()

      const buildQuery = () =>
        supabase
          .from('journal_entry_lines')
          .select('debit, credit, account_code, journal_entry:journal_entry_id!inner(entry_date, status), account:account_code!inner(normal_balance, is_contra)')
          .in('journal_entry.status', ['posted', 'reversed'])
          .gte('journal_entry.entry_date', `${year}-01-01`)
          .lte('journal_entry.entry_date', `${year}-12-31`)
          .gte('account_code', '4000')
          .lte('account_code', '4999')

      const data = await fetchAllRows<any>(buildQuery)

      if (!data.length) {
        sparkline.value = []
        return
      }

      const monthlyTotals = new Array(12).fill(0)
      for (const row of data) {
        const monthIndex = parseInt(row.journal_entry?.entry_date?.slice(5, 7), 10) - 1
        if (monthIndex < 0 || monthIndex > 11) continue

        const debit = Number(row.debit ?? 0)
        const credit = Number(row.credit ?? 0)
        const isContra = !!row.account?.is_contra
        const normalBalance = row.account?.normal_balance

        const positiveDirection = normalBalance === 'credit' ? credit - debit : debit - credit
        const effective = isContra ? -positiveDirection : positiveDirection

        monthlyTotals[monthIndex] += effective
      }

      const highestMonth = Math.max(...monthlyTotals, 1)
      sparkline.value = monthlyTotals.map(total => total / highestMonth)
    } catch (err) {
      console.warn('fetchSparkline failed:', err)
      sparkline.value = []
      error.value = error.value
        ? `${error.value}; Failed to load sparkline`
        : 'Failed to load sparkline'
    }
  }

  async function fetchMonthlyPnL() {
    try {
      const year = new Date().getFullYear().toString()

      const buildQuery = () =>
        supabase
          .from('journal_entry_lines')
          .select('debit, credit, account_code, journal_entry:journal_entry_id!inner(entry_date, status), account:account_code!inner(normal_balance, is_contra)')
          .in('journal_entry.status', ['posted', 'reversed'])
          .gte('journal_entry.entry_date', `${year}-01-01`)
          .lte('journal_entry.entry_date', `${year}-12-31`)
          .gte('account_code', '4000')
          .lte('account_code', '8999')

      const data = await fetchAllRows<any>(buildQuery)

      const revenueByMonth = new Array(12).fill(0)
      const expensesByMonth = new Array(12).fill(0)

      for (const row of data) {
        const monthIndex = parseInt(row.journal_entry?.entry_date?.slice(5, 7), 10) - 1
        if (monthIndex < 0 || monthIndex > 11) continue

        const debit = Number(row.debit ?? 0)
        const credit = Number(row.credit ?? 0)
        const isContra = !!row.account?.is_contra
        const normalBalance = row.account?.normal_balance

        const positiveDirection = normalBalance === 'credit' ? credit - debit : debit - credit
        const effective = isContra ? -positiveDirection : positiveDirection

        if (row.account_code?.startsWith('4')) {
          revenueByMonth[monthIndex] += effective
        } else if (
          row.account_code?.startsWith('5') ||
          row.account_code?.startsWith('6') ||
          row.account_code?.startsWith('7') ||
          row.account_code?.startsWith('8')
        ) {
          expensesByMonth[monthIndex] += effective
        }
      }

      const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      monthlyPnL.value = monthLabels.map((month, i) => ({
        month,
        revenue: revenueByMonth[i],
        expenses: expensesByMonth[i],
        net: revenueByMonth[i] - expensesByMonth[i],
      }))
    } catch (err) {
      console.warn('fetchMonthlyPnL failed:', err)
      monthlyPnL.value = []
      error.value = error.value
        ? `${error.value}; Failed to load monthly P&L`
        : 'Failed to load monthly P&L'
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────

  function setPendingPrApprovalCount(count: number) {
    pendingPrApprovalCount.value = count
  }

  // Main entry point — loads everything the Executive Dashboard needs.
  async function fetchDashboardData(dateFrom: string, dateTo: string) {
    loading.value = true
    error.value = ''

    try {
      const previousPeriod = getPreviousPeriod(dateFrom, dateTo)

      const [currentResult, previousResult, overdueRows] = await Promise.all([
        financeStore.fetchPnL({ dateFrom, dateTo }),
        financeStore.fetchPnL({ dateFrom: previousPeriod.from, dateTo: previousPeriod.to }),
        financeStore.fetchARAging(),
        fetchMonthlyPnL(),
      ])

      // Current period P&L + revenue split by outlet
      if (currentResult) {
        currentPnL.value = {
          revenue: currentResult.revenueTotal,
          net: currentResult.net,
          cogs: currentResult.cogs,
          opex: currentResult.opex,
        }

        const outletColors: Record<string, string> = {
          EXELMED: 'primary',
          ETHICAL: 'success',
          INHOUSE: 'info',
        }

        revenueByOutlet.value = currentResult.byOutlet
          .filter(outlet => outlet.revenue > 0)
          .map(outlet => ({
            label: outlet.outlet,
            value: outlet.revenue,
            color: outletColors[outlet.outlet] ?? 'grey',
          }))
      } else {
        currentPnL.value = null
        revenueByOutlet.value = []
      }

      // Previous period P&L (used to calculate trend %)
      prevPnL.value = previousResult
        ? {
            revenue: previousResult.revenueTotal,
            net: previousResult.net,
            cogs: previousResult.cogs,
            opex: previousResult.opex,
          }
        : null

      // Overdue receivables, grouped by aging bucket (1-30, 31-60, etc.)
      let total = 0
      const byTerm: Record<string, number> = {}
      for (const row of overdueRows) {
        if (row.term === 'no-term') continue
        byTerm[row.term] = (byTerm[row.term] ?? 0) + row.balance
        if (row.days_overdue != null && row.days_overdue > 0) {
          total += row.balance
        }
      }
      overdueTotal.value = total
      overdueByTerm.value = byTerm

      // Open purchase orders
      const openPurchaseOrders = await transactionsStore.fetchTransactions({
        transaction_type: 'purchase_order',
        status: ['pending', 'approved', 'issued', 'partial'],
      })
      openPOs.value = openPurchaseOrders.length

      // Yearly sparkline for the revenue card
      await fetchSparkline()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load dashboard data'
    } finally {
      loading.value = false
    }
  }

  async function fetchAllRows<T>(buildQuery: () => any): Promise<T[]> {
    const allRows: T[] = []
    let from = 0

    while (true) {
      const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
      if (error) throw error

      const rows = (data ?? []) as T[]
      allRows.push(...rows)

      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    return allRows
  }

  return {
    loading, error,
    pendingPrApprovalCount,
    currentPnL, prevPnL,
    overdueTotal, overdueByTerm,
    openPOs,
    revenueByOutlet,
    sparkline,
    monthlyPnL,
    setPendingPrApprovalCount,
    fetchDashboardData,
  }
})