import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useWarehouseProductsDataStore } from '@/stores/warehouseProductsData'
import { useWarehousesDataStore } from '@/stores/warehouseData'
import { useProductsDataStore } from '@/stores/productsData'
import type { ProductType } from '@/stores/productsData'
import type { WarehouseType } from '@/stores/warehouseData'

const toast = useToast()

export type CartLine = {
  product_id: number
  product_name: string
  sku: string | null
  unit: string | null
  batch_no: string | null
  expiry_date: string | null
  unit_price: number
  /**
   * What the goods cost us, snapshotted when they are sold. COGS is a
   * historical fact — freezing it here stops the ledger valuing a past sale at
   * whatever the product master happens to say when the ledger is next resynced.
   */
  cost_price: number | null
  quantity: number
  available: number
}

export type PosProduct = {
  product_id: number
  // product_name IS the molecule — the catalogue is all generics
  // (ACETYLCYSTEINE 200MG SACHET 10S), so there is no separate generic name to
  // search. products.generic_name does not exist in the database.
  product_name: string
  /**
   * Searchable: the trade name (FLUIMUCIL, HISTAZYN). We stock by molecule but
   * a customer asks for the brand, so without this a walk-in asking for
   * "Fluimucil" finds nothing even though the row carries it. Populated on
   * 2,390 of 2,401 products.
   */
  brand: string | null
  /** Snapshotted onto the sale line so COGS is priced at the cost on the day. */
  cost_price: number | null
  /** Searchable: what a barcode scanner types in. */
  barcode: string | null
  sku: string | null
  unit: string | null
  batch_no: string | null
  expiry_date: string | null
  unit_price: number
  available: number
}

