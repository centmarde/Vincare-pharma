import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import type { PRItem } from '@/stores/purchaseRequisitionData'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

export function useTransactionsData() {
  const store = usePurchaseRequisitionStore()
  const { items, prs, filterStatus } = storeToRefs(store)

  // ─── Computed ────────────────────────────────────────────────────
  const customerOfferTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.offer_per_unit, 0)
  )

  const companyCostTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)
  )

  const profit = computed(() => customerOfferTotal.value - companyCostTotal.value)

  const isProfitable = computed(() => profit.value > 0)

  const offerCostRatio = computed(() =>
    companyCostTotal.value === 0
      ? '0.00'
      : (customerOfferTotal.value / companyCostTotal.value).toFixed(2)
  )

  const marginPercent = computed(() =>
    customerOfferTotal.value === 0
      ? '0'
      : Math.floor((profit.value / customerOfferTotal.value) * 100)
  )

  const filteredPRs = computed(() =>
    filterStatus.value
      ? prs.value.filter(pr => pr.status === filterStatus.value)
      : prs.value
  )

  // ─── Constants ───────────────────────────────────────────────────
  const statusOptions = [
    { title: 'All',              value: null },
    { title: 'Pending Approval', value: 'pending_approval' },
    { title: 'Approved',         value: 'approved' },
    { title: 'Rejected',         value: 'rejected' },
  ]

  // ─── Utilities ───────────────────────────────────────────────────
  const totalQty = (list: PRItem[]) =>
    list.reduce((sum, i) => sum + i.qty, 0)

  const totalCost = (list: PRItem[]) =>
    list.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)

  const itemSummary = (list: PRItem[]) => {
    if (!list?.length) return '—'
    const extra = list.length - 1
    return extra > 0
      ? `${list[0].item_description} +${extra} more`
      : list[0].item_description
  }

  const statusConfig = (status: string) => {
    const map: Record<string, { label: string; color: string; bg: string; dot: string }> = {
      pending_approval: { label: 'Pending Approval', color: '#c2922e', bg: '#fff8ee', dot: '#c2922e' },
      approved:         { label: 'Approved',         color: '#2e7d32', bg: '#f0f9f0', dot: '#4caf50' },
      rejected:         { label: 'Rejected',         color: '#c62828', bg: '#fff0f0', dot: '#ef5350' },
      issued:           { label: 'Issued',           color: '#1565c0', bg: '#e3f2fd', dot: '#1565c0' },
      received:         { label: 'Received',         color: '#2e7d32', bg: '#f0f9f0', dot: '#4caf50' },
      complete:        { label: 'Complete',        color: '#6a1b9a', bg: '#f3e5f5', dot: '#9c27b0' },
    }
    return map[status] ?? { label: status, color: '#757575', bg: '#f5f5f5', dot: '#9e9e9e' }
  }

  return {
    // Store passthrough (state + actions components need directly)
    ...store,

    // Computed
    customerOfferTotal,
    companyCostTotal,
    profit,
    isProfitable,
    offerCostRatio,
    marginPercent,
    filteredPRs,

    // Constants
    statusOptions,

    // Utilities
    totalQty,
    totalCost,
    itemSummary,
    statusConfig,
  }
}