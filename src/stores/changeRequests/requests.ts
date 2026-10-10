// The request lifecycle: listing requests (and the pending / edited markers the
// list views show), proposing a change, and approving or rejecting it.
//
// fetchRequests, rejectRequest and approveRequest share lastFetchOptions, so
// they stay in this one file — an imported binding cannot be reassigned.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import type { ProposedChange } from '@/utils/changeRequests'
import { parseProposedChanges, serializeProposedChanges } from '@/utils/changeRequests'
import { prevStatusKey, collectionIdKey } from './types'
import type { AppliedEdit, ChangeRequestType, ProposeChangePayload } from './types'
import { mapRequestRow, txnLabel } from './helpers'
import { requests, loading, handleError, clearError } from './state'
import { applyChange } from './apply'

const toast = useToast()

// Resolved lazily rather than at import time: a store factory called while
// this module is first evaluated can run before Pinia is installed.
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())

const ACTION_REQUEST = 'change_requested'
const ACTION_APPROVE = 'change_approved'
const ACTION_REJECT = 'change_rejected'

// Remembers the last fetch scope so the internal re-fetch after an
// approve/reject preserves whatever filter the caller was using (e.g. the
// executive queue's inhouse/ethical type scope) instead of silently
// widening back to every pending request.
let lastFetchOptions: { status?: 'pending' | 'approved' | 'rejected'; types?: string[] } = {}

// `types` scopes to specific transaction_types via an inner join (e.g. the
// executive approver queue passes ['inhouse_order','ethical_order'] to pull
// only the in-house/ethical payment requests this shared store owns, without
// dragging in finance/sales/PR rows those modules' own stores already surface).
export async function fetchRequests(
  options: { status?: 'pending' | 'approved' | 'rejected'; types?: string[] } = {},
) {
  lastFetchOptions = options
  loading.value = true
  clearError()
  try {
    // The two select strings are kept as separate literals (rather than one
    // conditional variable) because Supabase resolves the row type from the
    // select string at compile time — a union of two select strings makes it
    // unresolvable.
    const types = options.types
    const rows = await (async () => {
      if (types?.length) {
        let q = supabase
          .from('change_requests')
          .select('*, transactions!inner(transaction_type)')
          .in('transactions.transaction_type', types)
          .order('created_at', { ascending: false })
        if (options.status) q = q.eq('status', options.status)
        const { data, error: e } = await q
        if (e) throw e
        return data
      }
      let q = supabase
        .from('change_requests')
        .select('*')
        .order('created_at', { ascending: false })
      if (options.status) q = q.eq('status', options.status)
      const { data, error: e } = await q
      if (e) throw e
      return data
    })()

    if (!getAuthStore().users.length) await getAuthStore().getAllUsers()
    requests.value = (rows || []).map((row: any) => ({
      ...mapRequestRow(row),
      created_by_email: getAuthStore().users.find((u: any) => u.id === row.created_by)?.email ?? null,
    }))
    return requests.value
  } catch (err) {
    handleError(err, 'Failed to fetch change requests')
    return []
  } finally {
    loading.value = false
  }
}

