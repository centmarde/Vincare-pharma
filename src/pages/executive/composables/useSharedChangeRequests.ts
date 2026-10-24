import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useChangeRequestsDataStore } from '@/stores/changeRequestsData'
import { shortDatedRequestType } from '@/pages/inhouse/stores/shortDatedApproval'
import { termsRequestTypes } from '@/stores/shared/termsApprovalGuards'
import { collectionIdKey } from '@/stores/changeRequests/types'

// Approver-side wrapper around the SHARED changeRequestsData store, scoped to
// the in-house/ethical payment (collection) requests that store still owns —
// the finance/sales/PR requests are surfaced by their own per-module
// composables. Mirrors the shape of useFinanceChangeRequests / useSalesChangeRequests
// / useChangeRequestsPR so the executive Action Required widget can aggregate
// all four queues with one call shape. No Supabase here — every query lives in
// the store (fetchRequests carries the type scope).
// 'sale' for payments on sales charged to account — only those: a request to
// void the sale itself belongs to the Sales queue (useSalesChangeRequests).
const SHARED_TYPES = ['inhouse_order', 'ethical_order', 'sale']

export function useSharedChangeRequests() {
  const store = useChangeRequestsDataStore()
  const { requests: allRequests, loading } = storeToRefs(store)

  // Short-dated delivery approvals are change_requests on in-house orders too,
  // so the type scope above sweeps them in. They have their own queue
  // (useExecutiveApproveShortDated), so here they were listed TWICE — and
  // approving this copy ran them as a payment correction, which fails with
  // "missing payment reference". Only payment corrections belong in this list.
  // The same goes for the lock / unlock terms requests (useExecutiveApproveTerms).
  const ownQueues = [shortDatedRequestType, ...termsRequestTypes]
  const requests = computed(() =>
    allRequests.value.filter((r) =>
      !ownQueues.includes(r.request_type as string)
      && (r.transaction_type !== 'sale' || collectionIdKey in (r.proposed_changes ?? {}))),
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
