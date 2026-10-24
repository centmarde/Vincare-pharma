import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useConsignmentDataStore, consignmentExpiryWarnMonths } from '@/stores/consignmentData'
import type { ConsignmentBatch, ConsignmentBatchState } from '@/stores/consignmentData'

// The "expiring at consignees" list: batches delivered to consignment customers
// and not returned, soonest to expire first, so a pick-up can be planned before
// the goods come back as an expired return.

export const consignmentStockHeaders = [
  { title: 'CUSTOMER', key: 'customer_name', sortable: true, align: 'start' as const },
  { title: 'PRODUCT / BATCH', key: 'product_name', sortable: true, align: 'start' as const },
  { title: 'EXPIRY', key: 'expiry_date', sortable: true, align: 'center' as const },
  { title: 'OUT', key: 'out_qty', sortable: true, align: 'end' as const },
  { title: 'VALUE', key: 'out_value', sortable: true, align: 'end' as const },
  { title: 'LAST DELIVERED', key: 'last_delivered_at', sortable: true, align: 'center' as const },
] as const

export const consignmentStateLabel: Record<ConsignmentBatchState, string> = {
  expired: 'Expired',
  expiring: `Expires within ${consignmentExpiryWarnMonths} months`,
  ok: 'OK',
  no_expiry: 'No expiry on record',
}

// Explicit colours: the theme's 'success' is a shade of the brand red.
export const consignmentStateColor: Record<ConsignmentBatchState, string> = {
  expired: 'error',
  expiring: 'warning',
  ok: 'green-darken-1',
  no_expiry: 'grey',
}

export type ConsignmentStockView = 'attention' | 'all'

export function useConsignmentStock() {
  const store = useConsignmentDataStore()
  const { batches, loading, error } = storeToRefs(store)

  /** 'attention' = expired or expiring within the warning window. */
  const view = ref<ConsignmentStockView>('attention')
  const search = ref('')

  const needsAttention = (b: ConsignmentBatch) => b.state === 'expired' || b.state === 'expiring'

  const filtered = computed(() => {
    const term = search.value.trim().toLowerCase()
    return batches.value.filter((b) => {
      if (view.value === 'attention' && !needsAttention(b)) return false
      if (!term) return true
      return [b.customer_name, b.product_name, b.batch_no, b.customer_area]
        .some((v) => (v ?? '').toLowerCase().includes(term))
    })
  })

  const expiredCount = computed(() => batches.value.filter((b) => b.state === 'expired').length)
  const expiringCount = computed(() => batches.value.filter((b) => b.state === 'expiring').length)
  /** What could come back as returns: expired plus expiring, at delivered price. */
  const valueAtRisk = computed(() =>
    batches.value.filter(needsAttention).reduce((sum, b) => sum + b.out_value, 0),
  )

  async function load() {
    await store.fetchConsignmentStock()
  }

  return {
    batches, loading, error, view, search, filtered,
    expiredCount, expiringCount, valueAtRisk,
    load,
  }
}
