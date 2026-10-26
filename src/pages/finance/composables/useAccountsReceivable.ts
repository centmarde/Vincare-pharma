import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'
import type { ARAgingTerm, ARAgingRow, ARReceivableDetail, ARSource, StatementOfAccount } from '@/stores/financeData'
import { useSalesChargesStore } from '@/stores/salesChargesData'
import { customerNameKey, formatCurrency } from '@/utils/helpers'
import { chequeFor, chequeProblem } from '@/utils/paymentMethods'

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
  /**
   * Every customer record in this envelope, largest balance first. The live
   * book holds several records for some customers; staff keep ONE envelope per
   * customer, so copies sharing a name are filed together.
   */
  customerIds: number[]
  customerName: string
  docCount: number
  totalBalance: number
  worstTerm: ARAgingTerm
  /** Every open document is on consignment terms — the jacket is aged, not overdue. */
  consignment: boolean
  rows: ARAgingRow[]
}

/**
 * One consignment customer on the collector's list. They pay as they sell, so
 * nothing is "overdue": what tells the collector where to go is how long the
 * goods have been out and how long since they last paid.
 */
export type ConsignmentCollectorRow = {
  customerId: number | null
  /** Every record of this customer (see ARCustomerJacket.customerIds). */
  customerIds: number[]
  customerName: string
  termText: string | null
  balance: number
  /**
   * Paid so far on their open documents. Can be above zero with no
   * lastPaymentAt: an opening receivable carries what was paid before cutover
   * as a figure, with no dated payment behind it.
   */
  paid: number
  docCount: number
  oldestDeliveryDays: number | null
  lastPaymentAt: string | null
  daysSincePayment: number | null
}

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)

/** Which envelope a receivable is filed in: the customer's name, or its id when it has none. */
function envelopeKey(row: ARAgingRow): string {
  const name = customerNameKey(row.customer_name)
  if (name) return `name:${name}`
  return row.customer_id != null ? `id:${row.customer_id}` : 'unknown'
}

