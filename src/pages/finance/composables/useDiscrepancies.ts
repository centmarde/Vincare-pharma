import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'

export const remittanceHeaders = [
  { title: 'REFERENCE #', key: 'reference_no',     sortable: true,  align: 'center' as const },
  { title: 'OUTLET',      key: 'outlet',            sortable: true,  align: 'center' as const },
  { title: 'DATE',        key: 'created_at',        sortable: true,  align: 'center' as const },
  { title: 'EXPECTED',    key: 'expected_amount',   sortable: false, align: 'center' as const },
  { title: 'ACTUAL',      key: 'actual_amount',     sortable: false, align: 'center' as const },
  { title: 'DISCREPANCY', key: 'discrepancy',       sortable: true,  align: 'center' as const },
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
  const { remittanceDiscrepancies, arAging, commissionLiability, stockReconciliation, loading } = storeToRefs(store)

  const tab = ref('remittance')
  const stockReconLoaded = ref(false)

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

  function onTabChange(value: string) {
    tab.value = value
    if (value === 'stock') loadStockReconciliation()
  }

  onMounted(init)

  return {
    tab, onTabChange,
    remittanceDiscrepancies, arAging, commissionLiability, stockReconciliation, loading,
  }
}
