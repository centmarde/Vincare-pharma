import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useCreditMemosStore } from '@/stores/creditMemosData'

// Approver-side wrapper around the credit memo store, shaped like the other
// useExecutiveApprove* composables so Action Required aggregates this queue
// with one call shape. No Supabase here — every query lives in the store.
//
// What the executive is deciding: whether to take an amount off a customer's
// bill (returned goods, or an allowance). Approving numbers the credit memo
// and applies it; rejecting leaves the bill untouched.
export function useExecutiveApproveCreditMemos() {
  const store = useCreditMemosStore()
  const { pendingMemos, loading } = storeToRefs(store)

  async function refresh() {
    await store.fetchCreditMemos({ status: 'pending_approval' })
  }

  async function approve(id: number) {
    const result = await store.approveCreditMemo(id)
    if (result.success) await refresh()
    return result
  }

  async function reject(id: number, reason: string = '') {
    const result = await store.rejectCreditMemo(id, reason)
    if (result.success) await refresh()
    return result
  }

  onMounted(refresh)

  return { requests: pendingMemos, loading, approve, reject, refresh }
}
