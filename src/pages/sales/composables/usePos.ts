import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { EXELMED_OUTLET } from '@/stores/salesData'
import { useOutletStockDataStore } from '@/stores/outletStockData'

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
  const { outletStock, loading } = storeToRefs(outletStockStore)

  // ─── State ────────────────────────────────────────────────────────
  const search = ref('')
  const cart = ref<CartLine[]>([])

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
  function addToCart(product: PosProduct) {
    const existing = cart.value.find(l => l.product_id === product.product_id)
    if (existing) {
      if (existing.quantity >= existing.available) {
        toast.warning(`Only ${existing.available} of ${product.product_name} in stock.`)
        return
      }
      existing.quantity += 1
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
      available:    product.available,
    })
  }

  function setQty(index: number, qty: number) {
    const line = cart.value[index]
    if (!line) return
    const clamped = Math.max(1, Math.min(qty, line.available))
    if (qty > line.available) toast.warning(`Only ${line.available} of ${line.product_name} in stock.`)
    line.quantity = clamped
  }

  function removeFromCart(index: number) {
    cart.value.splice(index, 1)
  }

  function clearCart() {
    cart.value = []
  }

  // ─── Init ─────────────────────────────────────────────────────────
  async function init() {
    await outletStockStore.fetchOutletStock({ outlet: EXELMED_OUTLET })
  }

  async function refreshStock() {
    await outletStockStore.fetchOutletStock({ outlet: EXELMED_OUTLET })
  }

  return {
    search, cart, loading,
    products, filteredProducts,
    subtotal, total, itemCount, isEmpty,
    addToCart, setQty, removeFromCart, clearCart,
    init, refreshStock,
  }
}
