import { useLogsDataStore } from '@/stores/logsData'

/**
 * Composable that creates a log entry after a Purchase Requisition is submitted.
 * The `module` field is set to the transaction type (e.g. 'purchase_requisition').
 */
export function useLogRequisition() {
  const logsStore = useLogsDataStore()

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
    let description = `Purchase requisition ${requisitionNo} submitted for approval`
    if (itemCount !== undefined) {
      description += ` with ${itemCount} item(s)`
    }

    await logsStore.createLog({
      action: 'submit_pr',
      description,
      transaction_id: transactionId,
      module,
      updated_at: new Date().toISOString(),
    })
  }

  return {
    logPRSubmission,
  }
}
