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
  product_name: string
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
        sku:          s.product?.sku ?? null,
        unit:         s.product?.unit != null ? String(s.product.unit) : null,
        batch_no:     s.product?.batch_no ?? null,
        expiry_date:  s.product?.expiry_date ?? null,
        unit_price:   s.product?.selling_price ?? 0,
        available:    s.quantity,
      })),
  )

  const filteredProducts = computed(() => {
    const s = search.value.trim().toLowerCase()
    if (!s) return products.value
    return products.value.filter(p =>
      p.product_name.toLowerCase().includes(s) || (p.sku?.toLowerCase().includes(s) ?? false),
    )
  })

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
    addToCart, setQty, removeFromCart, clearCart,
    init, refreshStock, setOutlet,
  }
}
