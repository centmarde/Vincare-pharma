import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'

const toast = useToast()

const ACTION_REQUEST = 'change_requested'
const ACTION_APPROVE = 'change_approved'
const ACTION_REJECT = 'change_rejected'

export type PRProposedChange = Record<string, { from: unknown; to: unknown }>

export type PRChangeRequestType = {
  id: number
  created_at: string
  transaction_id: number // FK to transactions.id (the PR)
  request_type: 'undo_pr'
  proposed_changes: PRProposedChange
  summary: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_by: string | null
  created_by_email?: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  from_transaction_no: string | null
  to_transaction_no: string | null
}

export type ProposePRChangePayload = {
  transactionId: number
  fromTransactionNo?: string | null
  toTransactionNo?: string | null
  requestType: 'undo_pr'
  proposedChanges?: PRProposedChange
  summary?: string
  reason?: string
}

type ApplyResult = { success: boolean; resultRef?: string; error?: string }

function mapRequestRow(row: any): PRChangeRequestType {
  return {
    id: row.id,
    created_at: row.created_at,
    transaction_id: row.transaction_id,
    request_type: row.request_type,
    proposed_changes: (row.proposed_changes ?? {}) as PRProposedChange,
    summary: row.summary ?? null,
    reason: row.reason ?? null,
    status: row.status,
    created_by: row.created_by ?? null,
    resolved_by: row.resolved_by ?? null,
    resolved_at: row.resolved_at ?? null,
    resolution_note: row.resolution_note ?? null,
    from_transaction_no: row.from_transaction_no ?? null,
    to_transaction_no: row.to_transaction_no ?? null,
  }
}

const txnLabel = (no: string | null, id: number) => no ?? `#${id}`

