import { computed } from 'vue'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisition'
import type { PR } from '@/stores/purchaseRequisition'

// Re-export for convenience so the component doesn't need to import separately
export { formatCurrency, formatDate } from '@/utils/helpers'

export function usePRDetailModal(props: { pr: PR }) {
  const store = usePurchaseRequisitionStore()
  const { statusConfig } = store

  const customerOfferTotal = computed(() =>
    props.pr.items.reduce((sum, i) => sum + i.qty * i.offer_per_unit, 0),
  )

  const companyCostTotal = computed(() =>
    props.pr.items.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0),
  )

  const profit = computed(() => customerOfferTotal.value - companyCostTotal.value)

  const isProfitable = computed(() => profit.value > 0)

  const offerCostRatio = computed(() => {
    if (companyCostTotal.value === 0) return '0.00'
    return (customerOfferTotal.value / companyCostTotal.value).toFixed(2)
  })

  const marginPercent = computed(() => {
    if (customerOfferTotal.value === 0) return '0'
    return Math.floor((profit.value / customerOfferTotal.value) * 100)
  })

  return {
    statusConfig,
    customerOfferTotal,
    companyCostTotal,
    profit,
    isProfitable,
    offerCostRatio,
    marginPercent,
  }
}