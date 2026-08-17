import { computed, onMounted, ref, watch } from 'vue'
import { useExecutiveStore } from '@/stores/executiveData'

// ── Date helpers ──────────────────────────────────────────────────────────
function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Trend helper ─────────────────────────────────────────────────────────
// Compares "current" vs "previous" and returns a trend direction + label.
// This isn't currency, just a percentage, so it's fine to compute here.

function pctChange(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return { trend: 'neutral' as const, label: 'No change' }
    return { trend: 'up' as const, label: 'New this period' }
  }
  const pct = ((current - previous) / previous) * 100
  const trend = pct > 0.01 ? 'up' as const : pct < -0.01 ? 'down' as const : 'neutral' as const
  const sign = pct > 0 ? '+' : ''
  return { trend, label: `${sign}${Math.abs(pct).toFixed(1)}% vs last month` }
}

// ── KpiCard shape ────────────────────────────────────────────────────────
// `value` and badge `value`s are always raw numbers or plain strings.
// `isCurrency: true` tells KpiCards.vue to run formatCurrency on it.

export interface KpiBadge {
  label: string
  value: number | string
  isCurrency?: boolean
  color?: string
}

export interface KpiCard {
  title: string
  value: number | string
  isCurrency?: boolean
  subtitle: string
  icon: string
  color: string
  trend: 'up' | 'down' | 'neutral'
  trendLabel: string
  sparkline?: number[]
  badges?: KpiBadge[]
  route?: string
}

// ── Composable ───────────────────────────────────────────────────────────

export function useExecutiveDashboard() {
  const store = useExecutiveStore()

  const dateFrom = ref(firstOfMonth())
  const dateTo = ref(todayStr())

  function refresh() {
    return store.fetchDashboardData(dateFrom.value, dateTo.value)
  }

  // Called when the user clicks "Apply" — commits the chosen dates, then fetches
  function applyDateRange(newDateFrom: string, newDateTo: string) {
    dateFrom.value = newDateFrom
    dateTo.value = newDateTo
    return refresh()
  }

  // Called when the user clicks "Refresh" — resets back to "this month so far"
  function resetToCurrentMonth() {
    dateFrom.value = firstOfMonth()
    dateTo.value = todayStr()
    return refresh()
  }

  const monthlyPnL = computed(() => store.monthlyPnL)

  const kpiCards = computed<KpiCard[]>(() => {
    const cur = store.currentPnL
    const prev = store.prevPnL

    const rev = cur?.revenue ?? 0
    const net = cur?.net ?? 0
    const revChg = pctChange(rev, prev?.revenue ?? 0)
    const netChg = pctChange(net, prev?.net ?? 0)

    const grossMargin = rev > 0 ? (((rev - (cur?.cogs ?? 0)) / rev) * 100).toFixed(1) : '0.0'
    const netMargin = rev > 0 ? ((net / rev) * 100).toFixed(1) : '0.0'

    // Turn the overdue-by-term map into badges
    const termColors: Record<string, string> = { '1-30': 'warning', '31-60': 'orange', '61-90': 'deep-orange', '91-180': 'error', '180+': 'error' }
    const termLabels: Record<string, string> = { '1-30': '1-30d', '31-60': '31-60d', '61-90': '61-90d', '91-180': '91-180d', '180+': '>6mo' }
    const overdueBadges: KpiBadge[] = []
    for (const [key, amount] of Object.entries(store.overdueByTerm)) {
      if (amount > 0 && key in termLabels) {
        overdueBadges.push({ label: termLabels[key], value: amount, isCurrency: true, color: termColors[key] })
      }
    }

    return [
      {
        title: 'Net Revenue',
        value: rev,
        isCurrency: true,
        subtitle: `${dateFrom.value} to ${dateTo.value}`,
        icon: 'mdi-currency-usd',
        color: 'primary',
        trend: revChg.trend,
        trendLabel: revChg.label,
        sparkline: store.sparkline.length ? store.sparkline : undefined,
        route: '/finance/dashboard',
        badges: [
          ...store.revenueByOutlet.map(o => ({ label: o.label, value: o.value, isCurrency: true, color: o.color })),
          { label: 'Gross Margin', value: `${grossMargin}%`, color: +grossMargin >= 0 ? 'success' : 'error' },
        ],
      },
      {
        title: 'Net Income',
        value: net,
        isCurrency: true,
        subtitle: `Profit margin ${netMargin}%`,
        icon: 'mdi-chart-line',
        color: 'success',
        trend: netChg.trend,
        trendLabel: netChg.label,
        sparkline: store.sparkline.length ? store.sparkline : undefined,
        route: '/finance/income-statement',
        badges: [
          { label: 'Revenue', value: rev, isCurrency: true, color: 'primary' },
          { label: 'Expenses', value: (cur?.opex ?? 0) + (cur?.cogs ?? 0), isCurrency: true, color: 'warning' },
        ],
      },
      {
        title: 'Overdue Receivables',
        value: store.overdueTotal,
        isCurrency: true,
        subtitle: `${overdueBadges.length} bucket${overdueBadges.length !== 1 ? 's' : ''}`,
        icon: 'mdi-account-clock-outline',
        color: 'warning',
        trend: store.overdueTotal > 0 ? 'up' : 'neutral',
        trendLabel: store.overdueTotal > 0 ? 'Requires attention' : 'All current',
        route: '/finance/accounts-receivable',
        badges: overdueBadges.length ? overdueBadges : [{ label: 'All current', value: '✓', color: 'success' }],
      },
      {
        title: 'Open Purchase Orders',
        value: store.openPOs,
        subtitle: 'Awaiting Fulfillment',
        icon: 'mdi-cart-outline',
        color: 'info',
        trend: store.openPOs > 0 ? 'up' : 'neutral',
        trendLabel: 'Active orders',
        route: '/purchasing/purchase-orders',
        badges: [{ label: 'Pending', value: store.openPOs, color: 'info' }],
      },
    ]
  })

  onMounted(refresh)

  return {
    kpiCards,
    monthlyPnL,
    dateFrom,
    dateTo,
    loading: computed(() => store.loading),
    error: computed(() => store.error),
    refresh,
    applyDateRange,
    resetToCurrentMonth,
  }
}