export const useChangeRequestPRStore = defineStore('changeRequestPR', () => {
  const authStore = useAuthUserStore()

  const requests: Ref<PRChangeRequestType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const pendingCount = computed(() => requests.value.filter((r) => r.status === 'pending').length)

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }
  const clearError = () => {
    error.value = ''
  }

  // ── Fetching ───────────────────────────────────────────────────────────
  // Joined against transactions to stay scoped to PRs only, even though
  // 'undo_pr' is the only request_type this store issues.
  const fetchRequests = async (
    options: { status?: 'pending' | 'approved' | 'rejected' } = {},
  ) => {
    loading.value = true
    clearError()
    try {
      let q = supabase
        .from('change_requests')
        .select('*, transactions!inner(transaction_type)')
        .eq('transactions.transaction_type', 'purchase_requisition')
        .order('created_at', { ascending: false })
      if (options.status) q = q.eq('status', options.status)

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      if (!authStore.users.length) await authStore.getAllUsers()
      requests.value = (data || []).map((row) => ({
        ...mapRequestRow(row),
        created_by_email: authStore.users.find((u: any) => u.id === row.created_by)?.email ?? null,
      }))
      return requests.value
    } catch (err) {
      handleError(err, 'Failed to fetch purchase requisition change requests')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchRequestById = async (id: number): Promise<PRChangeRequestType | null> => {
    const { data, error: e } = await supabase
      .from('change_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (e || !data) return null
    return mapRequestRow(data)
  }

  const hasPendingRequest = async (transactionId: number): Promise<boolean> => {
    const { data } = await supabase
      .from('change_requests')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('status', 'pending')
      .maybeSingle()
    return !!data
  }

  // Drives a "Change pending" chip on the PR list.
  const fetchPendingTargetIds = async (): Promise<number[]> => {
    const { data, error: e } = await supabase
      .from('change_requests')
      .select('transaction_id, transactions!inner(transaction_type)')
      .eq('status', 'pending')
      .eq('transactions.transaction_type', 'purchase_requisition')
    if (e) {
      handleError(e, 'Failed to fetch pending change requests')
      return []
    }
    return (data || []).map((r: any) => r.transaction_id as number)
  }

  // ── Activity log ──────────────────────────────────────────────────────
  async function logChangeEvent(
    action: typeof ACTION_REQUEST | typeof ACTION_APPROVE | typeof ACTION_REJECT,
    req: PRChangeRequestType,
    userId: string,
    note?: string,
  ) {
    const head =
      action === ACTION_REQUEST
        ? `Change request #${req.id} — Undo_PR ${txnLabel(req.from_transaction_no, req.transaction_id)}`
        : `${action === ACTION_APPROVE ? 'Approved' : 'Rejected'} change request #${req.id} — Undo_PR ${txnLabel(req.from_transaction_no, req.transaction_id)}`
    const tail = note ?? req.summary ?? req.reason ?? null

    const { error: e } = await supabase.from('logs').insert({
      created_by: userId,
      action,
      module: 'purchase_requisition',
      description: tail ? `${head}: ${tail}` : head,
      transaction_id: req.transaction_id,
    })
    if (e) console.warn(`logChangeEvent(${action}): activity log insert failed:`, e.message)
  }

  // ── Propose ────────────────────────────────────────────────────────────
  const proposeChange = async (payload: ProposePRChangePayload) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    if (await hasPendingRequest(payload.transactionId)) {
      toast.warning('There is already a pending change request for this purchase requisition.')
      loading.value = false
      return { success: false }
    }

    // Gate the PR so it can't be re-approved/re-edited while this request
    // is pending.
    const { data: txnCheck } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('id', payload.transactionId)
      .maybeSingle()

    if (txnCheck && txnCheck.status !== 'change_request') {
      await supabase
        .from('transactions')
        .update({ status: 'change_request', updated_at: new Date().toISOString() })
        .eq('id', payload.transactionId)
        .neq('status', 'change_request')
    }

    const { data, error: insertError } = await supabase
      .from('change_requests')
      .insert({
        transaction_id: payload.transactionId,
        from_transaction_no: payload.fromTransactionNo ?? null,
        to_transaction_no: payload.toTransactionNo ?? null,
        request_type: payload.requestType,
        summary: payload.summary ?? null,
        reason: payload.reason ?? null,
        status: 'pending',
        created_by: user.id,
      })
      .select('*')
      .single()

    if (insertError || !data) {
      const duplicate = (insertError as any)?.code === '23505'
      handleError(insertError, 'Failed to submit change request.')
      if (duplicate) toast.warning('There is already a pending change request for this PR.')
      else toast.error(insertError?.message || 'Failed to submit change request.')
      loading.value = false
      return { success: false }
    }

    await logChangeEvent(ACTION_REQUEST, mapRequestRow(data), user.id)

    toast.success('Change request submitted for approval.')
    loading.value = false
    return { success: true, requestId: data.id }
  }

  // ── Reject ─────────────────────────────────────────────────────────────
  const rejectRequest = async (requestId: number, reason: string) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const request = await fetchRequestById(requestId)
    if (!request || request.status !== 'pending') {
      toast.error('Pending change request not found.')
      loading.value = false
      return { success: false }
    }

    const note = reason || 'Rejected by approver.'
    const ok = await resolveRequest(requestId, user.id, ACTION_REJECT, {
      note,
      toTransactionNo: null,
    })
    if (!ok) {
      loading.value = false
      return { success: false }
    }

    // An 'undo_pr' request only ever gates an 'approved' PR, so a rejection
    // reverts it back to 'approved' rather than stranding it on
    // 'change_request'.
    const { error: revertErr } = await supabase
      .from('transactions')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', request.transaction_id)
      .eq('status', 'change_request')
    if (revertErr)
      console.warn('rejectRequest: failed to restore PR status:', revertErr.message)

    await logChangeEvent(ACTION_REJECT, request, user.id, note)
    toast.success('Change request rejected.')
    await fetchRequests({ status: 'pending' })
    loading.value = false
    return { success: true }
  }

  // ── Approve ────────────────────────────────────────────────────────────
  const approveRequest = async (requestId: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const request = await fetchRequestById(requestId)
    if (!request || request.status !== 'pending') {
      toast.error('Pending change request not found.')
      loading.value = false
      return { success: false }
    }

    const applied = await applyUndoPRChange(request)
    if (!applied.success) {
      toast.error(applied.error || 'Failed to apply the change; request left pending.')
      loading.value = false
      return { success: false }
    }

    const wrote = await resolveRequest(requestId, user.id, ACTION_APPROVE, {
      note: 'Applied.',
      toTransactionNo: applied.resultRef ?? null,
    })
    if (!wrote) {
      toast.warning(
        'Change applied, but recording the approval failed — the request may still show as pending.',
      )
    } else {
      toast.success('Change request approved and applied.')
    }
    await logChangeEvent(ACTION_APPROVE, request, user.id, applied.resultRef ?? 'Applied.')
    await fetchRequests({ status: 'pending' })
    loading.value = false
    return { success: true }
  }

  async function resolveRequest(
    requestId: number,
    userId: string,
    action: typeof ACTION_APPROVE | typeof ACTION_REJECT,
    extra: { note: string | null; toTransactionNo: string | null },
  ): Promise<boolean> {
    const { data, error: e } = await supabase
      .from('change_requests')
      .update({
        status: action === ACTION_APPROVE ? 'approved' : 'rejected',
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        resolution_note: extra.note,
        to_transaction_no: extra.toTransactionNo,
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select('id')
    if (e) {
      handleError(e, 'Failed to record the approval decision.')
      toast.error(e.message || 'Failed to record the approval decision.')
      return false
    }
    if (!data?.length) {
      handleError(null, 'This change request was already resolved.')
      return false
    }
    return true
  }

  // ── 'undo_pr' apply logic ────────────────────────────────────────────
  async function applyUndoPRChange(request: PRChangeRequestType): Promise<ApplyResult> {
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('id, reference_no, recent_transaction_no, status')
      .eq('id', request.transaction_id)
      .maybeSingle()

    if (txErr || !tx) return { success: false, error: 'Transaction not found.' }

    const currentRefNo = tx.reference_no
    const fromRefNo = tx.recent_transaction_no ?? request.from_transaction_no ?? currentRefNo

    const { data: updated, error: updateErr } = await supabase
      .from('transactions')
      .update({
        status: 'pending_approval',
        approved_by: null,
        updated_at: new Date().toISOString(),
        reference_no: fromRefNo,
        recent_transaction_no: fromRefNo,
      })
      .eq('id', request.transaction_id)
      .eq('status', tx.status)
      .neq('status', 'pending_approval')
      .select('id, reference_no')

    if (updateErr) return { success: false, error: updateErr.message }
    if (!updated?.length)
      return {
        success: false,
        error: 'This purchase requisition was already reverted to pending approval.',
      }

    const { error: crUpdateErr } = await supabase
      .from('change_requests')
      .update({ to_transaction_no: currentRefNo })
      .eq('id', request.id)
    if (crUpdateErr)
      console.warn(
        'applyUndoPRChange: failed to update change_request to_transaction_no:',
        crUpdateErr.message,
      )

    return { success: true, resultRef: currentRefNo ?? undefined }
  }

  // ── Unapprove PR (called from composable) ─────────────────────────────
  const handleUnapprove = async (pr: { id: number; requisition_no: string; recent_transaction_no?: string | null; reference_no?: string | null }, reason?: string) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }
    const { error: updateErr } = await supabase
      .from('transactions')
      .update({ status: 'change_request', updated_at: new Date().toISOString() })
      .eq('id', pr.id)
      .neq('status', 'change_request')

    if (updateErr) {
      handleError(updateErr, 'Failed to update transaction status.')
      loading.value = false
      return { success: false }
    }

    const result = await proposeChange({
      transactionId: pr.id,
      fromTransactionNo: pr.recent_transaction_no ?? pr.reference_no,
      toTransactionNo: pr.reference_no,
      requestType: 'undo_pr',
      summary: `Unapprove purchase requisition ${pr.requisition_no}`,
      reason: reason ?? `Unapprove request for PR ${pr.requisition_no}`,
    })

    if (result.success) {
      await logChangeEvent(ACTION_REQUEST, {
        id: result.requestId!,
        transaction_id: pr.id,
        from_transaction_no: pr.recent_transaction_no ?? pr.reference_no ?? null,
        to_transaction_no: pr.reference_no ?? null,
        summary: `Unapprove purchase requisition ${pr.requisition_no}`,
        reason: reason ?? `Unapprove request for PR ${pr.requisition_no}`,
      } as PRChangeRequestType, user.id)
    }

    loading.value = false
    return result
  }

  const resetStore = () => {
    requests.value = []
    loading.value = false
    error.value = ''
  }

  return {
    requests,
    loading,
    error,
    pendingCount,
    fetchRequests,
    fetchRequestById,
    hasPendingRequest,
    fetchPendingTargetIds,
    proposeChange,
    approveRequest,
    rejectRequest,
    handleUnapprove,
    clearError,
    resetStore,
  }
})