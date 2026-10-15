import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useTermsApprovalStore } from '@/stores/termsApprovalData'

// Approver-side wrapper around the terms approval store, shaped exactly like
// useExecutiveApproveShortDated so the Action Required widget aggregates this
// queue with the others using one call shape. No Supabase here — every query
// lives in the store.
//
// What the executive is deciding: whether an order's terms may be LOCKED
// (In-House "Agree", Ethical "Invoice") — or, once locked, UNDONE before any
// delivery or payment.
export function useExecutiveApproveTerms() {
  const store = useTermsApprovalStore()
  const { pendingRequests, loading } = storeToRefs(store)

  async function refresh() {
    await store.fetchRequests({ status: 'pending' })
  }

  async function approve(requestId: number) {
    const result = await store.approve(requestId)
    if (result.success) await refresh()
    return result
  }

  async function reject(requestId: number, reason: string = '') {
    const result = await store.reject(requestId, reason)
    if (result.success) await refresh()
    return result
  }

  onMounted(refresh)

  return {
    requests: pendingRequests,
    loading,
    approve,
    reject,
    refresh,
  }
}
