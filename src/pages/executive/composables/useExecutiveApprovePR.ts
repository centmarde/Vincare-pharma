import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useExecutiveApproveStore } from '../stores/executiveApproveData'

// Mirrors useChangeRequestsPR's shape so ActionRequired.vue /
// ActionRequiredDialog.vue can consume both with minimal branching.
export function useExecutiveApprovePR() {
  const store = useExecutiveApproveStore()
  const { pendingPRs: requests, loading } = storeToRefs(store)

  async function refresh() {
    await store.fetchPendingPRs()
  }
    //   I want to create a logs here that will log the approval or rejection of a PR, including the user who performed the action and any notes provided. This will help in tracking the history of actions taken on each PR for auditing purposes.
  async function approve(prId: number) {
    return store.approvePR(prId)
  }

  async function reject(prId: number, reason: string = '') {
    return store.rejectPR(prId, reason)
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