/** Customer ids ordered by how much each one owes, largest first. */
function idsByBalance(rows: ARAgingRow[]): number[] {
  const owed = new Map<number, number>()
  for (const r of rows) if (r.customer_id != null) owed.set(r.customer_id, (owed.get(r.customer_id) ?? 0) + r.balance)
  return [...owed].sort((a, b) => b[1] - a[1]).map(([id]) => id)
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

  /** Re-reads the open receivable — after a change request moved its status. */
  async function refreshDetail() {
    const d = selectedDetail.value
    if (!d) return
    selectedDetail.value = await store.fetchReceivableDetail(d.source, d.id)
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
  const payMethod = ref('cash')
  const payReference = ref('')
  const payRemarks = ref('')
  const payCashAccountId = ref<number | null>(null)
  const payChequeBank = ref('')
  const payChequeNo = ref('')
  const payChequeDate = ref('')
  const payChequeInput = () => ({ bank: payChequeBank.value, number: payChequeNo.value, date: payChequeDate.value })
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
      && !chequeProblem(payMethod.value, payChequeInput())
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
    payChequeBank.value = ''
    payChequeNo.value = ''
    payChequeDate.value = ''
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
      cheque: chequeFor(payMethod.value, payChequeInput()),
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

  /** Every record of the customer goes on the one statement. */
  async function openSOA(customerIds: number | number[], sourceHint?: ARSource) {
    soaOpen.value = true
    soaLoading.value = true
    soaData.value = null
    soaData.value = await store.fetchStatementOfAccount(customerIds, sourceHint)
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

  // Consignment is shown on its own: left in, it would swell "No term" — which
  // is meant to flag customers whose terms were never set.
  const termTotals = computed(() => {
    const totals = new Map<ARAgingTerm, number>(AR_TERM_ORDER.map((t) => [t, 0]))
    for (const row of arAging.value) {
      if (row.consignment) continue
      totals.set(row.term, (totals.get(row.term) ?? 0) + row.balance)
    }
    return AR_TERM_ORDER.map((term) => ({ term, total: totals.get(term) ?? 0 }))
  })

  const consignmentReceivable = computed(() =>
    arAging.value.filter((r) => r.consignment).reduce((sum, r) => sum + r.balance, 0),
  )

  /** Longest since a payment first; never-paid customers by how long the goods have been out. */
  const consignmentCollectors = computed<ConsignmentCollectorRow[]>(() => {
    const groups = new Map<string, ConsignmentCollectorRow>()
    const rowsOf = new Map<string, ARAgingRow[]>()
    for (const row of arAging.value) {
      if (!row.consignment) continue
      const key = envelopeKey(row)
      rowsOf.set(key, [...(rowsOf.get(key) ?? []), row])
      let g = groups.get(key)
      if (!g) {
        g = {
          customerId: row.customer_id, customerIds: [], customerName: row.customer_name?.trim() || 'Unknown Customer',
          termText: row.term_text, balance: 0, paid: 0, docCount: 0,
          oldestDeliveryDays: null, lastPaymentAt: null, daysSincePayment: null,
        }
        groups.set(key, g)
      }
      g.balance += row.balance
      g.paid += row.amount_paid
      g.docCount += 1
      if (row.days_since_delivery != null && (g.oldestDeliveryDays == null || row.days_since_delivery > g.oldestDeliveryDays)) {
        g.oldestDeliveryDays = row.days_since_delivery
      }
      if (row.last_payment_at && (!g.lastPaymentAt || row.last_payment_at > g.lastPaymentAt)) g.lastPaymentAt = row.last_payment_at
    }
    for (const [key, g] of groups) {
      g.customerIds = idsByBalance(rowsOf.get(key) ?? [])
      g.customerId = g.customerIds[0] ?? g.customerId
    }
    const rows = [...groups.values()]
    for (const g of rows) g.daysSincePayment = g.lastPaymentAt ? daysSince(g.lastPaymentAt) : null
    const urgency = (g: ConsignmentCollectorRow) => g.daysSincePayment ?? g.oldestDeliveryDays ?? 0
    return rows.sort((a, b) => urgency(b) - urgency(a) || b.balance - a.balance)
  })

  const showConsignment = ref(false)
  function openConsignment() {
    showConsignment.value = true
  }

  const overdueReceivable = computed(() =>
    arAging.value
      .filter((r) => r.term !== 'current' && r.term !== 'no-term')
      .reduce((sum, r) => sum + r.balance, 0),
  )

  // One "jacket" per customer, mirroring the paper AR folder (staff keep one
  // envelope per customer). Filed by NAME, not record id: the live book holds
  // up to four records for one customer (HIPOL FAMILY HOSPITAL, ANANORIA
  // PHARMACY…), each with its own orders, and an envelope per record split one
  // customer's balance across the list. Rows with no name fall back to the id.
  const customerJackets = computed<ARCustomerJacket[]>(() => {
    const groups = new Map<string, ARCustomerJacket>()
    for (const row of arAging.value) {
      const key = envelopeKey(row)
      let jacket = groups.get(key)
      if (!jacket) {
        jacket = {
          key,
          customerId: row.customer_id,
          customerIds: [],
          customerName: row.customer_name?.trim() || 'Unknown Customer',
          docCount: 0,
          totalBalance: 0,
          worstTerm: 'no-term',
          consignment: true,
          rows: [],
        }
        groups.set(key, jacket)
      }
      jacket.docCount += 1
      jacket.totalBalance += row.balance
      if (TERM_SEVERITY[row.term] > TERM_SEVERITY[jacket.worstTerm]) jacket.worstTerm = row.term
      if (!row.consignment) jacket.consignment = false
      jacket.rows.push(row)
    }
    for (const jacket of groups.values()) {
      jacket.customerIds = idsByBalance(jacket.rows)
      jacket.customerId = jacket.customerIds[0] ?? jacket.customerId
    }
    return [...groups.values()].sort((a, b) => b.totalBalance - a.totalBalance)
  })

  onMounted(init)

  return {
    arAging, loading,
    totalReceivable, termTotals, overdueReceivable, customerJackets,
    consignmentReceivable, consignmentCollectors, showConsignment, openConsignment,
    detailOpen, detailLoading, selectedDetail, openDetail, closeDetail, refreshDetail,
    paymentOpen, payAmount, payMethod, payReference, payRemarks, payCashAccountId, paying,
    payChequeBank, payChequeNo, payChequeDate,
    cashAccountOptions, canRecordPayment, openPayment, closePayment, confirmPayment,
    soaOpen, soaLoading, soaData, openSOA, closeSOA,
    init,
  }
}
