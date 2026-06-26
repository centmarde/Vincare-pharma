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

export interface MonthlyData {
  month: string
  revenue: number
  expenses: number
  orders: number
}

export interface TopProduct {
  name: string
  qty: number
  revenue: number
}

export interface ExecutiveDashboardData {
  kpiCards: KpiCard[]
  monthlyData: MonthlyData[]
  topProducts: TopProduct[]
  totalRevenue: number
  totalExpenses: number
  totalOrders: number
  pendingOrders: number
  activeSuppliers: number
}

export function useExecutiveStatic(): ExecutiveDashboardData {
  return {
    totalRevenue: 1_284_500.0,
    totalExpenses: 876_200.0,
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

    monthlyData: [
      { month: 'Jan', revenue: 98_000, expenses: 72_000, orders: 26 },
      { month: 'Feb', revenue: 102_000, expenses: 74_500, orders: 28 },
      { month: 'Mar', revenue: 95_000, expenses: 70_000, orders: 25 },
      { month: 'Apr', revenue: 110_000, expenses: 78_000, orders: 30 },
      { month: 'May', revenue: 108_000, expenses: 76_500, orders: 29 },
      { month: 'Jun', revenue: 120_000, expenses: 82_000, orders: 32 },
      { month: 'Jul', revenue: 115_000, expenses: 80_000, orders: 31 },
      { month: 'Aug', revenue: 122_000, expenses: 83_500, orders: 33 },
      { month: 'Sep', revenue: 118_000, expenses: 81_000, orders: 30 },
      { month: 'Oct', revenue: 125_000, expenses: 84_000, orders: 34 },
      { month: 'Nov', revenue: 130_000, expenses: 86_000, orders: 35 },
      { month: 'Dec', revenue: 41_500, expenses: 28_700, orders: 9 },
    ],

    topProducts: [
      { name: 'Amoxicillin 500mg', qty: 1_240, revenue: 248_000 },
      { name: 'Paracetamol 500mg', qty: 1_180, revenue: 118_000 },
      { name: 'Omeprazole 20mg', qty: 890, revenue: 133_500 },
      { name: 'Losartan 50mg', qty: 760, revenue: 114_000 },
      { name: 'Metformin 500mg', qty: 720, revenue: 72_000 },
    ],
  }
}