import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { getErrorMessage } from '@/utils/helpers'
import { applyExpenseChange, applySupplierPaymentChange } from '@/stores/changeRequests/finance'
import type { AppliedEdit } from '@/stores/changeRequestsData'
import type { ProposedChange } from '@/utils/changeRequests'
import { parseProposedChanges, serializeProposedChanges } from '@/utils/changeRequests'

// Approval-gated change requests for the FINANCE module (expense + supplier
// payment only — journal entries are a `journal_entries` row, not a
// `transactions` row, so they can't be scoped/dispatched the same way and
// stay on GeneralJournal's existing direct-reversal flow).
//
// Mirrors the purchasing reference (`src/pages/purchasing/stores/oldChangeRequestPR.ts`)
// structurally: same fetch/propose/approve/reject shape, scoped to this
// module's transaction types via `transactions!inner(transaction_type)`. The
// apply logic (void/edit rules per document type) is NOT copied here — it is
// imported from `src/stores/changeRequests/finance.ts`, the one copy.

const toast = useToast()

const ACTION_REQUEST = 'change_requested'
const ACTION_APPROVE = 'change_approved'
const ACTION_REJECT = 'change_rejected'

const MODULE_TYPES = ['expense', 'supplier_payment']

// Reserved proposed_changes key: the transaction's status right before the
// 'change_request' gate was set, stashed at propose time so a REJECT can
// restore it instead of stranding the document on 'change_request' (the same
// bug the lead fixed for the PR undo flow).
const PREV_STATUS_KEY = '__prev_status'


export type FinanceChangeRequestType = {
  id: number
  created_at: string
  transaction_id: number
  request_type: 'edit' | 'void'
  proposed_changes: ProposedChange
  summary: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_by: string | null
  created_by_email?: string | null
  resolved_by_email?: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  from_transaction_no: string | null
  to_transaction_no: string | null
}

export type ProposeFinanceChangePayload = {
  transactionId: number
  fromTransactionNo?: string | null
  toTransactionNo?: string | null
  requestType: 'edit' | 'void'
  proposedChanges?: ProposedChange
  summary?: string
  reason?: string
}

type ApplyResult = { success: boolean; resultId?: number; resultRef?: string; error?: string }

