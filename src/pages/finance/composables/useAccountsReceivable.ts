import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'
import type { ARAgingTerm, ARAgingRow, ARReceivableDetail, StatementOfAccount } from '@/stores/financeData'

export const arHeaders = [
  { title: 'SOURCE',       key: 'source',        sortable: true,  align: 'center' as const },
  { title: 'REFERENCE #',  key: 'reference_no',  sortable: true,  align: 'center' as const },
  { title: 'TOTAL',        key: 'total_amount',  sortable: false, align: 'center' as const },
  { title: 'PAID',         key: 'amount_paid',   sortable: false, align: 'center' as const },
  { title: 'BALANCE',      key: 'balance',       sortable: true,  align: 'center' as const },
  { title: 'DAYS OVERDUE', key: 'days_overdue',  sortable: true,  align: 'center' as const },
  { title: 'TERM',         key: 'term',          sortable: false, align: 'center' as const },
] as const

export const AR_TERM_ORDER: ARAgingTerm[] = ['current', '1-30', '31-60', '61-90', '90+', 'no-term']

// Worst-first precedence for picking a single "headline" term per customer jacket.
const TERM_SEVERITY: Record<ARAgingTerm, number> = {
  '90+': 5, '61-90': 4, '31-60': 3, '1-30': 2, current: 1, 'no-term': 0,
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

  // Statement of Account: the whole customer's order + payment history, not
  // just one document — see fetchStatementOfAccount for why this is a
  // separate fetch from openDetail above.
  const soaOpen = ref(false)
  const soaLoading = ref(false)
  const soaData = ref<StatementOfAccount | null>(null)

  async function openSOA(customerId: number) {
    soaOpen.value = true
    soaLoading.value = true
    soaData.value = null
    soaData.value = await store.fetchStatementOfAccount(customerId)
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
    soaOpen, soaLoading, soaData, openSOA, closeSOA,
    init,
  }
}
