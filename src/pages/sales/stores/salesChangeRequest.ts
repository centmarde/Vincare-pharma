import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useSalesDataStore } from '@/stores/salesData'
import { getErrorMessage } from '@/utils/helpers'
import type { ProposedChange, AppliedEdit } from '@/stores/changeRequestsData'

// Approval-gated change requests for the SALES module: POS sale (void only —
// a sale isn't edited, it's void + re-ring) and remittance (edit only — a
// GL-silent cash-reconciliation artifact, never voided).
//
// Mirrors the purchasing reference (`src/pages/purchasing/stores/oldChangeRequestPR.ts`)
// structurally, scoped to this module's transaction types via
// `transactions!inner(transaction_type)`. Apply logic carried over verbatim
// from the shared `src/stores/changeRequestsData.ts`.

const toast = useToast()

const ACTION_REQUEST = 'change_requested'
const ACTION_APPROVE = 'change_approved'
const ACTION_REJECT = 'change_rejected'

const MODULE_TYPES = ['sale', 'remittance']

// Reserved proposed_changes key: the transaction's status right before the
// 'change_request' gate was set, stashed at propose time so a REJECT can
// restore it instead of stranding the document on 'change_request'.
const PREV_STATUS_KEY = '__prev_status'

function stripReservedKeys(changes: ProposedChange): ProposedChange {
  const out: ProposedChange = {}
  for (const [k, v] of Object.entries(changes)) if (k !== PREV_STATUS_KEY) out[k] = v
  return out
}

export type SalesChangeRequestType = {
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
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  from_transaction_no: string | null
  to_transaction_no: string | null
}

export type ProposeSalesChangePayload = {
  transactionId: number
  fromTransactionNo?: string | null
  toTransactionNo?: string | null
  requestType: 'edit' | 'void'
  proposedChanges?: ProposedChange
  summary?: string
  reason?: string
}

type ApplyResult = { success: boolean; resultRef?: string; error?: string }

