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

  // ── Private helpers (only used inside this store) ──────────────────────

  // Given the current period's dates, work out the same-length period
  // right before it. Example: a 10-day current period returns the 10 days
  // immediately before it.
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

  // Builds a 12-value array (one per month, scaled 0–1) for the current
  // year's revenue, used to draw the small sparkline chart on KPI cards.
  async function fetchSparkline() {
    try {
      const year = new Date().getFullYear().toString()

      const { data } = await supabase
        .from('finance_daily_summary')
        .select('summary_date, revenue_pos, revenue_ethical, revenue_inhouse')
        .gte('summary_date', `${year}-01-01`)
        .lte('summary_date', `${year}-12-31`)
        .order('summary_date', { ascending: true })

      if (!data?.length) {
        sparkline.value = []
        return
      }

      // Add up revenue for each month (0 = January, 11 = December)
      const monthlyTotals = new Array(12).fill(0)
      for (const row of data as any[]) {
        const monthIndex = parseInt(row.summary_date.slice(5, 7), 10) - 1
        monthlyTotals[monthIndex] += (row.revenue_pos ?? 0) + (row.revenue_ethical ?? 0) + (row.revenue_inhouse ?? 0)
      }

      // Scale everything down to a 0–1 range so it's easy to draw as a chart
      const highestMonth = Math.max(...monthlyTotals, 1)
      sparkline.value = monthlyTotals.map(total => total / highestMonth)
    } catch {
      sparkline.value = []
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

  return {
    loading, error,
    pendingPrApprovalCount,
    currentPnL, prevPnL,
    overdueTotal, overdueByTerm,
    openPOs,
    revenueByOutlet,
    sparkline,
    setPendingPrApprovalCount,
    fetchDashboardData,
  }
})