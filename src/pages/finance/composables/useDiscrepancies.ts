import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'
import type { RemittanceDiscrepancyRow } from '@/stores/financeData'
import { useRemittancesDataStore } from '@/stores/remittancesData'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { formatCurrency } from '@/utils/helpers'

const { confirmDialog } = useConfirmDialog()

export const remittanceHeaders = [
  { title: 'REFERENCE #', key: 'reference_no',     sortable: true,  align: 'center' as const },
  { title: 'OUTLET',      key: 'outlet',            sortable: true,  align: 'center' as const },
  { title: 'DATE',        key: 'created_at',        sortable: true,  align: 'center' as const },
  { title: 'EXPECTED',    key: 'expected_amount',   sortable: false, align: 'center' as const },
  { title: 'ACTUAL',      key: 'actual_amount',     sortable: false, align: 'center' as const },
  { title: 'DISCREPANCY', key: 'discrepancy',       sortable: true,  align: 'center' as const },
  { title: 'RESOLUTION',  key: 'resolution',        sortable: false, align: 'center' as const },
  { title: 'NOTES',       key: 'notes',             sortable: false, align: 'center' as const },
] as const

export const employeeReceivableHeaders = [
  { title: 'DATE',     key: 'created_at',      sortable: true,  align: 'center' as const },
  { title: 'EMPLOYEE', key: 'employee_email',  sortable: true,  align: 'center' as const },
  { title: 'AMOUNT',   key: 'amount',          sortable: true,  align: 'center' as const },
  { title: 'REASON',   key: 'remarks',         sortable: false, align: 'center' as const },
  { title: 'STATUS',   key: 'status',          sortable: false, align: 'center' as const },
  { title: '',         key: 'actions',         sortable: false, align: 'center' as const },
] as const

export const arAgingHeaders = [
  { title: 'SOURCE',      key: 'source',         sortable: true,  align: 'center' as const },
  { title: 'REFERENCE #', key: 'reference_no',   sortable: true,  align: 'center' as const },
  { title: 'CUSTOMER',    key: 'customer_name',  sortable: false, align: 'center' as const },
  { title: 'BALANCE',     key: 'balance',        sortable: true,  align: 'center' as const },
  { title: 'DAYS OVERDUE',key: 'days_overdue',   sortable: true,  align: 'center' as const },
  { title: 'BUCKET',      key: 'bucket',         sortable: false, align: 'center' as const },
] as const

export const commissionHeaders = [
  { title: 'AGENT',             key: 'agent_name',           sortable: true,  align: 'center' as const },
  { title: 'UNPAID COMMISSION', key: 'unpaid_commission',    sortable: true,  align: 'center' as const },
  { title: 'OLDEST UNPAID',     key: 'oldest_unpaid_days',   sortable: true,  align: 'center' as const },
  { title: 'PAID, NO TIMESTAMP',key: 'paid_missing_timestamp', sortable: false, align: 'center' as const },
  { title: 'FLAGGED',           key: 'flagged',              sortable: false, align: 'center' as const },
] as const

export const stockReconHeaders = [
  { title: 'PRODUCT',  key: 'product_name', sortable: true,  align: 'center' as const },
  { title: 'LOCATION', key: 'location',     sortable: true,  align: 'center' as const },
  { title: 'ON HAND',  key: 'on_hand',       sortable: false, align: 'center' as const },
  { title: 'EXPECTED', key: 'expected',      sortable: false, align: 'center' as const },
  { title: 'DRIFT',    key: 'drift',         sortable: true,  align: 'center' as const },
] as const

export function useDiscrepancies() {
  const store = useFinanceDataStore()
  const remittancesStore = useRemittancesDataStore()
  const { remittanceDiscrepancies, arAging, commissionLiability, stockReconciliation, loading } = storeToRefs(store)
  const { employeeReceivables: receivables, loading: receivablesLoading } = storeToRefs(remittancesStore)

  const tab = ref('remittance')
  const stockReconLoaded = ref(false)
  const receivablesLoaded = ref(false)

  // The Remittance Float tab is framed as an action list ("all balanced" is
  // its empty state) — a fully-settled discrepancy (paid on spot, or an
  // employee receivable that's since been paid) shouldn't linger in it
  // forever. Hidden by default; the switch reveals full history.
  const showResolvedRemittances = ref(false)
  function isRemittanceResolved(r: RemittanceDiscrepancyRow) {
    return r.resolution === 'paid_on_spot' || (r.resolution === 'employee_receivable' && r.receivable_status === 'paid')
  }
  const visibleRemittanceDiscrepancies = computed(() =>
    showResolvedRemittances.value
      ? remittanceDiscrepancies.value
      : remittanceDiscrepancies.value.filter((r) => !isRemittanceResolved(r)))

  async function init() {
    await Promise.all([
      store.fetchRemittanceDiscrepancies(),
      store.fetchARAging(),
      store.fetchCommissionLiability(),
    ])
  }

  async function loadStockReconciliation() {
    if (stockReconLoaded.value) return
    await store.fetchStockReconciliation()
    stockReconLoaded.value = true
  }

  async function loadReceivables() {
    if (receivablesLoaded.value) return
    await remittancesStore.fetchEmployeeReceivables()
    receivablesLoaded.value = true
  }

  function onTabChange(value: string) {
    tab.value = value
    if (value === 'stock') loadStockReconciliation()
    if (value === 'employeeReceivables') loadReceivables()
  }

  async function markReceivablePaid(id: number) {
    const row = receivables.value.find((r) => r.id === id)
    if (!row) return
    const ok = await confirmDialog(
      `Employee: ${row.employee_email ?? '—'}\nAmount: ${formatCurrency(row.amount)}\nReason: ${row.remarks ?? '—'}`,
      { title: 'Confirm Receivable Paid', confirmText: 'Mark Paid' },
    )
    if (!ok) return
    await remittancesStore.markReceivablePaid(id)
  }

  onMounted(init)

  return {
    tab, onTabChange,
    remittanceDiscrepancies: visibleRemittanceDiscrepancies, showResolvedRemittances,
    arAging, commissionLiability, stockReconciliation, loading,
    receivables, receivablesLoading, markReceivablePaid,
  }
}
