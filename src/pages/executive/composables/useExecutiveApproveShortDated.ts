import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useShortDatedApprovalStore } from '@/pages/inhouse/stores/shortDatedApproval'

// Approver-side wrapper around the short-dated approval store, shaped exactly
// like useExecutiveApproveDisposal / useSharedChangeRequests so the Action
// Required widget aggregates this queue with the others using one call shape.
// No Supabase here — every query lives in the store.
//
// What the executive is deciding: a government order carries stock with under
// 18 months of shelf life. The contract says the client will not accept it, so
// delivery is blocked until someone senior chooses to ship it anyway.
export function useExecutiveApproveShortDated() {
  const store = useShortDatedApprovalStore()
  const { pendingRequests, loading } = storeToRefs(store)

  async function refresh() {
    await store.fetchRequests({ status: 'pending' })
  }

  async function approve(requestId: number, note: string = '') {
    const result = await store.resolve(requestId, 'approved', note || null)
    if (result.success) await refresh()
    return result
  }

  async function reject(requestId: number, reason: string = '') {
    const result = await store.resolve(requestId, 'rejected', reason || null)
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