export function usePos() {
  const warehouseProductsStore = useWarehouseProductsDataStore()
  const warehousesStore = useWarehousesDataStore()
  const productsStore = useProductsDataStore()
  const { warehouseProducts, loading } = storeToRefs(warehouseProductsStore)
  const { warehouses } = storeToRefs(warehousesStore)
  // Products for the rows on screen, fetched by id -- the shared catalogue is
  // capped at 1000 rows of ~1072, so a product a branch is holding can be
  // missing from it and render blank at zero price (it would also be unsellable
  // at the correct amount).
  const rowProducts = ref<ProductType[]>([])

  // ─── State ────────────────────────────────────────────────────────
  const search = ref('')
  const cart = ref<CartLine[]>([])
  const selectedWarehouseId = ref<number | null>(null)

  // ─── Branch picker ────────────────────────────────────────────────
  // Every warehouse is sellable-from: there is no channel to filter on any
  // more, and `warehouses` has no is_active column (schema finalised).
  const posWarehouseOptions = computed(() =>
    warehouses.value.map((w: WarehouseType) => ({ title: w.name, value: w.id })),
  )

  // ─── Computed ─────────────────────────────────────────────────────
  // Sellable products = this warehouse's warehouse_products rows with qty on
  // hand. warehouse_products carries only the quantity (no embedded product
  // relation, unlike the outlet_stock rows this replaced), so the product
  // master is joined here in JS.
  const products = computed<PosProduct[]>(() =>
    warehouseProducts.value
      .filter(s => (s.total_qty ?? 0) > 0 && s.product_id != null)
      .map(s => {
        const p = rowProducts.value.find(pr => pr.id === s.product_id)
        return {
          product_id:   s.product_id as number,
          product_name: p?.product_name ?? '—',
          brand:        p?.brand ?? null,
          cost_price:   p?.cost_price ?? null,
          barcode:      p?.barcode != null ? String(p.barcode) : null,
          sku:          p?.sku ?? null,
          unit:         p?.unit != null ? String(p.unit) : null,
          batch_no:     p?.batch_no ?? null,
          expiry_date:  p?.expiry_date ?? null,
          unit_price:   p?.selling_price ?? 0,
          available:    s.total_qty ?? 0,
        }
      }),
  )

  // Matches brand name, generic name, SKU and barcode. Barcode matters most:
  // a scanner types the code and hits Enter, and without it in the filter a
  // scan finds nothing at all.
  const filteredProducts = computed(() => {
    const s = search.value.trim().toLowerCase()
    if (!s) return products.value
    return products.value.filter(p =>
      p.product_name.toLowerCase().includes(s)
      || (p.brand?.toLowerCase().includes(s) ?? false)
      || (p.sku?.toLowerCase().includes(s) ?? false)
      || (p.barcode?.toLowerCase().includes(s) ?? false),
    )
  })

  const isSearching = computed(() => search.value.trim().length > 0)
  const resultCount = computed(() => filteredProducts.value.length)

  const subtotal = computed(() => cart.value.reduce((sum, l) => sum + l.quantity * l.unit_price, 0))
  const total = computed(() => subtotal.value)
  const itemCount = computed(() => cart.value.reduce((sum, l) => sum + l.quantity, 0))
  const isEmpty = computed(() => cart.value.length === 0)

  // ─── Cart actions ─────────────────────────────────────────────────
  // Live on-hand for a product, from the realtime-backed `products` list —
  // not the qty snapshotted into the cart line, which can go stale the
  // moment another terminal sells from the same branch.
  function liveAvailable(productId: number): number {
    return products.value.find(p => p.product_id === productId)?.available ?? 0
  }

  function addToCart(product: PosProduct) {
    const existing = cart.value.find(l => l.product_id === product.product_id)
    const available = liveAvailable(product.product_id)
    if (existing) {
      if (existing.quantity >= available) {
        toast.warning(`Only ${available} of ${product.product_name} in stock.`)
        return
      }
      existing.quantity += 1
      existing.available = available
      return
    }
    cart.value.push({
      product_id:   product.product_id,
      product_name: product.product_name,
      sku:          product.sku,
      unit:         product.unit,
      batch_no:     product.batch_no,
      expiry_date:  product.expiry_date,
      unit_price:   product.unit_price,
      cost_price:   product.cost_price,
      quantity:     1,
      available,
    })
  }

  // The Search button and the Enter key. An exact single match goes straight
  // into the cart and clears the box — that is what makes a barcode scanner
  // work (it types the code then sends Enter) and saves a click per item at
  // the counter. Anything else just leaves the filtered grid on screen.
  function submitSearch() {
    if (!isSearching.value) return
    const matches = filteredProducts.value
    if (matches.length === 1) {
      addToCart(matches[0])
      search.value = ''
      return
    }
    if (matches.length === 0) toast.info('No product matches that search.')
  }

  function clearSearch() {
    search.value = ''
  }

  function setQty(index: number, qty: number) {
    const line = cart.value[index]
    if (!line) return
    const available = liveAvailable(line.product_id)
    line.available = available
    const clamped = Math.max(1, Math.min(qty, available))
    if (qty > available) toast.warning(`Only ${available} of ${line.product_name} in stock.`)
    line.quantity = clamped
  }

  function removeFromCart(index: number) {
    cart.value.splice(index, 1)
  }

  function clearCart() {
    cart.value = []
  }

  // ─── Init ─────────────────────────────────────────────────────────
  async function refreshStock() {
    if (!selectedWarehouseId.value) return
    await warehouseProductsStore.fetchWarehouseProducts({ warehouse_id: selectedWarehouseId.value })
    rowProducts.value = await productsStore.fetchProductsByIds(
      warehouseProducts.value.map(wp => wp.product_id).filter((id): id is number => id != null),
    )
    // Live stock updates: with 2+ terminals on the same branch, a sale on
    // one terminal must reflect here immediately — otherwise a cashier can
    // add an item to cart that's already sold out and only find out from a
    // raw RPC error at checkout instead of the UI greying it out up front.
    warehouseProductsStore.startRealtime()
  }

  async function setWarehouse(warehouseId: number) {
    if (selectedWarehouseId.value === warehouseId) return
    selectedWarehouseId.value = warehouseId
    clearCart()
    await refreshStock()
  }

  async function init() {
    if (!warehouses.value.length) await warehousesStore.fetchWarehouses()
    if (!selectedWarehouseId.value) {
      selectedWarehouseId.value = posWarehouseOptions.value[0]?.value ?? null
    }
    await refreshStock()
  }

  return {
    search, cart, loading,
    selectedWarehouseId, posWarehouseOptions,
    products, filteredProducts,
    subtotal, total, itemCount, isEmpty,
    isSearching, resultCount, submitSearch, clearSearch,
    addToCart, setQty, removeFromCart, clearCart,
    init, refreshStock, setWarehouse,
  }
}
