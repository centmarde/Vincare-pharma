import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useWarehouseProductsDataStore } from '@/stores/warehouseProductsData'
import { useWarehousesDataStore } from '@/stores/warehouseData'
import { useProductsDataStore } from '@/stores/productsData'
import type { WarehouseType } from '@/stores/warehouseData'
import type { ProductType } from '@/stores/productsData'

/**
 * A branch inventory row. warehouse_products carries only the quantity (no
 * embedded product relation, unlike the outlet_stock rows this replaced), so
 * the product master is joined in and the row keeps the old shape — the table
 * templates read `quantity` and `product.*` and need no changes.
 */
export type BranchStockRow = {
  product_id: number | null
  quantity: number
  product: ProductType | null
}

export type StockStatus = 'out' | 'low' | 'ok'

export const headers = [
  { title: 'PRODUCT',    key: 'product_name', sortable: true,  align: 'start' as const },
  { title: 'ON HAND',    key: 'quantity',     sortable: true,  align: 'center' as const },
  { title: 'UNIT PRICE', key: 'unit_price',   sortable: false, align: 'center' as const },
  { title: 'VALUE',      key: 'value',        sortable: false, align: 'center' as const },
  { title: 'EXPIRY',     key: 'expiry',       sortable: false, align: 'center' as const },
  { title: 'STATUS',     key: 'status',       sortable: false, align: 'center' as const },
] as const

export function rowStatus(row: BranchStockRow): StockStatus {
  const reorder = row.product?.reorder_level
  if (row.quantity <= 0) return 'out'
  if (reorder != null && row.quantity <= reorder) return 'low'
  return 'ok'
}

export function useOutletInventory() {
  const warehouseProductsStore = useWarehouseProductsDataStore()
  const warehousesStore = useWarehousesDataStore()
  const productsStore = useProductsDataStore()
  const { warehouseProducts, loading } = storeToRefs(warehouseProductsStore)
  const { warehouses } = storeToRefs(warehousesStore)

  // Products for the rows on screen, fetched by id rather than read from the
  // shared catalogue: fetchProducts() is capped at 1000 rows of ~1072 and
  // applies the Products page's filters, so a branch's product can be missing
  // from it entirely and render as a blank name at zero price.
  const rowProducts = ref<ProductType[]>([])

  const search = ref('')
  const filterStatus = ref<'all' | StockStatus>('all')
  const selectedWarehouseId = ref<number | null>(null)
  const statusOptions: { title: string; value: StockStatus | 'all' }[] = [
    { title: 'All', value: 'all' },
    { title: 'Out of stock', value: 'out' },
    { title: 'Low stock', value: 'low' },
    { title: 'OK', value: 'ok' },
  ]
  // Every warehouse is a branch now; there is no channel to filter on.
  const warehouseOptions = computed(() =>
    warehouses.value.map((w: WarehouseType) => ({ title: w.name, value: w.id })),
  )

  const rows = computed<BranchStockRow[]>(() =>
    warehouseProducts.value.map((wp) => ({
      product_id: wp.product_id,
      quantity: wp.total_qty ?? 0,
      product: rowProducts.value.find((p) => p.id === wp.product_id) ?? null,
    })),
  )

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
    if (!selectedWarehouseId.value) return
    await warehouseProductsStore.fetchWarehouseProducts({ warehouse_id: selectedWarehouseId.value })
    rowProducts.value = await productsStore.fetchProductsByIds(
      warehouseProducts.value.map((wp) => wp.product_id).filter((id): id is number => id != null),
    )
    warehouseProductsStore.startRealtime()
  }

  async function setWarehouse(warehouseId: number) {
    selectedWarehouseId.value = warehouseId
    await loadStock()
  }

  async function init() {
    if (!warehouses.value.length) await warehousesStore.fetchWarehouses()
    if (!selectedWarehouseId.value) selectedWarehouseId.value = warehouseOptions.value[0]?.value ?? null
    await loadStock()
  }

  onMounted(init)

  return {
    loading, search, filterStatus, statusOptions,
    selectedWarehouseId, warehouseOptions, setWarehouse,
    filteredRows,
    totalSkus, totalValue, lowCount, outCount,
    rowStatus, init,
  }
}