function mapRequestRow(row: any): SalesChangeRequestType {
  return {
    id: row.id,
    created_at: row.created_at,
    transaction_id: row.transaction_id,
    request_type: row.request_type,
    proposed_changes: (row.proposed_changes ?? {}) as ProposedChange,
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

export const useSalesChangeRequestStore = defineStore('salesChangeRequest', () => {
  const authStore = useAuthUserStore()

  const requests: Ref<SalesChangeRequestType[]> = ref([])
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
      handleError(err, 'Failed to fetch sales change requests')
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchRequestById(id: number): Promise<SalesChangeRequestType | null> {
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

  // Drives the "Change pending" chip on the sales document lists.
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
      .select('transaction_id, summary, reason, resolved_at, to_transaction_no, transactions!inner(transaction_type)')
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
    req: SalesChangeRequestType,
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
      module: 'sales',
      description: tail ? `${head}: ${tail}` : head,
      transaction_id: req.transaction_id,
    })
    if (e) console.warn(`logChangeEvent(${action}): activity log insert failed:`, e.message)
  }

  // ── Propose ──────────────────────────────────────────────────────────────
  async function proposeChange(payload: ProposeSalesChangePayload) {
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

    const proposedChanges: ProposedChange = { ...(payload.proposedChanges ?? {}) }
    if (txnCheck?.status) proposedChanges[PREV_STATUS_KEY] = { from: txnCheck.status, to: 'change_request' }

    const { data, error: insertError } = await supabase
      .from('change_requests')
      .insert({
        transaction_id: payload.transactionId,
        from_transaction_no: payload.fromTransactionNo ?? null,
        to_transaction_no: payload.toTransactionNo ?? null,
        request_type: payload.requestType,
        proposed_changes: proposedChanges,
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

    const applied = await applyChange(request)
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
  async function applyChange(request: SalesChangeRequestType): Promise<ApplyResult> {
    const txnType = await resolveTransactionType(request.transaction_id)
    if (!txnType) return { success: false, error: 'Transaction not found.' }

    switch (txnType) {
      case 'sale':
        return applySaleChange(request)
      case 'remittance':
        return applyRemittanceChange(request)
      default:
        return {
          success: false,
          error: `Sales change requests for transaction type "${txnType}" are not enabled.`,
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

  // ── Edit model helpers ───────────────────────────────────────────────────
  type Diff = { from: unknown; to: unknown }
  function normVal(v: unknown): string {
    return v == null ? '' : String(v)
  }
  function firstStaleField(changes: ProposedChange, current: Record<string, unknown>): string | null {
    for (const [k, diff] of Object.entries(changes)) {
      if (normVal((diff as Diff).from) !== normVal(current[k])) return k
    }
    return null
  }
  function staleError(k: string) {
    return {
      success: false as const,
      error: `"${k}" changed since this request was filed — please re-file the edit.`,
    }
  }

  // ── POS sale ──────────────────────────────────────────────────────────────
  // Reuse voidSale (restores stock, marks voided; the projection then books a
  // sales_return so the GL reverses). Sales aren't edited — void + re-ring.
  async function applySaleChange(request: SalesChangeRequestType): Promise<ApplyResult> {
    if (request.request_type === 'edit')
      return { success: false, error: 'A sale cannot be edited — void it and re-ring instead.' }
    const salesStore = useSalesDataStore()
    const result = await salesStore.voidSale(
      request.transaction_id,
      request.reason ?? 'Voided via change request',
    )
    return result.success
      ? { success: true, resultRef: request.from_transaction_no ?? undefined }
      : { success: false, error: 'Failed to void the sale (it may already be remitted).' }
  }

  // ── Remittance ────────────────────────────────────────────────────────────
  // Remittances are GL-silent (a cash-reconciliation artifact), so correcting
  // the counted amount / notes in place is safe. Edit only — no void.
  async function applyRemittanceChange(request: SalesChangeRequestType): Promise<ApplyResult> {
    if (request.request_type === 'void')
      return {
        success: false,
        error: 'A remittance is corrected by editing the counted amount, not voided.',
      }
    const changes = stripReservedKeys(request.proposed_changes ?? {})
    const { data: cur } = await supabase
      .from('transactions')
      .select('remarks, remittance_details(actual_amount)')
      .eq('id', request.transaction_id)
      .eq('transaction_type', 'remittance')
      .maybeSingle()
    if (!cur) return { success: false, error: 'Remittance not found.' }
    const rd = (
      Array.isArray(cur.remittance_details) ? cur.remittance_details[0] : cur.remittance_details
    ) as { actual_amount?: unknown } | null
    const current: Record<string, unknown> = {
      actual_amount: rd?.actual_amount,
      notes: cur.remarks,
    }
    const stale = firstStaleField(changes, current)
    if (stale) return staleError(stale)
    const detailUpdate: Record<string, unknown> = {}
    const txUpdate: Record<string, unknown> = {}
    for (const [key, diff] of Object.entries(changes)) {
      const to = (diff as Diff).to
      if (key === 'actual_amount') detailUpdate.actual_amount = to
      else if (key === 'notes') txUpdate.remarks = to
    }
    // This path never sets a status of its own, so the 'change_request' gate
    // set at propose time must be cleared explicitly (see the matching note
    // in financeChangeRequest.ts's applyExpenseChange).
    const prevStatus = (request.proposed_changes?.[PREV_STATUS_KEY] as { from?: unknown } | undefined)?.from
    if (typeof prevStatus === 'string') txUpdate.status = prevStatus
    else console.warn('applyRemittanceChange: no __prev_status stashed — document may stay gated on change_request.')
    if (Object.keys(detailUpdate).length) {
      const { error: e } = await supabase
        .from('remittance_details')
        .update(detailUpdate)
        .eq('transaction_id', request.transaction_id)
      if (e) return { success: false, error: e.message }
    }
    if (Object.keys(txUpdate).length) {
      const { error: e } = await supabase
        .from('transactions')
        .update(txUpdate)
        .eq('id', request.transaction_id)
      if (e) return { success: false, error: e.message }
    }
    return { success: true, resultRef: request.from_transaction_no ?? undefined }
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
    proposeChange,
    approveRequest,
    rejectRequest,
    clearError,
    resetStore,
  }
})
