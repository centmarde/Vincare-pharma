import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSalesDataStore } from '@/stores/salesData'
import type { usePos } from './usePos'

export type Receipt = {
  sale_no: string
  lines: { product_name: string; quantity: number; unit_price: number; line_total: number }[]
  total: number
  tendered: number
  change: number
}

// Receives the usePos instance so cart/total stay a single source of truth.
export function usePosCheckout(pos: ReturnType<typeof usePos>) {
  const salesStore = useSalesDataStore()
  const { loading } = storeToRefs(salesStore)

  const showPayment = ref(false)
  const showReceipt = ref(false)
  const amountTendered = ref<number | null>(null)
  const lastReceipt = ref<Receipt | null>(null)

  const changeDue = computed(() => {
    const t = amountTendered.value ?? 0
    return Math.max(0, t - pos.total.value)
  })

  const canComplete = computed(() =>
    !pos.isEmpty.value && (amountTendered.value ?? 0) >= pos.total.value,
  )

  function openPayment() {
    if (pos.isEmpty.value) return
    amountTendered.value = null
    showPayment.value = true
  }

  async function confirmPayment() {
    if (!canComplete.value) return

    // Snapshot cart for the receipt before the sale clears it.
    const snapshot = pos.cart.value.map(l => ({
      product_name: l.product_name,
      quantity:     l.quantity,
      unit_price:   l.unit_price,
      line_total:   l.quantity * l.unit_price,
    }))

    const result = await salesStore.createSale({
      lines: pos.cart.value.map(l => ({
        product_id: l.product_id,
        quantity:   l.quantity,
        unit_price: l.unit_price,
      })),
      amountTendered: amountTendered.value ?? 0,
    })

    if (!result.success || !('saleNo' in result)) return

    lastReceipt.value = {
      sale_no:  result.saleNo as string,
      lines:    snapshot,
      total:    result.total as number,
      tendered: amountTendered.value ?? 0,
      change:   result.change as number,
    }

    showPayment.value = false
    pos.clearCart()
    await pos.refreshStock()
    showReceipt.value = true
  }

  return {
    loading,
    showPayment, showReceipt,
    amountTendered, changeDue, canComplete,
    lastReceipt,
    openPayment, confirmPayment,
  }
}
