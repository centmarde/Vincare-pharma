import type { PR } from '@/stores/purchaseRequisitionData'
import { computed } from 'vue'

export function usePRDetailModal(props: { pr: PR }) {
  const statusConfig = (status: string | null) => {
    const s = status ?? ''
    const labels: Record<string, { label: string }> = {
      pending_approval: { label: 'Pending Approval' },
      approved: { label: 'Approved' },
      rejected: { label: 'Rejected' },
    }
    return labels[s] ?? { label: s }
  }

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