// PO actions: issuing a purchase order, and marking it as received (stock_in).
// Each guards on the prior status + number and mints a fresh doc number via
// insertWithDocRetry so a stale/duplicate click can't re-mint a number.

import { supabase } from '@/lib/supabase'
import { generateDocNumber, getLatestReferenceNo, insertWithDocRetry } from '@/utils/helpers'
import { useAuthUserStore } from '@/stores/authUser'
import { useProductsDataStore } from '@/stores/productsData'
import { useToast } from 'vue-toastification'
import type { PR } from './types'
import { loading, handleError } from './state'

const toast = useToast()

let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())

export async function issuePurchaseOrder(payload: {
  pr: PR
  ship_via: string
  ship_method: string
}) {
  loading.value = true

  // Guarded on status='approved' + .select() so a stale/duplicate click
  // (e.g. the PR got rejected in another tab between load and confirm)
  // can't re-issue a PO and re-mint a number for it — a no-op update
  // (0 rows) is reported as a failure instead of silently "succeeding."
  // PO number lands in reference_no (unique-indexed) here — unlike In-House's
  // agreeOrder, which stamps its company PO into po_no (no unique index) —
  // so a same-instant collision is possible and worth retrying on.
  const {
    data,
    docNo: poNumber,
    error: updateError,
  } = await insertWithDocRetry<{ id: number }[]>(
    () => generateDocNumber('PO', getLatestReferenceNo),
    async (docNo) =>
      supabase
        .from('transactions')
        .update({
          transaction_type: 'purchase_order',
          status: 'ordered',
          reference_no: docNo,
          requisition_no: payload.pr.reference_no,
          ship_via: payload.ship_via,
          ship_method: payload.ship_method,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.pr.id)
        .eq('status', 'approved')
        .eq('reference_no', payload.pr.reference_no)
        .select('id'),
  )

  //console.log('[issuePurchaseOrder] Supabase response:', { data, error: updateError, poNumber })

  loading.value = false

  if (updateError) {
    handleError(updateError, 'Failed to issue purchase order.')
    toast.error('Failed to issue purchase order.')
    return { success: false }
  }
  if (!data?.length) {
    toast.error('This purchase requisition is no longer approved — refresh and try again.')
    return { success: false }
  }

  // CHANGED — resolve by reorder_request_id instead of product_id
  const reorderRequestIds = await useProductsDataStore().fetchReorderRequestIdsForTransaction(
    payload.pr.id,
  )
  if (reorderRequestIds.length) {
    await useProductsDataStore().markReorderRequestsAwaitingStockById(reorderRequestIds)
  }

  toast.success('Purchase order issued successfully!')
  return { success: true }
}

export async function markPOAsReceived(po: {
  id: number
  reference_no: string | null
}): Promise<boolean> {
  loading.value = true

  // Guarded on status='issued' so a retry after a failed/partial receive
  // can't re-mint a second SI number for a PO already marked complete.
  const { data, error: updateError } = await insertWithDocRetry<{ id: number }[]>(
    () => generateDocNumber('SI', getLatestReferenceNo),
    async (docNo) =>
      supabase
        .from('transactions')
        .update({
          reference_no: docNo,
          po_no: po.reference_no,
          transaction_type: 'stock_in',
          status: 'complete',
          updated_at: new Date().toISOString(),
        })
        .eq('id', po.id)
        .eq('status', 'ordered')
        .select('id'),
  )

  loading.value = false

  if (updateError) {
    handleError(updateError, 'Failed to mark as received.')
    toast.error('Failed to mark purchase order as received.')
    return false
  }
  if (!data?.length) {
    toast.error('This purchase order was already marked received — refresh the list.')
    return false
  }

  toast.success('Purchase order marked as received.')
  return true
}