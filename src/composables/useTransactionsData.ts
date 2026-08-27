import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import type { PRItem } from '@/stores/purchaseRequisitionData'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

export function useTransactionsData() {
  const store = usePurchaseRequisitionStore()
  const { items, prs, filterStatus } = storeToRefs(store)

  // ─── Computed ────────────────────────────────────────────────────
  const companyCostTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)
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
    { title: 'Complete',         value: 'complete' },
    { title: 'Change Request',   value: 'change_request' },
  ]

  const poStatusOptions = [
    { title: 'All',      value: null },
    { title: 'Ordered',   value: 'ordered' },
    { title: 'Complete', value: 'complete' },
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

  const itemNames = (list: PRItem[]) => {
    return list?.map(item => item.item_description) ?? []
  }

  const statusConfig = (status: string) => {
    const map: Record<string, { label: string; color: string; bg: string; dot: string }> = {
      pending_approval: { label: 'Pending Approval', color: '#c2922e', bg: '#fff8ee', dot: '#c2922e' },
      approved:         { label: 'Approved',         color: '#2563eb', bg: '#f0f9f0', dot: '#2563eb' },
      rejected:         { label: 'Rejected',         color: '#c62828', bg: '#fff0f0', dot: '#ef5350' },
      ordered:           { label: 'Ordered',           color: '#7c3aed', bg: '#e3f2fd', dot: '#7c3aed' },
      received:         { label: 'Received',         color: '#2e7d32', bg: '#f0f9f0', dot: '#4caf50' },
      complete:        { label: 'Complete',        color: '#15803d', bg: '#f3e5f5', dot: '#15803d' },
      change_request:   { label: 'Change Request',  color: '#fb8c00', bg: '#fff3e0', dot: '#fb8c00' },
    }
    return map[status] ?? { label: status, color: '#757575', bg: '#f5f5f5', dot: '#9e9e9e' }
  }

  return {
    // Store passthrough (state + actions components need directly)
    ...store,

    filterStatus,

    // Computed
    companyCostTotal,
    filteredPRs,

    // Constants
    statusOptions,
    poStatusOptions,
    // Utilities
    totalQty,
    totalCost,
    itemSummary,
    itemNames,
    statusConfig,
  }
}