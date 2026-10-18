import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'
import type { ARAgingTerm, ARAgingRow, ARReceivableDetail, ARSource, StatementOfAccount } from '@/stores/financeData'
import { useSalesChargesStore } from '@/stores/salesChargesData'
import { formatCurrency } from '@/utils/helpers'
import { paymentMethodOptions } from '@/utils/paymentMethods'
import type { PaymentMethod } from '@/utils/paymentMethods'

/** Where a receivable comes from, as the AR table names it. */
export const arSourceLabel: Record<ARSource, string> = {
  ethical_order: 'Ethical',
  inhouse_order: 'In-House',
  sale: 'POS',
}
/** The same, as the document a receivable is. */
export const arSourceDocument: Record<ARSource, string> = {
  ethical_order: 'Ethical Order',
  inhouse_order: 'In-House Order',
  sale: 'POS sale charged to account',
}

export const arHeaders = [
  { title: 'SOURCE',       key: 'source',        sortable: true,  align: 'center' as const },
  { title: 'REFERENCE #',  key: 'reference_no',  sortable: true,  align: 'center' as const },
  { title: 'TOTAL',        key: 'total_amount',  sortable: false, align: 'center' as const },
  { title: 'PAID',         key: 'amount_paid',   sortable: false, align: 'center' as const },
  { title: 'BALANCE',      key: 'balance',       sortable: true,  align: 'center' as const },
  { title: 'DAYS OVERDUE', key: 'days_overdue',  sortable: true,  align: 'center' as const },
  { title: 'TERM',         key: 'term',          sortable: false, align: 'center' as const },
] as const

export const AR_TERM_ORDER: ARAgingTerm[] = ['current', '1-30', '31-60', '61-90', '91-180', '180+', 'no-term']

// Worst-first precedence for picking a single "headline" term per customer jacket.
const TERM_SEVERITY: Record<ARAgingTerm, number> = {
  '180+': 6, '91-180': 5, '61-90': 4, '31-60': 3, '1-30': 2, current: 1, 'no-term': 0,
}

export type ARCustomerJacket = {
  key: string
  customerId: number | null
  customerName: string
  docCount: number
  totalBalance: number
  worstTerm: ARAgingTerm
  rows: ARAgingRow[]
}

