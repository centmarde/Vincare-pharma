import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useSalesDataStore } from '@/stores/salesData'
import { useCustomersDataStore } from '@/stores/customersData'
import type { CustomerType } from '@/stores/customersData'
import type { SaleType } from '@/stores/salesData'
import type { usePos } from './usePos'
import { paymentMethodMeta } from '@/utils/paymentMethods'
import type { PaymentMethod } from '@/utils/paymentMethods'

const toast = useToast()

export type ReceiptLine = {
  product_name: string
  unit: string | null
  batch_no: string | null
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
  const customersStore = useCustomersDataStore()
  const { loading } = storeToRefs(salesStore)

  const showPayment = ref(false)
  const showReceipt = ref(false)
  const amountTendered = ref<number | null>(null)
  const lastReceipt = ref<Receipt | null>(null)

  // Cash is the default because it is the overwhelming majority at a till.
  const paymentMethod = ref<PaymentMethod>('cash')
  const paymentReference = ref('')
  const methodMeta = computed(() => paymentMethodMeta(paymentMethod.value))

  // Optional customer the sale is billed to (shown on the receipt).
  const customerName = ref('')
  const customerAddress = ref('')
  const customerMobile = ref('')

  // ─── Customer suggestions ─────────────────────────────────────────
  // createSale already remembers a new walk-in (it resolves-or-creates by
  // contact number), but until now there was no way to FIND one again — a
  // returning customer got retyped and only re-matched if the mobile was
  // entered identically. This is that lookup.
  //
  // Searched server-side, not filtered in memory: the book is ~5,000 rows and
  // POS only ever wants its own slice of it.
  const customerSuggestions = ref<CustomerType[]>([])
  const customerSearching = ref(false)
  let customerSearchTimer: ReturnType<typeof setTimeout> | null = null

  function searchCustomers(term: string) {
    if (customerSearchTimer) clearTimeout(customerSearchTimer)
    const s = term.trim()
    if (s.length < 2) { customerSuggestions.value = []; return }
    // Debounced: a cashier types a name a character at a time, and one query
    // per keystroke would be ~10 round trips for a single lookup.
    customerSearchTimer = setTimeout(async () => {
      customerSearching.value = true
      customerSuggestions.value = await customersStore.searchCustomers(s, 20, 'pos')
      customerSearching.value = false
    }, 300)
  }

  /** Fill the form from a picked suggestion. */
  function applyCustomer(customer: CustomerType) {
    customerName.value = customer.name ?? ''
    customerAddress.value = customer.address ?? ''
    customerMobile.value = customer.contact_no ?? ''
    customerSuggestions.value = []
  }

  // Only cash produces change. For the others the customer pays the exact
  // amount through another rail, so tendered/change are meaningless.
  const changeDue = computed(() => {
    if (!methodMeta.value.takesTendered) return 0
    const t = amountTendered.value ?? 0
    return Math.max(0, t - pos.total.value)
  })

  // "Tendered covers the total" is the cash test. A cheque or a GCash transfer
  // is settled by its reference, so requiring an amount there would block a
  // legitimate sale -- and accepting a blank reference would lose the only
  // trace the payment left.
  const canComplete = computed(() => {
    if (pos.isEmpty.value) return false
    if (methodMeta.value.takesTendered) {
      return (amountTendered.value ?? 0) >= pos.total.value
    }
    return paymentReference.value.trim().length > 0
  })

  function openPayment() {
    if (pos.isEmpty.value) return
    amountTendered.value = null
    paymentMethod.value = 'cash'
    paymentReference.value = ''
    showPayment.value = true
  }

  async function confirmPayment() {
    if (!canComplete.value) return
    if (!pos.selectedWarehouseId.value) {
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
      warehouseId: pos.selectedWarehouseId.value,
      lines: pos.cart.value.map(l => ({
        product_id: l.product_id,
        quantity:   l.quantity,
        unit_price: l.unit_price,
        cost_price: l.cost_price,
      })),
      // Non-cash settles at exactly the total, so the ledger records the money
      // actually received rather than a blank.
      amountTendered: methodMeta.value.takesTendered ? (amountTendered.value ?? 0) : pos.total.value,
      paymentMethod: paymentMethod.value,
      paymentReference: paymentReference.value.trim() || null,
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
      tendered: methodMeta.value.takesTendered ? (amountTendered.value ?? 0) : pos.total.value,
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
    paymentMethod, paymentReference, methodMeta,
    customerName, customerAddress, customerMobile,
    customerSuggestions, customerSearching, searchCustomers, applyCustomer,
    lastReceipt,
    openPayment, confirmPayment,
  }
}
