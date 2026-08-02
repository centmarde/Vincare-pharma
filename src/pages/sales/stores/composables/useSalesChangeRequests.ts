import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSalesChangeRequestStore } from '../salesChangeRequest'

// Thin wrapper around salesChangeRequest — mirrors the shape the purchasing
// useChangeRequestsPR composable exposes (requests, loading, approve, reject)
// so the executive Action Required widget can aggregate every module's
// change-request queue with the same call shape.
export function useSalesChangeRequests() {
  const store = useSalesChangeRequestStore()
  const { requests, loading } = storeToRefs(store)

  async function refresh() {
    await store.fetchRequests({ status: 'pending' })
  }

  async function approve(requestId: number) {
    const result = await store.approveRequest(requestId)
    if (result.success) await refresh()
    return result
  }

  async function reject(requestId: number, reason: string = '') {
    const result = await store.rejectRequest(requestId, reason)
    if (result.success) await refresh()
    return result
  }

  onMounted(refresh)

  return {
    requests,
    loading,
    approve,
    reject,
    refresh,
  }
}
