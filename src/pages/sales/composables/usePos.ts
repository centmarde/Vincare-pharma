import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useOutletStockDataStore } from '@/stores/outletStockData'
import { useOutletsDataStore } from '@/stores/outletsData'

const toast = useToast()

export type CartLine = {
  product_id: number
  product_name: string
  sku: string | null
  unit: string | null
  batch_no: number | null
  expiry_date: string | null
  unit_price: number
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
  /** Searchable: what a barcode scanner types in. */
  barcode: string | null
  sku: string | null
  unit: string | null
  batch_no: number | null
  expiry_date: string | null
  unit_price: number
  available: number
}

export function usePos() {
  const outletStockStore = useOutletStockDataStore()
  const outletsStore = useOutletsDataStore()
  const { outletStock, loading } = storeToRefs(outletStockStore)
  const { outlets } = storeToRefs(outletsStore)

  // ─── State ────────────────────────────────────────────────────────
  const search = ref('')
  const cart = ref<CartLine[]>([])
  const selectedOutletId = ref<number | null>(null)

  // ─── Branch picker ────────────────────────────────────────────────
  const posOutletOptions = computed(() =>
    outlets.value
      .filter(o => o.channel === 'pos' && o.is_active)
      .map(o => ({ title: o.name, value: o.id })),
  )

  // ─── Computed ─────────────────────────────────────────────────────
  // Sellable products = Exelmed outlet_stock rows with qty on hand.
  const products = computed<PosProduct[]>(() =>
    outletStock.value
      .filter(s => s.quantity > 0 && s.product)
      .map(s => ({
        product_id:   s.product_id,
        product_name: s.product?.product_name ?? '—',
        brand:        s.product?.brand ?? null,
        barcode:      s.product?.barcode != null ? String(s.product.barcode) : null,
        sku:          s.product?.sku ?? null,
        unit:         s.product?.unit != null ? String(s.product.unit) : null,
        batch_no:     s.product?.batch_no ?? null,
        expiry_date:  s.product?.expiry_date ?? null,
        unit_price:   s.product?.selling_price ?? 0,
        available:    s.quantity,
      })),
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
    if (!selectedOutletId.value) return
    await outletStockStore.fetchOutletStock({ outletId: selectedOutletId.value })
    // Live stock updates: with 2+ terminals on the same branch, a sale on
    // one terminal must reflect here immediately — otherwise a cashier can
    // add an item to cart that's already sold out and only find out from a
    // raw RPC error at checkout instead of the UI greying it out up front.
    outletStockStore.startRealtime(selectedOutletId.value)
  }

  async function setOutlet(outletId: number) {
    if (selectedOutletId.value === outletId) return
    selectedOutletId.value = outletId
    clearCart()
    await refreshStock()
  }

  async function init() {
    if (!outlets.value.length) await outletsStore.fetchOutlets()
    if (!selectedOutletId.value) {
      selectedOutletId.value = posOutletOptions.value[0]?.value ?? null
    }
    await refreshStock()
  }

  return {
    search, cart, loading,
    selectedOutletId, posOutletOptions,
    products, filteredProducts,
    subtotal, total, itemCount, isEmpty,
    isSearching, resultCount, submitSearch, clearSearch,
    addToCart, setQty, removeFromCart, clearCart,
    init, refreshStock, setOutlet,
  }
}
