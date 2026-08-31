import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import { useProductsDataStore } from '@/stores/productsData'
import type { PR } from '@/stores/purchaseRequisitionData'

const toast = useToast()

const ACTION_APPROVE = 'pr_approved'
const ACTION_REJECT = 'pr_rejected'

export const useExecutiveApproveStore = defineStore('executiveApproveData', () => {
  const authStore = useAuthUserStore()

  const pendingPRs: Ref<PR[]> = ref([])
  const loading: Ref<boolean> = ref(false)
  const error: Ref<string> = ref('')
  const subscriptionChannel: Ref<any> = ref(null)

  const pendingCount = computed(() => pendingPRs.value.length)

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }

  // ── Activity log ──────────────────────────────────────────────────────
  // Mirrors changeRequestPR.logChangeEvent so both flows land in the same
  // `logs` table / `historyData` merge.
  async function logApprovalEvent(
    action: typeof ACTION_APPROVE | typeof ACTION_REJECT,
    pr: PR,
    userId: string,
    note?: string,
  ) {
    const ref = pr.reference_no ?? pr.requisition_no ?? `#${pr.id}`
    const head =
      action === ACTION_APPROVE
        ? `Approved Purchase Requisition ${ref}`
        : `Rejected Purchase Requisition ${ref}`
    const description = note ? `${head}: ${note}` : head

    const { error: e } = await supabase.from('logs').insert({
      created_by: userId,
      action,
      module: 'purchase_requisition',
      description,
      transaction_id: pr.id,
    })
    if (e) console.warn(`logApprovalEvent(${action}): activity log insert failed:`, e.message)
  }

  // ── Fetch ────────────────────────────────────────────────────────────
  async function fetchPendingPRs() {
    loading.value = true
    error.value = ''

    if (!authStore.users.length) await authStore.getAllUsers()

    const prStore = usePurchaseRequisitionStore()

    const { data, error: fetchError } = await supabase
      .from('transactions')
      .select(
        `
        *,
        transaction_items!transaction_items_transaction_id_fkey (
          id, product_id, qty_stock_in, actual_count_stock_in, unit_price, cost_price,
          products ( id, product_name, unit, cost_price, sku, supplier_id, expiry_date, suppliers ( name ) )
        )
      `,
      )
      .eq('transaction_type', 'purchase_requisition')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false })

    if (fetchError) {
      handleError(fetchError, 'Failed to fetch pending purchase requisitions.')
      toast.error('Failed to fetch pending purchase requisitions.')
      loading.value = false
      return
    }

    pendingPRs.value = (data || []).map((tx: any) => {
      const names = prStore.resolveUserNames(tx.created_by, tx.approved_by)
      return prStore.mapToPR(tx, prStore.mapTransactionItems(tx.transaction_items || []), names)
    })

    loading.value = false
  }

  // ── Approve ──────────────────────────────────────────────────────────
  async function approvePR(prId: number) {
    loading.value = true

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const pr = pendingPRs.value.find((p) => p.id === prId)

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'approved', approved_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', prId)
      .eq('status', 'pending_approval')

    if (updateError) {
      handleError(updateError, 'Failed to approve Purchase Requisition.')
      toast.error('Failed to approve Purchase Requisition. Please try again.')
      loading.value = false
      return { success: false }
    }

    const productsStore = useProductsDataStore()
    const reorderRequestIds = await productsStore.fetchReorderRequestIdsForTransaction(prId)
    if (reorderRequestIds.length) {
      await productsStore.approveReorderRequestsById(reorderRequestIds)  // or rejectReorderRequestsById
    }

    if (pr) await logApprovalEvent(ACTION_APPROVE, pr, user.id)

    toast.success('Purchase Requisition approved successfully.')
    await fetchPendingPRs()
    loading.value = false
    return { success: true }
  }

  // ── Reject ───────────────────────────────────────────────────────────
  async function rejectPR(prId: number, reason: string = '') {
    loading.value = true

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const pr = pendingPRs.value.find((p) => p.id === prId)

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'rejected', approved_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', prId)
      .eq('status', 'pending_approval')

    if (updateError) {
      handleError(updateError, 'Failed to reject Purchase Requisition.')
      toast.error('Failed to reject Purchase Requisition. Please try again.')
      loading.value = false
      return { success: false }
    }

    const productsStore = useProductsDataStore()
    const reorderRequestIds = await productsStore.fetchReorderRequestIdsForTransaction(prId)
    if (reorderRequestIds.length) {
      await productsStore.rejectReorderRequestsById(reorderRequestIds)  // or rejectReorderRequestsById
    }

    if (pr) await logApprovalEvent(ACTION_REJECT, pr, user.id, reason || 'Rejected by approver.')

    toast.success('Purchase Requisition rejected successfully.')
    await fetchPendingPRs()
    loading.value = false
    return { success: true }
  }

  // ── Realtime ─────────────────────────────────────────────────────────
  function subscribeToPendingPRs() {
    subscriptionChannel.value = supabase
      .channel('executive_approve_pr_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: 'transaction_type=eq.purchase_requisition',
        },
        async () => {
          await fetchPendingPRs()
        },
      )
      .subscribe()
  }

  function unsubscribeFromPendingPRs() {
    if (subscriptionChannel.value) {
      supabase.removeChannel(subscriptionChannel.value)
      subscriptionChannel.value = null
    }
  }

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')

  return {
    pendingPRs,
    loading,
    error,
    pendingCount,
    isLoading,
    hasError,
    fetchPendingPRs,
    approvePR,
    rejectPR,
    subscribeToPendingPRs,
    unsubscribeFromPendingPRs,
  }
})