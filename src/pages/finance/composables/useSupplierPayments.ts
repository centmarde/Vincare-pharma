import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore, apAgeBuckets } from '@/stores/financeData'
import type { APAgeBucket, APAgingRow, SupplierAPRow } from '@/stores/financeData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { useDisbursementVouchersStore } from '@/stores/disbursementVouchersData'
import type { SupplierPaymentType } from '@/stores/financeData'
import { useRouter } from 'vue-router'
import { amountMatches, manilaDayOf, parseAmountQuery } from './useDisbursementVouchers'

// Supplier Payments is a MONITORING page — it shows what is owed, how old it
// is, and what has been paid. It does not record payments.
//
// Payments are raised as disbursement vouchers instead (pay-to: A supplier),
// so one document covers the cheque, the signatures and the ledger entry. That
// also fixed two things the old in-page dialog never did: it never set
// cash_account_id, so every payment defaulted to 1020 in the GL regardless of
// which account paid, and it never moved any cash balance at all.

export const apHeaders = [
  { title: 'SUPPLIER',        key: 'supplier_name',  sortable: true,  align: 'center' as const },
  { title: 'TOTAL RECEIVED',  key: 'total_received', sortable: false, align: 'center' as const },
  { title: 'TOTAL PAID',      key: 'total_paid',     sortable: false, align: 'center' as const },
  { title: 'OUTSTANDING',     key: 'outstanding',    sortable: true,  align: 'center' as const },
  { title: 'DRIFT',           key: 'has_drift',      sortable: false, align: 'center' as const },
  { title: '',                key: 'pay',            sortable: false, align: 'center' as const },
] as const

export const agingHeaders = [
  { title: 'INVOICE #', key: 'reference_no',     sortable: true,  align: 'center' as const },
  { title: 'PO NO.',    key: 'po_no',            sortable: true,  align: 'center' as const },
  { title: 'SUPPLIER',  key: 'supplier_name',    sortable: true,  align: 'center' as const },
  { title: 'DATE',      key: 'invoice_date',     sortable: true,  align: 'center' as const },
  { title: 'AMOUNT',    key: 'total_amount',     sortable: false, align: 'center' as const },
  { title: 'PAID',      key: 'paid',             sortable: false, align: 'center' as const },
  { title: 'BALANCE',   key: 'balance',          sortable: true,  align: 'center' as const },
  { title: 'AGE',       key: 'days_outstanding', sortable: true,  align: 'center' as const },
  { title: '',          key: 'pay',              sortable: false, align: 'center' as const },
] as const

export const paymentHistoryHeaders = [
  { title: 'REFERENCE #', key: 'reference_no',    sortable: true,  align: 'center' as const },
  // The voucher that paid it, and the POs it was for (from the voucher's
  // reference — see poNumbersOf).
  { title: 'DV NO.',      key: 'dv_no',            sortable: false, align: 'center' as const },
  { title: 'PO NO.',      key: 'po_no',            sortable: false, align: 'center' as const },
  { title: 'DATE',        key: 'paid_at',          sortable: true,  align: 'center' as const },
  { title: 'SUPPLIER',    key: 'supplier_name',    sortable: false, align: 'center' as const },
  { title: 'AMOUNT',      key: 'amount',           sortable: false, align: 'center' as const },
  { title: 'METHOD',      key: 'payment_method',   sortable: false, align: 'center' as const },
  { title: '',            key: 'cr_actions',       sortable: false, align: 'center' as const },
] as const

/** Chip colour per bucket — older reads hotter. */
export const bucketColor: Record<APAgeBucket, string> = {
  '0-30': 'success',
  '31-60': 'info',
  '61-90': 'warning',
  '91-180': 'orange',
  '180+': 'error',
}