export async function fetchRequestById(id: number): Promise<ChangeRequestType | null> {
  const { data, error: e } = await supabase
    .from('change_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (e || !data) return null
  return mapRequestRow(data)
}

// Business rule (devplan §Business Rules): only one active pending request
// per transaction. An order with several payments therefore allows only one
// open payment-void/edit request at a time — the next must wait for the
// current one to be approved/rejected.
export async function hasPendingRequest(transactionId: number): Promise<boolean> {
  const { data } = await supabase
    .from('change_requests')
    .select('id')
    .eq('transaction_id', transactionId)
    .eq('status', 'pending')
    .maybeSingle()
  return !!data
}

// Which transactions currently have a pending request (drives the
// "Change pending" chip on a list view). No longer filters by target type —
// callers filter their own lists. Resolves to the collection id (not the
// order's transaction_id) for in-house/ethical payment requests, so the
// chip lands on the specific payment row rather than every payment on the
// order.
export async function fetchPendingTargetIds(): Promise<number[]> {
  const { data, error: e } = await supabase
    .from('change_requests')
    .select('transaction_id, proposed_changes')
    .eq('status', 'pending')
  if (e) {
    handleError(e, 'Failed to fetch pending change requests')
    return []
  }
  return (data || []).map((r: any) => {
    const cid = parseProposedChanges(r.proposed_changes)[collectionIdKey]?.to
    return typeof cid === 'number' ? cid : (r.transaction_id as number)
  })
}

// Transactions carrying an APPLIED edit — drives the "Edited" chip. Same
// collection-id resolution as fetchPendingTargetIds above.
export async function fetchAppliedEdits(): Promise<AppliedEdit[]> {
  const { data, error: e } = await supabase
    .from('change_requests')
    .select('transaction_id, summary, reason, resolved_at, to_transaction_no, proposed_changes')
    .eq('request_type', 'edit')
    .eq('status', 'approved')
    .order('resolved_at', { ascending: false })
  if (e) {
    handleError(e, 'Failed to fetch applied edits')
    return []
  }
  return (data || []).map((r: any) => {
    const cid = parseProposedChanges(r.proposed_changes)[collectionIdKey]?.to
    return {
      transaction_id: typeof cid === 'number' ? cid : (r.transaction_id as number),
      summary: r.summary ?? null,
      reason: r.reason ?? null,
      resolved_at: r.resolved_at ?? null,
      to_transaction_no: r.to_transaction_no ?? null,
    } as AppliedEdit
  })
}

// The activity-log side. Same action names as the old encoding so log
// filters, colors and the timeline keep working — but the description is a
// readable sentence now, not the JSON blob the log feed used to render.
export async function logChangeEvent(
  action: typeof ACTION_REQUEST | typeof ACTION_APPROVE | typeof ACTION_REJECT,
  req: ChangeRequestType,
  userId: string,
  note?: string,
) {
  const verb =
    req.request_type === 'undo_pr'
      ? 'Undo_PR'
      : req.request_type === 'void'
        ? 'Undo/void'
        : 'Edit'
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

export async function proposeChange(payload: ProposeChangePayload) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) {
    toast.error('User not authenticated.')
    loading.value = false
    return { success: false }
  }

  // Friendly pre-check — one pending request per transaction (see rule in
  // hasPendingRequest). For an order with multiple payments this means a
  // second payment's request is blocked until the first resolves.
  if (await hasPendingRequest(payload.transactionId)) {
    toast.warning('There is already a pending change request for this document.')
    loading.value = false
    return { success: false }
  }

  // Before inserting the change request, mark the transaction as having a
  // pending change request. The status 'change_request' serves as a
  // gate — the document cannot be further modified/approved until this is
  // resolved (approved or rejected). Only set it for transaction types that
  // support the status column (finance/purchasing transactions).
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
      .neq('status', 'change_request') // guard: don't re-set if already set
  }

  const proposedChanges: ProposedChange = { ...(payload.proposedChanges ?? {}) }
  if (txnCheck?.status) proposedChanges[prevStatusKey] = { from: txnCheck.status, to: 'change_request' }

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

export async function rejectRequest(requestId: number, reason: string) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
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

  // Restore the document's pre-gate status instead of leaving it stranded
  // on 'change_request'.
  const prevStatus = (request.proposed_changes?.[prevStatusKey] as { from?: unknown } | undefined)?.from
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
  await fetchRequests({ ...lastFetchOptions, status: 'pending' })
  loading.value = false
  return { success: true }
}

// Approve: apply the change first (dispatch by transaction type), and only write
// the resolution log if the apply succeeded — a failed apply leaves the
// request pending so it can be retried. Self-approval is allowed.
export async function approveRequest(requestId: number) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
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
    toast.warning(
      'Change applied, but recording the approval failed — the request may still show as pending.',
    )
  } else {
    toast.success('Change request approved and applied.')
  }
  await logChangeEvent(ACTION_APPROVE, request, user.id, applied.resultRef ?? 'Applied.')
  await fetchRequests({ ...lastFetchOptions, status: 'pending' })
  loading.value = false
  return { success: true }
}

// Guarded on status='pending' so a stale double-click can't re-resolve a
// request (and, via approveRequest, re-apply the change).
export async function resolveRequest(
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