function mapRequestRow(row: any): FinanceChangeRequestType {
  return {
    id: row.id,
    created_at: row.created_at,
    transaction_id: row.transaction_id,
    request_type: row.request_type,
    proposed_changes: parseProposedChanges(row.proposed_changes),
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

export const useFinanceChangeRequestStore = defineStore('financeChangeRequest', () => {
  const authStore = useAuthUserStore()

  const requests: Ref<FinanceChangeRequestType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const pendingCount = computed(() => requests.value.filter((r) => r.status === 'pending').length)

  function handleError(err: unknown, defaultMessage: string) {
    error.value = getErrorMessage(err) || defaultMessage
  }
  function clearError() {
    error.value = ''
  }

  // ── Fetching ─────────────────────────────────────────────────────────────
  // Joined against transactions to stay scoped to finance document types only.
  async function fetchRequests(options: { status?: 'pending' | 'approved' | 'rejected' } = {}) {
    loading.value = true
    clearError()
    try {
      let q = supabase
        .from('change_requests')
        .select('*, transactions!inner(transaction_type)')
        .in('transactions.transaction_type', MODULE_TYPES)
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
      handleError(err, 'Failed to fetch finance change requests')
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchRequestById(id: number): Promise<FinanceChangeRequestType | null> {
    const { data, error: e } = await supabase
      .from('change_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (e || !data) return null
    return mapRequestRow(data)
  }

  async function hasPendingRequest(transactionId: number): Promise<boolean> {
    const { data } = await supabase
      .from('change_requests')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('status', 'pending')
      .maybeSingle()
    return !!data
  }

  // Drives the "Change pending" chip on the finance document lists.
  async function fetchPendingTargetIds(): Promise<number[]> {
    const { data, error: e } = await supabase
      .from('change_requests')
      .select('transaction_id, transactions!inner(transaction_type)')
      .eq('status', 'pending')
      .in('transactions.transaction_type', MODULE_TYPES)
    if (e) {
      handleError(e, 'Failed to fetch pending change requests')
      return []
    }
    return (data || []).map((r: any) => r.transaction_id as number)
  }

  // Transactions carrying an APPLIED edit — drives the "Edited" chip.
  async function fetchAppliedEdits(): Promise<AppliedEdit[]> {
    const { data, error: e } = await supabase
      .from('change_requests')
      .select('id, transaction_id, summary, reason, resolved_at, from_transaction_no, to_transaction_no, transactions!inner(transaction_type)')
      .eq('request_type', 'edit')
      .eq('status', 'approved')
      .in('transactions.transaction_type', MODULE_TYPES)
      .order('resolved_at', { ascending: false })
    if (e) {
      handleError(e, 'Failed to fetch applied edits')
      return []
    }
    return (data || []) as AppliedEdit[]
  }

  // ── Activity log ─────────────────────────────────────────────────────────
  async function logChangeEvent(
    action: typeof ACTION_REQUEST | typeof ACTION_APPROVE | typeof ACTION_REJECT,
    req: FinanceChangeRequestType,
    userId: string,
    note?: string,
  ) {
    const verb = req.request_type === 'void' ? 'Undo/void' : 'Edit'
    const head =
      action === ACTION_REQUEST
        ? `Change request #${req.id} — ${verb} ${txnLabel(req.from_transaction_no, req.transaction_id)}`
        : `${action === ACTION_APPROVE ? 'Approved' : 'Rejected'} change request #${req.id} — ${verb} ${txnLabel(req.from_transaction_no, req.transaction_id)}`
    const tail = note ?? req.summary ?? req.reason ?? null

    const { error: e } = await supabase.from('logs').insert({
      created_by: userId,
      action,
      module: 'finance',
      description: tail ? `${head}: ${tail}` : head,
      transaction_id: req.transaction_id,
    })
    if (e) console.warn(`logChangeEvent(${action}): activity log insert failed:`, e.message)
  }

  // ── Propose ──────────────────────────────────────────────────────────────
  async function proposeChange(payload: ProposeFinanceChangePayload) {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    if (await hasPendingRequest(payload.transactionId)) {
      toast.warning('There is already a pending change request for this document.')
      loading.value = false
      return { success: false }
    }

    // Gate the document so it can't be re-edited/re-approved while this
    // request is pending, and stash the pre-gate status so a REJECT can
    // restore it (never leave the document stranded on 'change_request').
    const { data: txnCheck } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('id', payload.transactionId)
      .maybeSingle()

    // A voided or cancelled document is finished: a request on it would flip
    // its status to 'change_request', and approving that request then voided it
    // AGAIN — EXP-2026-038 and EXP-2026-045 were each reissued twice this way
    // (2026-10-21), crediting the petty fund twice and booking the expense twice.
    if (txnCheck && (txnCheck.status === 'voided' || txnCheck.status === 'cancelled')) {
      toast.warning('This document has already been voided, so it cannot be changed. Look for the document that replaced it.')
      loading.value = false
      return { success: false }
    }

    if (txnCheck && txnCheck.status !== 'change_request') {
      await supabase
        .from('transactions')
        .update({ status: 'change_request', updated_at: new Date().toISOString() })
        .eq('id', payload.transactionId)
        .neq('status', 'change_request')
        .not('status', 'in', '(voided,cancelled)') // never over a void
    }

    const proposedChanges: ProposedChange = { ...(payload.proposedChanges ?? {}) }
    if (txnCheck?.status) proposedChanges[PREV_STATUS_KEY] = { from: txnCheck.status, to: 'change_request' }

    const { data, error: insertError } = await supabase
      .from('change_requests')
      .insert({
        transaction_id: payload.transactionId,
        from_transaction_no: payload.fromTransactionNo ?? null,
        to_transaction_no: payload.toTransactionNo ?? null,
        request_type: payload.requestType,
        proposed_changes: serializeProposedChanges(proposedChanges),
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
      if (duplicate) toast.warning('There is already a pending change request for this document.')
      else toast.error(insertError?.message || 'Failed to submit change request.')
      loading.value = false
      return { success: false }
    }

    await logChangeEvent(ACTION_REQUEST, mapRequestRow(data), user.id)

    toast.success('Change request submitted for approval.')
    loading.value = false
    return { success: true, requestId: data.id }
  }

  // ── Reject ───────────────────────────────────────────────────────────────
  async function rejectRequest(requestId: number, reason: string) {
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
    const ok = await resolveRequest(requestId, user.id, ACTION_REJECT, { note, toTransactionNo: null })
    if (!ok) {
      loading.value = false
      return { success: false }
    }

    // Restore the document's pre-gate status instead of leaving it stranded
    // on 'change_request'.
    const prevStatus = (request.proposed_changes?.[PREV_STATUS_KEY] as { from?: unknown } | undefined)?.from
    if (typeof prevStatus === 'string') {
      const { error: revertErr } = await supabase
        .from('transactions')
        .update({ status: prevStatus, updated_at: new Date().toISOString() })
        .eq('id', request.transaction_id)
        .eq('status', 'change_request')
      if (revertErr) console.warn('rejectRequest: failed to restore document status:', revertErr.message)
    }

    await logChangeEvent(ACTION_REJECT, request, user.id, note)
    toast.success('Change request rejected.')
    await fetchRequests({ status: 'pending' })
    loading.value = false
    return { success: true }
  }

  // ── Approve ──────────────────────────────────────────────────────────────
  // Apply the change first (dispatch by transaction type), and only write the
  // resolution log if the apply succeeded — a failed apply leaves the request
  // pending so it can be retried.
  async function approveRequest(requestId: number) {
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

    const applied = await applyChange(request, user.id)
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
      toast.warning('Change applied, but recording the approval failed — the request may still show as pending.')
    } else {
      toast.success('Change request approved and applied.')
    }
    await logChangeEvent(ACTION_APPROVE, request, user.id, applied.resultRef ?? 'Applied.')
    await fetchRequests({ status: 'pending' })
    loading.value = false
    return { success: true }
  }

  // Guarded on status='pending' so a stale double-click can't re-resolve a
  // request (and, via approveRequest, re-apply the change).
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

  // ─── Apply dispatch ─────────────────────────────────────────────────────────
  // The appliers live in ONE place (src/stores/changeRequests/finance.ts),
  // shared with the shared store's dispatcher, so the two approval routes run
  // the same code. They used to be two copies that had drifted: only the other
  // one checked a correction could go through before voiding the original.
  async function applyChange(request: FinanceChangeRequestType, userId: string): Promise<ApplyResult> {
    const txnType = await resolveTransactionType(request.transaction_id)
    if (!txnType) return { success: false, error: 'Transaction not found.' }

    switch (txnType) {
      case 'expense':
        return applyExpenseChange(request, userId)
      case 'supplier_payment':
        return applySupplierPaymentChange(request, userId)
      default:
        return {
          success: false,
          error: `Finance change requests for transaction type "${txnType}" are not enabled.`,
        }
    }
  }

  async function resolveTransactionType(transactionId: number): Promise<string | null> {
    const { data } = await supabase
      .from('transactions')
      .select('transaction_type')
      .eq('id', transactionId)
      .maybeSingle()
    return data?.transaction_type ?? null
  }

  /**
   * Every change request that touched a document: those filed against it, and
   * — for a replacement from the old void-and-reissue days — the one that
   * created it. Oldest first, with the requester's and approver's emails.
   */
  async function fetchHistory(transactionId: number, docNo: string | null): Promise<FinanceChangeRequestType[]> {
    const filter = docNo
      ? `transaction_id.eq.${transactionId},to_transaction_no.eq.${docNo}`
      : `transaction_id.eq.${transactionId}`
    const { data, error: e } = await supabase
      .from('change_requests')
      .select('*')
      .or(filter)
      .order('created_at', { ascending: true })
    if (e) {
      handleError(e, 'Failed to load the change history')
      return []
    }
    if (!authStore.users.length) await authStore.getAllUsers()
    const emailOf = (id: string | null) => authStore.users.find((u: any) => u.id === id)?.email ?? null
    return (data || []).map((row) => ({
      ...mapRequestRow(row),
      created_by_email: emailOf(row.created_by),
      resolved_by_email: emailOf(row.resolved_by),
    }))
  }

  function resetStore() {
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
    fetchAppliedEdits,
    fetchHistory,
    proposeChange,
    approveRequest,
    rejectRequest,
    clearError,
    resetStore,
  }
})
