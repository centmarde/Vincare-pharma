import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useDisposalsDataStore } from '@/stores/disposalsData'

// Approver-side wrapper around the disposals store, shaped exactly like
// useSharedChangeRequests / useExecutiveApprovePR so the Action Required widget
// can aggregate this queue with the others using one call shape. No Supabase
// here — every query lives in the store.
export function useExecutiveApproveDisposal() {
  const store = useDisposalsDataStore()
  const { pendingDisposals, loading } = storeToRefs(store)

  async function refresh() {
    await store.fetchDisposalRequests()
  }

  async function approve(disposalId: number) {
    const result = await store.approveDisposal(disposalId)
    if (result.success) await refresh()
    return result
  }

  async function reject(disposalId: number, reason: string = '') {
    const result = await store.rejectDisposal(disposalId, reason)
    if (result.success) await refresh()
    return result
  }

  onMounted(refresh)

  return {
    requests: pendingDisposals,
    loading,
    approve,
    reject,
    refresh,
  }
}
