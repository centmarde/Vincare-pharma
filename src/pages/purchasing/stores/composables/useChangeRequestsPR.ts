import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useChangeRequestPRStore } from '../oldChangeRequestPR'

// Thin wrapper around changeRequestPR for ActionRequired.vue /
// ActionRequiredDialog.vue — mirrors the shape the finance
// useChangeRequests composable exposed (requests, loading, approve, reject)
// so the two components need minimal changes to switch over.
export function useChangeRequestsPR() {
  const store = useChangeRequestPRStore()
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