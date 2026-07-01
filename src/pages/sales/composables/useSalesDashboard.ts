import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSalesDataStore } from '@/stores/salesData'
import { useOutletStockDataStore } from '@/stores/outletStockData'
import { useOutletsDataStore } from '@/stores/outletsData'
import { useAuthUserStore } from '@/stores/authUser'
import type { SaleType } from '@/stores/salesData'

export function useSalesDashboard() {
  const salesStore = useSalesDataStore()
  const outletStockStore = useOutletStockDataStore()
  const outletsStore = useOutletsDataStore()
  const authStore = useAuthUserStore()
  const { sales, loading } = storeToRefs(salesStore)
  const { outletStock } = storeToRefs(outletStockStore)
  const { outlets } = storeToRefs(outletsStore)

  const filterOutletId = ref<number | null>(null)
  const outletOptions = computed(() => [
    { title: 'All Branches', value: null },
    ...outlets.value.filter(o => o.channel === 'pos').map(o => ({ title: o.name, value: o.id })),
  ])

  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
  const startOfWeek  = () => { const d = startOfToday(); d.setDate(d.getDate() - 6); return d }
  const startOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) }

  // Only completed sales count toward revenue.
  const completed = computed(() => sales.value.filter((s) => s.status === 'completed'))

  function sumSince(from: Date): { total: number; count: number } {
    const rows = completed.value.filter((s) => new Date(s.created_at) >= from)
    return { total: rows.reduce((sum, s) => sum + (s.total_amount ?? 0), 0), count: rows.length }
  }

  const today = computed(() => sumSince(startOfToday()))
  const week  = computed(() => sumSince(startOfWeek()))
  const month = computed(() => sumSince(startOfMonth()))

  const topProducts = computed(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>()
    for (const s of completed.value) {
      for (const li of s.sale_items ?? []) {
        const name = li.product?.product_name ?? '—'
        const cur = map.get(name) ?? { name, qty: 0, revenue: 0 }
        cur.qty += li.quantity
        cur.revenue += li.line_total
        map.set(name, cur)
      }
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  })

  const byCashier = computed(() => {
    const map = new Map<string, number>()
    for (const s of completed.value) {
      const name = authStore.users.find((u) => u.id === s.cashier_id)?.full_name ?? '—'
      map.set(name, (map.get(name) ?? 0) + (s.total_amount ?? 0))
    }
    return [...map.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)
  })

  const lowStockCount = computed(() =>
    outletStock.value.filter((r) => {
      const reorder = r.product?.reorder_level
      return r.quantity <= 0 || (reorder != null && r.quantity <= reorder)
    }).length,
  )

  const recentSales = computed<SaleType[]>(() => sales.value.slice(0, 8))

  async function load() {
    if (!authStore.users.length) await authStore.getAllUsers()
    if (!outlets.value.length) await outletsStore.fetchOutlets()
    // Bound to month-start: the widest range the KPI cards/recent-sales list
    // actually display. Without this the dashboard pulled every sale ever
    // recorded on every visit, which only gets slower as history grows.
    await Promise.all([
      salesStore.fetchSales({ outletId: filterOutletId.value ?? undefined, dateFrom: startOfMonth().toISOString() }),
      outletStockStore.fetchOutletStock({ outletId: filterOutletId.value ?? undefined }),
    ])
  }

  onMounted(load)

  return {
    loading,
    filterOutletId, outletOptions,
    today, week, month,
    topProducts, byCashier, lowStockCount, recentSales,
    load,
  }
}