export function useSupplierPayments() {
  const financeStore = useFinanceDataStore()
  const suppliersStore = useSuppliersDataStore()
  const { supplierAP, apAging, supplierPayments, loading } = storeToRefs(financeStore)
  const { suppliers } = storeToRefs(suppliersStore)
  const router = useRouter()
  const voucherStore = useDisbursementVouchersStore()

  /** Payment id -> the DV number of the voucher that recorded it. */
  const dvRefs = ref<Map<number, string>>(new Map())

  async function loadVoucherRefs() {
    dvRefs.value = await voucherStore.fetchVoucherRefsForExpenses(supplierPayments.value.map((p) => p.id))
  }

  async function init() {
    await Promise.all([
      financeStore.fetchSupplierAP(),
      financeStore.fetchAPAging(),
      financeStore.fetchSupplierPayments(),
      suppliersStore.fetchSuppliers(),
    ])
    await loadVoucherRefs()
  }

  function dvNoOf(payment: SupplierPaymentType): string | null {
    return dvRefs.value.get(payment.id) ?? null
  }

  /**
   * The POs a payment was for. A payment is not tied to particular invoices
   * (they are settled oldest first), so this is read from what the voucher
   * said: Pay from this page writes the PO numbers into the voucher's
   * reference, which every payment it records carries in its remarks. A
   * payment raised by hand without them shows none.
   */
  function poNumbersOf(payment: SupplierPaymentType): string | null {
    const found = (payment.remarks ?? '').match(/PO-\d{4}-\d+/g)
    return found ? [...new Set(found)].join(', ') : null
  }

  // ── Filters: the same search and date range as Disbursement Vouchers ──
  const search = ref<string | null>('')
  const dateFrom = ref<string | null>(null)
  const dateTo = ref<string | null>(null)

  const dateRangeError = computed(() =>
    dateFrom.value && dateTo.value && dateFrom.value > dateTo.value ? 'From is after To' : '')
  const isFiltering = computed(() => !!search.value?.trim() || !!dateFrom.value || !!dateTo.value)

  function clearDates() {
    dateFrom.value = null
    dateTo.value = null
  }

  /** A date-range check on a row's Manila day; open ends pass. */
  function inRange(raw: string | null | undefined) {
    const day = manilaDayOf(raw)
    if (dateFrom.value && (!day || day < dateFrom.value)) return false
    if (dateTo.value && (!day || day > dateTo.value)) return false
    return true
  }

  /** Text, or an amount typed as "20772" / "₱20,772.00" matching any of `amounts`. */
  function matches(texts: (string | null | undefined)[], amounts: (number | null | undefined)[]) {
    const query = (search.value ?? '').trim().toLowerCase()
    if (!query) return true
    const amount = parseAmountQuery(query)
    if (amount && amounts.some((v) => amountMatches(v, amount))) return true
    return texts.some((t) => (t ?? '').toLowerCase().includes(query))
  }

  const filteredAging = computed(() => apAging.value.filter((row) =>
    inRange(row.invoice_date)
    && matches([row.reference_no, row.po_no, row.supplier_name, ...row.supplier_docs], [row.total_amount, row.balance])))

  // Balances, not documents — no date to filter by, so the search only.
  const filteredAP = computed(() => supplierAP.value.filter((row) =>
    matches([row.supplier_name], [row.outstanding, row.total_received, row.total_paid])))

  const filteredPayments = computed(() => supplierPayments.value.filter((p) =>
    inRange(p.paid_at ?? p.created_at)
    && matches([p.reference_no, dvNoOf(p), poNumbersOf(p), p.supplier_name, p.payment_method, p.remarks], [p.amount])))

  /** What the matches add up to. Voided payments are listed but not added. */
  const agingMatched = computed(() => ({
    count: filteredAging.value.length,
    total: filteredAging.value.reduce((sum, row) => sum + row.balance, 0),
  }))
  const paymentsMatched = computed(() => {
    const live = filteredPayments.value.filter((p) => p.status !== 'voided')
    return { count: filteredPayments.value.length, total: live.reduce((sum, p) => sum + (p.amount ?? 0), 0) }
  })

  /** Totals per age bucket, for the summary strip above the table. */
  const bucketTotals = computed(() => {
    const totals = Object.fromEntries(apAgeBuckets.map((b) => [b, 0])) as Record<APAgeBucket, number>
    for (const row of apAging.value) totals[row.bucket] += row.balance
    return totals
  })

  const totalOutstanding = computed(() =>
    apAging.value.reduce((sum, row) => sum + row.balance, 0),
  )

  /** Oldest unpaid bill on the books — the number worth acting on. */
  const oldestDays = computed(() =>
    apAging.value.reduce((max, row) => Math.max(max, row.days_outstanding), 0),
  )

  /** Raising a payment happens on the voucher, so send them there. */
  function goToVouchers() {
    router.push('/finance/disbursement-vouchers')
  }

  /**
   * Open a new voucher already made out to pay these invoices: the supplier,
   * their balance and the invoice numbers. Staff check it and change anything
   * before saving — it is a starting point, not a payment.
   *
   * All the invoices must be one supplier's: one cheque pays one payee.
   */
  function payInvoices(invoices: APAgingRow[]) {
    const [first] = invoices
    if (!first || invoices.some((row) => row.supplier_id !== first.supplier_id)) return
    // Oldest first, matching how payments are applied on this page.
    const ordered = [...invoices].sort((a, b) => b.days_outstanding - a.days_outstanding)
    const amount = ordered.reduce((sum, row) => sum + row.balance, 0)
    router.push({
      path: '/finance/disbursement-vouchers',
      query: {
        new: null,
        supplier: String(first.supplier_id),
        supplierName: first.supplier_name ?? '',
        amount: amount.toFixed(2),
        // Each invoice's paper trail: our receipt and PO numbers, and the
        // supplier's own DO / DR / SI numbers, for the voucher to quote.
        invoices: JSON.stringify(ordered.map((row) => ({
          si: row.reference_no ?? `#${row.transaction_id}`,
          po: row.po_no,
          docs: row.supplier_docs,
        }))),
      },
    })
  }

  /** Every open invoice of one supplier, oldest first. */
  function openInvoicesOf(supplierId: number) {
    return apAging.value.filter((row) => row.supplier_id === supplierId && row.balance > 0.005)
  }

  /** Pay a supplier's whole outstanding balance. */
  function paySupplier(supplier: SupplierAPRow) {
    payInvoices(openInvoicesOf(supplier.supplier_id))
  }

  // Ticking invoices in the aging table, to pay several on one voucher.
  const selectedInvoiceIds = ref<number[]>([])

  const selectedInvoices = computed(() =>
    apAging.value.filter((row) => selectedInvoiceIds.value.includes(row.transaction_id)))

  const selectedTotal = computed(() =>
    selectedInvoices.value.reduce((sum, row) => sum + row.balance, 0))

  /** Why the ticked invoices cannot go on one voucher, if they can't. */
  const selectionProblem = computed(() =>
    new Set(selectedInvoices.value.map((row) => row.supplier_id)).size > 1
      ? 'These are from more than one supplier — one voucher pays one supplier.'
      : '')

  function paySelected() {
    if (selectionProblem.value) return
    payInvoices(selectedInvoices.value)
  }

  function clearSelection() {
    selectedInvoiceIds.value = []
  }

  return {
    supplierAP, apAging, supplierPayments, suppliers, loading,
    bucketTotals, totalOutstanding, oldestDays,
    selectedInvoiceIds, selectedInvoices, selectedTotal, selectionProblem,
    search, dateFrom, dateTo, dateRangeError, isFiltering, clearDates,
    filteredAging, filteredAP, filteredPayments, agingMatched, paymentsMatched,
    dvNoOf, poNumbersOf, loadVoucherRefs,
    init, goToVouchers, payInvoices, paySupplier, openInvoicesOf, paySelected, clearSelection,
  }
}
