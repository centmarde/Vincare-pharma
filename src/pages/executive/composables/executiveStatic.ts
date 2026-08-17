/**
 * Static data composable for the Executive Dashboard module.
 * Provides mock/KPI data for the ExecutiveWidget to render.
 */

export interface KpiCard {
  title: string
  value: string
  subtitle: string
  icon: string
  color: string
  trend: 'up' | 'down' | 'neutral'
  trendLabel: string
}

export interface ExecutiveDashboardData {
  kpiCards: KpiCard[]
  totalOrders: number
  pendingOrders: number
  activeSuppliers: number
}

export function useExecutiveStatic(): ExecutiveDashboardData {
  return {
    totalOrders: 342,
    pendingOrders: 28,
    activeSuppliers: 45,

    kpiCards: [
      {
        title: 'Net Revenue',
        value: '₱1,284,500',
        subtitle: 'Year to Date',
        icon: 'mdi-currency-usd',
        color: 'primary',
        trend: 'up',
        trendLabel: '+12.5% vs last month',
      },
      {
        title: 'Net Income',
        value: '₱408,300',
        subtitle: 'Year to Date',
        icon: 'mdi-chart-line',
        color: 'success',
        trend: 'up',
        trendLabel: '+15.8% vs last month',
      },
      {
        title: 'Overdue Receivables',
        value: '₱126,800',
        subtitle: 'Requires Attention',
        icon: 'mdi-account-clock-outline',
        color: 'warning',
        trend: 'up',
        trendLabel: '+5.2% vs last month',
      },
      {
        title: 'Open Purchase Orders',
        value: '18',
        subtitle: 'Awaiting Fulfillment',
        icon: 'mdi-cart-outline',
        color: 'info',
        trend: 'down',
        trendLabel: '-2.1% vs last month',
      },
    ],
  }
}
