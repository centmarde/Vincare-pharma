import { useLogsDataStore } from '@/stores/logsData'
import { useAuthUserStore } from '@/stores/authUser'

/**
 * Composable that creates a log entry after a Purchase Requisition is submitted.
 * The `module` field is set to the transaction type (e.g. 'purchase_requisition').
 * Fetches the current user here and passes user_id directly to avoid auth
 * conflicts inside the logs store.
 */
export function useLogRequisition() {
  const logsStore = useLogsDataStore()
  const authStore = useAuthUserStore()

  /**
   * Log a purchase requisition submission.
   *
   * @param transactionId - The id of the created transaction row
   * @param requisitionNo - The generated PR number (e.g. PR-2026-001)
   * @param module        - The transaction type, used as the `module` field in logs
   * @param itemCount     - Number of items on the PR (optional)
   */
  async function logPRSubmission(
    transactionId: number,
    requisitionNo: string,
    module: string = 'purchase_requisition',
    itemCount?: number,
  ) {
    // Resolve the current user here
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      console.warn('useLogRequisition: No authenticated user, skipping log creation')
      return
    }

    const userEmail = authStore.users.length
      ? authStore.users.find((u: any) => u.id === user.id)?.email ?? user.email ?? user.id
      : user.email ?? user.id

    let description = `Purchase requisition ${requisitionNo} submitted for approval`
    if (itemCount !== undefined) {
      description += ` with ${itemCount} item(s)`
    }

    await logsStore.createLog({
      created_by: user.id,
      action: 'submit_pr',
      description,
      transaction_id: transactionId,
      module,
    })
  }

  return {
    logPRSubmission,
  }
}