export function useAccountsReceivable() {
  const store = useFinanceDataStore()
  const { arAging, loading } = storeToRefs(store)

  // Drill-down dialog: a single receivable traced to its source document.
  const detailOpen = ref(false)
  const detailLoading = ref(false)
  const selectedDetail = ref<ARReceivableDetail | null>(null)

  async function openDetail(row: ARAgingRow) {
    detailOpen.value = true
    detailLoading.value = true
    selectedDetail.value = null
    selectedDetail.value = await store.fetchReceivableDetail(row.source, row.id)
    detailLoading.value = false
  }

  function closeDetail() {
    detailOpen.value = false
    selectedDetail.value = null
  }

  // ── Payment on a POS charge ───────────────────────────────────────────
  // Received at the office into one of our accounts. In-House and Ethical
  // record their payments in their own modules; a POS charge has no order
  // screen, and the cashier does not take these payments, so it is here.
  const chargesStore = useSalesChargesStore()
  const paymentOpen = ref(false)
  const payAmount = ref(0)
  const payMethod = ref<PaymentMethod>('cash')
  const payReference = ref('')
  const payRemarks = ref('')
  const payCashAccountId = ref<number | null>(null)
  const paying = computed(() => chargesStore.loading)

  // Same as In-House: a customer payment lands in an operating account or the
  // cash box, never in a time deposit.
  const cashAccountOptions = computed(() =>
    store.cashAccounts
      .filter((a) => a.is_active && a.classification !== 'TIME_INVESTMENT')
      .map((a) => ({ value: a.id, title: `${a.name} — ${formatCurrency(a.balance ?? 0)}` })),
  )

  const canRecordPayment = computed(() => {
    const d = selectedDetail.value
    return !!d && d.source === 'sale' && payAmount.value > 0
      && payAmount.value <= d.balance + 0.005 && payCashAccountId.value != null
  })

  function openPayment() {
    const d = selectedDetail.value
    if (!d || d.source !== 'sale' || d.balance <= 0.01) return
    // The whole balance by default: most charges are settled in one payment.
    payAmount.value = Math.round(d.balance * 100) / 100
    payMethod.value = 'cash'
    payReference.value = ''
    payRemarks.value = ''
    payCashAccountId.value = null
    if (!store.cashAccounts.length) void store.fetchCashAccounts()
    paymentOpen.value = true
  }

  function closePayment() {
    paymentOpen.value = false
  }

  async function confirmPayment() {
    const d = selectedDetail.value
    if (!d || !canRecordPayment.value || payCashAccountId.value == null) return
    const result = await chargesStore.recordPayment({
      saleId: d.id,
      amount: payAmount.value,
      method: payMethod.value,
      reference: payReference.value.trim() || null,
      remarks: payRemarks.value.trim() || null,
      cashAccountId: payCashAccountId.value,
    })
    if (!result.success) return
    paymentOpen.value = false
    // The receivable and the aging both changed.
    selectedDetail.value = await store.fetchReceivableDetail(d.source, d.id)
    await store.fetchARAging()
  }

  // Statement of Account: the whole customer's order + payment history, not
  // just one document — see fetchStatementOfAccount for why this is a
  // separate fetch from openDetail above.
  const soaOpen = ref(false)
  const soaLoading = ref(false)
  const soaData = ref<StatementOfAccount | null>(null)

  async function openSOA(customerId: number, sourceHint?: ARSource) {
    soaOpen.value = true
    soaLoading.value = true
    soaData.value = null
    soaData.value = await store.fetchStatementOfAccount(customerId, sourceHint)
    soaLoading.value = false
  }

  function closeSOA() {
    soaOpen.value = false
    soaData.value = null
  }

  async function init() {
    await store.fetchARAging()
  }

  const totalReceivable = computed(() => arAging.value.reduce((sum, r) => sum + r.balance, 0))

  const termTotals = computed(() => {
    const totals = new Map<ARAgingTerm, number>(AR_TERM_ORDER.map((t) => [t, 0]))
    for (const row of arAging.value) {
      totals.set(row.term, (totals.get(row.term) ?? 0) + row.balance)
    }
    return AR_TERM_ORDER.map((term) => ({ term, total: totals.get(term) ?? 0 }))
  })

  const overdueReceivable = computed(() =>
    arAging.value
      .filter((r) => r.term !== 'current' && r.term !== 'no-term')
      .reduce((sum, r) => sum + r.balance, 0),
  )

  // One "jacket" per customer, mirroring the paper AR folder — grouped by
  // customer_id where available (fallback to a name key for rows with no
  // linked customer, so nothing silently disappears).
  const customerJackets = computed<ARCustomerJacket[]>(() => {
    const groups = new Map<string, ARCustomerJacket>()
    for (const row of arAging.value) {
      const key = row.customer_id != null ? `id:${row.customer_id}` : `name:${row.customer_name ?? 'Unknown'}`
      let jacket = groups.get(key)
      if (!jacket) {
        jacket = {
          key,
          customerId: row.customer_id,
          customerName: row.customer_name ?? 'Unknown Customer',
          docCount: 0,
          totalBalance: 0,
          worstTerm: 'no-term',
          rows: [],
        }
        groups.set(key, jacket)
      }
      jacket.docCount += 1
      jacket.totalBalance += row.balance
      if (TERM_SEVERITY[row.term] > TERM_SEVERITY[jacket.worstTerm]) jacket.worstTerm = row.term
      jacket.rows.push(row)
    }
    return [...groups.values()].sort((a, b) => b.totalBalance - a.totalBalance)
  })

  onMounted(init)

  return {
    arAging, loading,
    totalReceivable, termTotals, overdueReceivable, customerJackets,
    detailOpen, detailLoading, selectedDetail, openDetail, closeDetail,
    paymentOpen, payAmount, payMethod, payReference, payRemarks, payCashAccountId, paying,
    cashAccountOptions, paymentMethodOptions, canRecordPayment, openPayment, closePayment, confirmPayment,
    soaOpen, soaLoading, soaData, openSOA, closeSOA,
    init,
  }
}
