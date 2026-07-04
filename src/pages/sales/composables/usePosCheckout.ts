import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useSalesDataStore } from '@/stores/salesData'
import type { SaleType } from '@/stores/salesData'
import type { usePos } from './usePos'

const toast = useToast()

export type ReceiptLine = {
  product_name: string
  unit: string | null
  batch_no: number | null
  expiry_date: string | null
  quantity: number
  unit_price: number
  line_total: number
}

export type Receipt = {
  sale_no: string
  date: string
  cashier: string
  customer: { name: string; address: string; mobile: string }
  lines: ReceiptLine[]
  subtotal: number
  total: number
  tendered: number
  change: number
}

// Rebuild a printable Receipt from a persisted sale (used by Sales History reprint).
export function buildReceiptFromSale(sale: SaleType, cashierName: string): Receipt {
  const lines: ReceiptLine[] = (sale.sale_items ?? []).map((li) => ({
    product_name: li.product?.product_name ?? '—',
    unit:         li.product?.unit != null ? String(li.product.unit) : null,
    batch_no:     li.product?.batch_no ?? null,
    expiry_date:  li.product?.expiry_date ?? null,
    quantity:     li.quantity,
    unit_price:   li.unit_price,
    line_total:   li.line_total,
  }))

  return {
    sale_no:  sale.sale_no ?? '—',
    date:     sale.created_at,
    cashier:  cashierName,
    customer: {
      name:    sale.customer?.name ?? '',
      address: sale.customer?.address ?? '',
      mobile:  sale.customer?.contact_no ?? '',
    },
    lines,
    subtotal: sale.subtotal ?? 0,
    total:    sale.total_amount ?? 0,
    tendered: sale.amount_tendered ?? 0,
    change:   sale.change_due ?? 0,
  }
}

// Receives the usePos instance so cart/total stay a single source of truth.
export function usePosCheckout(pos: ReturnType<typeof usePos>) {
  const salesStore = useSalesDataStore()
  const { loading } = storeToRefs(salesStore)

  const showPayment = ref(false)
  const showReceipt = ref(false)
  const amountTendered = ref<number | null>(null)
  const lastReceipt = ref<Receipt | null>(null)

  // Optional customer the sale is billed to (shown on the receipt).
  const customerName = ref('')
  const customerAddress = ref('')
  const customerMobile = ref('')

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
    if (!pos.selectedOutletId.value) {
      toast.warning('Select a branch first.')
      return
    }

    // Snapshot cart for the receipt before the sale clears it.
    const snapshot: ReceiptLine[] = pos.cart.value.map(l => ({
      product_name: l.product_name,
      unit:         l.unit,
      batch_no:     l.batch_no,
      expiry_date:  l.expiry_date,
      quantity:     l.quantity,
      unit_price:   l.unit_price,
      line_total:   l.quantity * l.unit_price,
    }))

    const result = await salesStore.createSale({
      outletId: pos.selectedOutletId.value,
      lines: pos.cart.value.map(l => ({
        product_id: l.product_id,
        quantity:   l.quantity,
        unit_price: l.unit_price,
      })),
      amountTendered: amountTendered.value ?? 0,
      customer: {
        name:    customerName.value.trim() || null,
        address: customerAddress.value.trim() || null,
        mobile:  customerMobile.value.trim() || null,
      },
    })

    if (!result.success || !('saleNo' in result)) return

    lastReceipt.value = {
      sale_no:  result.saleNo as string,
      date:     new Date().toISOString(),
      cashier:  (result.cashierName as string) ?? '—',
      customer: {
        name:    customerName.value.trim(),
        address: customerAddress.value.trim(),
        mobile:  customerMobile.value.trim(),
      },
      lines:    snapshot,
      subtotal: result.subtotal as number,
      total:    result.total as number,
      tendered: amountTendered.value ?? 0,
      change:   result.change as number,
    }

    showPayment.value = false
    pos.clearCart()
    customerName.value = ''
    customerAddress.value = ''
    customerMobile.value = ''
    await pos.refreshStock()
    showReceipt.value = true
  }

  return {
    loading,
    showPayment, showReceipt,
    amountTendered, changeDue, canComplete,
    customerName, customerAddress, customerMobile,
    lastReceipt,
    openPayment, confirmPayment,
  }
}
