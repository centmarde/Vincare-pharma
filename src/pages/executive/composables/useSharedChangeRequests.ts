import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useChangeRequestsDataStore } from '@/stores/changeRequestsData'
import { shortDatedRequestType } from '@/pages/inhouse/stores/shortDatedApproval'

// Approver-side wrapper around the SHARED changeRequestsData store, scoped to
// the in-house/ethical payment (collection) requests that store still owns —
// the finance/sales/PR requests are surfaced by their own per-module
// composables. Mirrors the shape of useFinanceChangeRequests / useSalesChangeRequests
// / useChangeRequestsPR so the executive Action Required widget can aggregate
// all four queues with one call shape. No Supabase here — every query lives in
// the store (fetchRequests carries the type scope).
const SHARED_TYPES = ['inhouse_order', 'ethical_order']

export function useSharedChangeRequests() {
  const store = useChangeRequestsDataStore()
  const { requests: allRequests, loading } = storeToRefs(store)

  // Short-dated delivery approvals are change_requests on in-house orders too,
  // so the type scope above sweeps them in. They have their own queue
  // (useExecutiveApproveShortDated), so here they were listed TWICE — and
  // approving this copy ran them as a payment correction, which fails with
  // "missing payment reference". Only payment corrections belong in this list.
  const requests = computed(() =>
    allRequests.value.filter((r) => (r.request_type as string) !== shortDatedRequestType),
  )

  async function refresh() {
    await store.fetchRequests({ status: 'pending', types: SHARED_TYPES })
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
