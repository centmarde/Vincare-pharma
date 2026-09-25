import type { PR } from '@/stores/purchaseRequisitionData'
import { computed } from 'vue'
import { usePurchaseBreakdown } from './usePurchaseBreakdown'

export function usePRDetailModal(props: { pr: PR }) {
  const statusConfig = (status: string | null) => {
    const s = status ?? ''
    const labels: Record<string, { label: string }> = {
      pending_approval: { label: 'Pending Approval' },
      approved: { label: 'Approved' },
      rejected: { label: 'Rejected' },
      change_request: { label: 'Change Request' },
    }
    return labels[s] ?? { label: s }
  }

  const companyCostTotal = computed(() =>
    props.pr.items.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0),
  )

  const { breakdown, hasCharges } = usePurchaseBreakdown(() => props.pr)

  const totalLabel = computed(() => {
    if (hasCharges.value) return 'Purchase Total'
    return 'Total Cost'
  })

  // Without charges the items sum is shown as before, so an older PR with a stale saved total doesn't change.
  const totalAmount = computed(() => {
    if (breakdown.value && hasCharges.value) return breakdown.value.purchaseTotal
    return companyCostTotal.value
  })

  return {
    statusConfig,
    companyCostTotal,
    breakdown,
    hasCharges,
    totalLabel,
    totalAmount,
  }
}
