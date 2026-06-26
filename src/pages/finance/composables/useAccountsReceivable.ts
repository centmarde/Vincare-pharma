import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'
import type { ARAgingBucket } from '@/stores/financeData'

export const arHeaders = [
  { title: 'SOURCE',       key: 'source',        sortable: true,  align: 'center' as const },
  { title: 'REFERENCE #',  key: 'reference_no',  sortable: true,  align: 'center' as const },
  { title: 'CUSTOMER',     key: 'customer_name', sortable: false, align: 'center' as const },
  { title: 'TOTAL',        key: 'total_amount',  sortable: false, align: 'center' as const },
  { title: 'PAID',         key: 'amount_paid',   sortable: false, align: 'center' as const },
  { title: 'BALANCE',      key: 'balance',       sortable: true,  align: 'center' as const },
  { title: 'DAYS OVERDUE', key: 'days_overdue',  sortable: true,  align: 'center' as const },
  { title: 'BUCKET',       key: 'bucket',        sortable: false, align: 'center' as const },
] as const

export const AR_BUCKET_ORDER: ARAgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+', 'no-term']

export function useAccountsReceivable() {
  const store = useFinanceDataStore()
  const { arAging, loading } = storeToRefs(store)

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

  onMounted(init)

  return {
    arAging, loading,
    totalReceivable, bucketTotals, overdueReceivable,
    init,
  }
}
