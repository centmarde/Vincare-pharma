import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useOutletStockDataStore } from '@/stores/outletStockData'
import { useOutletsDataStore } from '@/stores/outletsData'
import type { OutletStockType } from '@/stores/outletStockData'

export type StockStatus = 'out' | 'low' | 'ok'

export const headers = [
  { title: 'PRODUCT',    key: 'product_name', sortable: true,  align: 'start' as const },
  { title: 'ON HAND',    key: 'quantity',     sortable: true,  align: 'center' as const },
  { title: 'UNIT PRICE', key: 'unit_price',   sortable: false, align: 'center' as const },
  { title: 'VALUE',      key: 'value',        sortable: false, align: 'center' as const },
  { title: 'EXPIRY',     key: 'expiry',       sortable: false, align: 'center' as const },
  { title: 'STATUS',     key: 'status',       sortable: false, align: 'center' as const },
] as const

export function rowStatus(row: OutletStockType): StockStatus {
  const reorder = row.product?.reorder_level
  if (row.quantity <= 0) return 'out'
  if (reorder != null && row.quantity <= reorder) return 'low'
  return 'ok'
}

export function useOutletInventory() {
  const outletStockStore = useOutletStockDataStore()
  const outletsStore = useOutletsDataStore()
  const { outletStock, loading } = storeToRefs(outletStockStore)
  const { outlets } = storeToRefs(outletsStore)

  const search = ref('')
  const filterStatus = ref<'all' | StockStatus>('all')
  const selectedOutletId = ref<number | null>(null)
  const statusOptions: { title: string; value: StockStatus | 'all' }[] = [
    { title: 'All', value: 'all' },
    { title: 'Out of stock', value: 'out' },
    { title: 'Low stock', value: 'low' },
    { title: 'OK', value: 'ok' },
  ]
  const outletOptions = computed(() =>
    outlets.value.filter(o => o.channel === 'pos').map(o => ({ title: o.name, value: o.id })),
  )

  const rows = computed(() => outletStock.value)

  const filteredRows = computed(() => {
    let list = rows.value
    if (filterStatus.value !== 'all') list = list.filter((r) => rowStatus(r) === filterStatus.value)
    const s = search.value.trim().toLowerCase()
    if (s) {
      list = list.filter((r) =>
        (r.product?.product_name?.toLowerCase().includes(s) ?? false) ||
        (r.product?.sku?.toLowerCase().includes(s) ?? false),
      )
    }
    return list
  })

  // Summary cards
  const totalSkus = computed(() => rows.value.length)
  const totalValue = computed(() =>
    rows.value.reduce((sum, r) => sum + r.quantity * (r.product?.selling_price ?? 0), 0),
  )
  const lowCount = computed(() => rows.value.filter((r) => rowStatus(r) === 'low').length)
  const outCount = computed(() => rows.value.filter((r) => rowStatus(r) === 'out').length)

  async function loadStock() {
    if (!selectedOutletId.value) return
    await outletStockStore.fetchOutletStock({ outletId: selectedOutletId.value })
    outletStockStore.startRealtime(selectedOutletId.value)
  }

  async function setOutlet(outletId: number) {
    selectedOutletId.value = outletId
    await loadStock()
  }

  async function init() {
    if (!outlets.value.length) await outletsStore.fetchOutlets()
    if (!selectedOutletId.value) selectedOutletId.value = outletOptions.value[0]?.value ?? null
    await loadStock()
  }

  onMounted(init)

  return {
    loading, search, filterStatus, statusOptions,
    selectedOutletId, outletOptions, setOutlet,
    filteredRows,
    totalSkus, totalValue, lowCount, outCount,
    rowStatus, init,
  }
}
