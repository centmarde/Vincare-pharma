import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'
import type { ARAgingBucket, ARAgingRow, ARReceivableDetail } from '@/stores/financeData'

export const arHeaders = [
  { title: 'SOURCE',       key: 'source',        sortable: true,  align: 'center' as const },
  { title: 'REFERENCE #',  key: 'reference_no',  sortable: true,  align: 'center' as const },
  { title: 'TOTAL',        key: 'total_amount',  sortable: false, align: 'center' as const },
  { title: 'PAID',         key: 'amount_paid',   sortable: false, align: 'center' as const },
  { title: 'BALANCE',      key: 'balance',       sortable: true,  align: 'center' as const },
  { title: 'DAYS OVERDUE', key: 'days_overdue',  sortable: true,  align: 'center' as const },
  { title: 'BUCKET',       key: 'bucket',        sortable: false, align: 'center' as const },
] as const

export const AR_BUCKET_ORDER: ARAgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+', 'no-term']

// Worst-first precedence for picking a single "headline" bucket per customer jacket.
const BUCKET_SEVERITY: Record<ARAgingBucket, number> = {
  '90+': 5, '61-90': 4, '31-60': 3, '1-30': 2, current: 1, 'no-term': 0,
}

export type ARCustomerJacket = {
  key: string
  customerId: number | null
  customerName: string
  docCount: number
  totalBalance: number
  worstBucket: ARAgingBucket
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

  async function init() {
    await store.fetchARAging()
  }

  const totalReceivable = computed(() => arAging.value.reduce((sum, r) => sum + r.balance, 0))

  const bucketTotals = computed(() => {
    const totals = new Map<ARAgingBucket, number>(AR_BUCKET_ORDER.map((b) => [b, 0]))
    for (const row of arAging.value) {
      totals.set(row.bucket, (totals.get(row.bucket) ?? 0) + row.balance)
    }
    return AR_BUCKET_ORDER.map((bucket) => ({ bucket, total: totals.get(bucket) ?? 0 }))
  })

  const overdueReceivable = computed(() =>
    arAging.value
      .filter((r) => r.bucket !== 'current' && r.bucket !== 'no-term')
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
          worstBucket: 'no-term',
          rows: [],
        }
        groups.set(key, jacket)
      }
      jacket.docCount += 1
      jacket.totalBalance += row.balance
      if (BUCKET_SEVERITY[row.bucket] > BUCKET_SEVERITY[jacket.worstBucket]) jacket.worstBucket = row.bucket
      jacket.rows.push(row)
    }
    return [...groups.values()].sort((a, b) => b.totalBalance - a.totalBalance)
  })

  onMounted(init)

  return {
    arAging, loading,
    totalReceivable, bucketTotals, overdueReceivable, customerJackets,
    detailOpen, detailLoading, selectedDetail, openDetail, closeDetail,
    init,
  }
}
