import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSalesDataStore } from '@/stores/salesData'
import { useWarehouseProductsDataStore } from '@/stores/warehouseProductsData'
import { useWarehousesDataStore } from '@/stores/warehouseData'
import { useProductsDataStore } from '@/stores/productsData'
import type { ProductType } from '@/stores/productsData'
import type { WarehouseType } from '@/stores/warehouseData'
import { useAuthUserStore } from '@/stores/authUser'
import type { SaleType } from '@/stores/salesData'

export function useSalesDashboard() {
  const salesStore = useSalesDataStore()
  const warehouseProductsStore = useWarehouseProductsDataStore()
  const warehousesStore = useWarehousesDataStore()
  const productsStore = useProductsDataStore()
  const authStore = useAuthUserStore()
  const { sales, loading } = storeToRefs(salesStore)
  const { warehouseProducts } = storeToRefs(warehouseProductsStore)
  const { warehouses } = storeToRefs(warehousesStore)
  // reorder_level for the rows on screen, by id -- see usePos for why the
  // shared catalogue is not safe to join against.
  const rowProducts = ref<ProductType[]>([])

  const filterWarehouseId = ref<number | null>(null)
  const warehouseOptions = computed(() => [
    { title: 'All Branches', value: null },
    ...warehouses.value.map((w: WarehouseType) => ({ title: w.name, value: w.id })),
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

  // reorder_level lives on the product master; warehouse_products carries only
  // the quantity, so the threshold is looked up rather than embedded.
  const lowStockCount = computed(() =>
    warehouseProducts.value.filter((r) => {
      const qty = r.total_qty ?? 0
      const reorder = rowProducts.value.find((p) => p.id === r.product_id)?.reorder_level
      return qty <= 0 || (reorder != null && qty <= reorder)
    }).length,
  )

  const recentSales = computed<SaleType[]>(() => sales.value.slice(0, 8))

  async function load() {
    if (!authStore.users.length) await authStore.getAllUsers()
    if (!warehouses.value.length) await warehousesStore.fetchWarehouses()
    // Bound to month-start: the widest range the KPI cards/recent-sales list
    // actually display. Without this the dashboard pulled every sale ever
    // recorded on every visit, which only gets slower as history grows.
    await Promise.all([
      salesStore.fetchSales({ warehouseId: filterWarehouseId.value ?? undefined, dateFrom: startOfMonth().toISOString() }),
      warehouseProductsStore.fetchWarehouseProducts({ warehouse_id: filterWarehouseId.value ?? undefined }),
    ])
    rowProducts.value = await productsStore.fetchProductsByIds(
      warehouseProducts.value.map((wp) => wp.product_id).filter((id): id is number => id != null),
    )
  }

  onMounted(load)

  return {
    loading,
    filterWarehouseId, warehouseOptions,
    today, week, month,
    topProducts, byCashier, lowStockCount, recentSales,
    load,
  }
}
