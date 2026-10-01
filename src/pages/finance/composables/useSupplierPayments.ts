import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore, apAgeBuckets } from '@/stores/financeData'
import type { APAgeBucket } from '@/stores/financeData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { useRouter } from 'vue-router'

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
] as const

export const agingHeaders = [
  { title: 'INVOICE #', key: 'reference_no',     sortable: true,  align: 'center' as const },
  { title: 'SUPPLIER',  key: 'supplier_name',    sortable: true,  align: 'center' as const },
  { title: 'DATE',      key: 'invoice_date',     sortable: true,  align: 'center' as const },
  { title: 'AMOUNT',    key: 'total_amount',     sortable: false, align: 'center' as const },
  { title: 'PAID',      key: 'paid',             sortable: false, align: 'center' as const },
  { title: 'BALANCE',   key: 'balance',          sortable: true,  align: 'center' as const },
  { title: 'AGE',       key: 'days_outstanding', sortable: true,  align: 'center' as const },
] as const

export const paymentHistoryHeaders = [
  { title: 'REFERENCE #', key: 'reference_no',    sortable: true,  align: 'center' as const },
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

  async function init() {
    await Promise.all([
      financeStore.fetchSupplierAP(),
      financeStore.fetchAPAging(),
      financeStore.fetchSupplierPayments(),
      suppliersStore.fetchSuppliers(),
    ])
  }

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

  return {
    supplierAP, apAging, supplierPayments, suppliers, loading,
    bucketTotals, totalOutstanding, oldestDays,
    init, goToVouchers,
  }
}
