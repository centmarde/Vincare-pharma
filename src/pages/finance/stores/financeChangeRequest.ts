import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useFinanceDataStore } from '@/stores/financeData'
import type { ExpenseCategory, ExpenseDepartment } from '@/stores/financeData'
import { useGLDataStore } from '@/stores/glData'
import { getErrorMessage } from '@/utils/helpers'
import type { AppliedEdit } from '@/stores/changeRequestsData'
import type { ProposedChange } from '@/utils/changeRequests'
import { parseProposedChanges, serializeProposedChanges } from '@/utils/changeRequests'

// Approval-gated change requests for the FINANCE module (expense + supplier
// payment only — journal entries are a `journal_entries` row, not a
// `transactions` row, so they can't be scoped/dispatched the same way and
// stay on GeneralJournal's existing direct-reversal flow).
//
// Mirrors the purchasing reference (`src/pages/purchasing/stores/oldChangeRequestPR.ts`)
// structurally: same fetch/propose/approve/reject/apply shape, scoped to this
// module's transaction types via `transactions!inner(transaction_type)`. The
// apply logic itself (void/edit rules per document type) is carried over
// verbatim from the shared `src/stores/changeRequestsData.ts`, which keeps it
// for inhouse/ethical collections.

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

function stripReservedKeys(changes: ProposedChange): ProposedChange {
  const out: ProposedChange = {}
  for (const [k, v] of Object.entries(changes)) if (k !== PREV_STATUS_KEY) out[k] = v
  return out
}

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

  // Reverse a document's projected GL entry (the ORIGINAL booking, not a mirror
  // reversal — reverses_entry IS NULL — so a retry can't re-reverse). Returns
  // ok when there's nothing to reverse (never projected). Shared by every void.
  async function reverseProjectedEntry(
    referenceType: 'disbursement' | 'collection',
    referenceId: number,
    userId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const gl = useGLDataStore()
    const { data: je } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('reference_type', referenceType)
      .eq('reference_id', referenceId)
      .eq('status', 'posted')
      .is('reverses_entry', null)
      .maybeSingle()
    if (!je) return { ok: true }
    const rev = await gl.reverseJournalEntry(je.id, userId)
    return rev.success ? { ok: true } : { ok: false, error: rev.error }
  }

  // ── Edit model helpers ───────────────────────────────────────────────────
  type Diff = { from: unknown; to: unknown }
  function toVal(changes: ProposedChange, key: string): unknown {
    return key in changes ? (changes[key] as Diff).to : undefined
  }
  function normVal(v: unknown): string {
    return v == null ? '' : String(v)
  }
  // First changed field whose LIVE value no longer matches the request's `from`
  // (the document drifted since the request was filed) — don't apply stale edits.
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
  // Reverse + reissue dates the replacement at the correction date (accountant's
  // call), so a fix never lands back in an already-reported period.
  function correctionDate(): string {
    return new Date().toISOString().slice(0, 10)
  }
  function reissueReason(r: FinanceChangeRequestType): string {
    return `Corrected via change request #${r.id}${r.reason ? `: ${r.reason}` : ''}`
  }
  function reissueRemarks(r: FinanceChangeRequestType, remarks: unknown): string {
    const backlink = `Replaces ${txnLabel(r.from_transaction_no, r.transaction_id)} (change request #${r.id})`
    const existing = (remarks ?? '') as string
    return existing ? `${backlink} | ${existing}` : backlink
  }

  const EXPENSE_LEDGER_KEYS = new Set(['amount', 'category', 'cash_account_id', 'paid_at'])
  const EXPENSE_MEMO_TX_KEYS = new Set(['payment_method', 'remarks'])
  const EXPENSE_MEMO_DETAIL_KEYS = new Set(['paid_to', 'department', 'or_si_no'])

  // Reverse the expense's projected GL entry (if booked), then soft-void the
  // document and restore the cash account. The row stays, flagged.
  async function voidExpense(
    targetId: number,
    userId: string,
    reason: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    const financeStore = useFinanceDataStore()
    const rev = await reverseProjectedEntry('disbursement', targetId, userId)
    if (!rev.ok)
      return { success: false, error: rev.error || 'Failed to reverse the expense journal entry.' }
    const result = await financeStore.voidExpense(targetId, reason)
    return result.success
      ? { success: true }
      : { success: false, error: 'Failed to void the expense (GL already reversed — please retry).' }
  }

  async function applyExpenseChange(request: FinanceChangeRequestType, userId: string): Promise<ApplyResult> {
    if (request.request_type === 'void') {
      const v = await voidExpense(request.transaction_id, userId, request.reason)
      return v.success ? { success: true, resultRef: request.from_transaction_no ?? undefined } : v
    }

    // EDIT — read live state (for the stale-guard + the reissue base).
    const changes = stripReservedKeys(request.proposed_changes ?? {})
    const { data: cur } = await supabase
      .from('transactions')
      .select(
        'total_amount, cash_account_id, paid_at, payment_method, remarks, status, finance_details(category, paid_to, department, or_si_no)',
      )
      .eq('id', request.transaction_id)
      .eq('transaction_type', 'expense')
      .maybeSingle()
    if (!cur) return { success: false, error: 'Expense not found.' }
    if (cur.status === 'voided') return { success: false, error: 'This expense has already been voided.' }
    const fd = ((Array.isArray(cur.finance_details)
      ? cur.finance_details[0]
      : cur.finance_details) ?? {}) as Record<string, unknown>
    const current: Record<string, unknown> = {
      amount: cur.total_amount,
      cash_account_id: cur.cash_account_id,
      paid_at: (cur.paid_at ?? '').slice(0, 10),
      payment_method: cur.payment_method,
      remarks: cur.remarks,
      category: fd.category,
      paid_to: fd.paid_to,
      department: fd.department,
      or_si_no: fd.or_si_no,
    }
    const stale = firstStaleField(changes, current)
    if (stale) return staleError(stale)

    // Memo-only edit → update in place (same document). Unlike void/reissue,
    // this path never sets a new status on its own, so the 'change_request'
    // gate set at propose time must be cleared explicitly here — restore the
    // pre-gate status stashed in __prev_status (else the document is
    // permanently stuck gated, invisible to whatever normally reads its
    // status).
    if (!Object.keys(changes).some((k) => EXPENSE_LEDGER_KEYS.has(k))) {
      const txUpdate: Record<string, unknown> = {}
      const detailUpdate: Record<string, unknown> = {}
      for (const [key, diff] of Object.entries(changes)) {
        const to = (diff as Diff).to
        if (EXPENSE_MEMO_TX_KEYS.has(key)) txUpdate[key] = to
        else if (EXPENSE_MEMO_DETAIL_KEYS.has(key)) detailUpdate[key] = to
      }
      const prevStatus = (request.proposed_changes?.[PREV_STATUS_KEY] as { from?: unknown } | undefined)?.from
      if (typeof prevStatus === 'string') txUpdate.status = prevStatus
      else console.warn('applyExpenseChange: no __prev_status stashed — document may stay gated on change_request.')
      if (Object.keys(txUpdate).length) {
        const { error: e } = await supabase
          .from('transactions')
          .update(txUpdate)
          .eq('id', request.transaction_id)
        if (e) return { success: false, error: e.message }
      }
      if (Object.keys(detailUpdate).length) {
        const { error: e } = await supabase
          .from('finance_details')
          .update(detailUpdate)
          .eq('transaction_id', request.transaction_id)
        if (e) return { success: false, error: e.message }
      }
      return { success: true, resultRef: request.from_transaction_no ?? undefined }
    }

    // Ledger edit → reverse the old expense + reissue a corrected one.
    // The replacement is dated at the CORRECTION date, not the original value
    // date, so a correction never posts back into an already-reported period
    // (unless the edit is explicitly changing paid_at itself).
    const financeStore = useFinanceDataStore()
    const merged = {
      category: (toVal(changes, 'category') ?? fd.category) as ExpenseCategory,
      amount: Number(toVal(changes, 'amount') ?? cur.total_amount ?? 0),
      paidTo: ((toVal(changes, 'paid_to') ?? fd.paid_to) as string | undefined) || undefined,
      paymentMethod:
        ((toVal(changes, 'payment_method') ?? cur.payment_method) as string | undefined) || undefined,
      valueDate: ((toVal(changes, 'paid_at') ?? correctionDate()) as string | undefined) || undefined,
      remarks: reissueRemarks(request, toVal(changes, 'remarks') ?? cur.remarks),
      department:
        ((toVal(changes, 'department') ?? fd.department) as ExpenseDepartment | undefined) || undefined,
      orSiNo: ((toVal(changes, 'or_si_no') ?? fd.or_si_no) as string | undefined) || undefined,
      cashAccountId: Number(toVal(changes, 'cash_account_id') ?? cur.cash_account_id),
    }
    const v = await voidExpense(request.transaction_id, userId, reissueReason(request))
    if (!v.success) return v
    const res = await financeStore.recordExpense(merged)
    if (!res.success)
      return {
        success: false,
        error: 'Old expense voided, but reissuing the corrected expense failed — please re-record it manually.',
      }
    return { success: true, resultId: res.expenseId, resultRef: res.expenseNo ?? undefined }
  }

  // ── Supplier payment ──────────────────────────────────────────────────────
  // Projects as 'disbursement' (DR AP / CR cash). Void reverses that + restores
  // suppliers.balance (which recordSupplierPayment decremented). Edit is
  // memo-only; amount changes go through void + re-record.
  async function voidSupplierPayment(
    targetId: number,
    userId: string,
    reason: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    const { data: pay } = await supabase
      .from('transactions')
      .select('supplier_id, total_amount, status')
      .eq('id', targetId)
      .eq('transaction_type', 'supplier_payment')
      .maybeSingle()
    if (!pay) return { success: false, error: 'Supplier payment not found.' }
    if (pay.status === 'voided') return { success: false, error: 'This payment has already been voided.' }
    const rev = await reverseProjectedEntry('disbursement', targetId, userId)
    if (!rev.ok)
      return { success: false, error: rev.error || 'Failed to reverse the payment journal entry.' }

    // Void marker first: it is what excludes the payment from every AP read, so
    // it must land before the compensating balance restore. (transactions.
    // voided_at/voided_by/void_reason were dropped from the schema — status is
    // the only signal now; the who/when/why lives on the change_requests row.)
    const { error: voidErr } = await supabase
      .from('transactions')
      .update({ status: 'voided' })
      .eq('id', targetId)
      .eq('transaction_type', 'supplier_payment')
      .neq('status', 'voided')
    if (voidErr) return { success: false, error: voidErr.message }

    if (pay.supplier_id) {
      const { data: s } = await supabase
        .from('suppliers')
        .select('balance')
        .eq('id', pay.supplier_id)
        .maybeSingle()
      if (s) {
        const { error: e } = await supabase
          .from('suppliers')
          .update({ balance: (s.balance ?? 0) + (pay.total_amount ?? 0) })
          .eq('id', pay.supplier_id)
        if (e) console.warn('voidSupplierPayment: suppliers.balance restore failed:', e.message)
      }
    }
    return { success: true }
  }

  async function applySupplierPaymentChange(request: FinanceChangeRequestType, userId: string): Promise<ApplyResult> {
    if (request.request_type === 'void') {
      const v = await voidSupplierPayment(request.transaction_id, userId, request.reason)
      return v.success ? { success: true, resultRef: request.from_transaction_no ?? undefined } : v
    }

    const changes = stripReservedKeys(request.proposed_changes ?? {})
    const { data: cur } = await supabase
      .from('transactions')
      .select('supplier_id, total_amount, payment_method, paid_at, remarks, status')
      .eq('id', request.transaction_id)
      .eq('transaction_type', 'supplier_payment')
      .maybeSingle()
    if (!cur) return { success: false, error: 'Supplier payment not found.' }
    if (cur.status === 'voided') return { success: false, error: 'This payment has already been voided.' }
    const current: Record<string, unknown> = {
      amount: cur.total_amount,
      payment_method: cur.payment_method,
      remarks: cur.remarks,
    }
    const stale = firstStaleField(changes, current)
    if (stale) return staleError(stale)

    // Memo-only (method/remarks) → in place. Clear the 'change_request' gate
    // here too — this path never sets a status of its own (see the matching
    // note in applyExpenseChange).
    if (!('amount' in changes)) {
      const txUpdate: Record<string, unknown> = {}
      for (const [key, diff] of Object.entries(changes)) {
        if (key === 'payment_method' || key === 'remarks') txUpdate[key] = (diff as Diff).to
      }
      const prevStatus = (request.proposed_changes?.[PREV_STATUS_KEY] as { from?: unknown } | undefined)?.from
      if (typeof prevStatus === 'string') txUpdate.status = prevStatus
      else console.warn('applySupplierPaymentChange: no __prev_status stashed — document may stay gated on change_request.')
      if (Object.keys(txUpdate).length) {
        const { error: e } = await supabase
          .from('transactions')
          .update(txUpdate)
          .eq('id', request.transaction_id)
        if (e) return { success: false, error: e.message }
      }
      return { success: true, resultRef: request.from_transaction_no ?? undefined }
    }

    // Amount edit → reverse + reissue, dated at the correction date.
    const financeStore = useFinanceDataStore()
    const merged = {
      supplierId: Number(cur.supplier_id),
      amount: Number(toVal(changes, 'amount') ?? cur.total_amount ?? 0),
      paymentMethod:
        ((toVal(changes, 'payment_method') ?? cur.payment_method) as string | undefined) || undefined,
      valueDate: correctionDate(),
      remarks: reissueRemarks(request, toVal(changes, 'remarks') ?? cur.remarks),
    }
    const v = await voidSupplierPayment(request.transaction_id, userId, reissueReason(request))
    if (!v.success) return v
    const res = await financeStore.recordSupplierPayment(merged)
    if (!res.success)
      return {
        success: false,
        error: 'Old payment voided, but reissuing the corrected payment failed — please re-record it manually.',
      }
    return { success: true, resultId: res.paymentId, resultRef: res.paymentNo ?? undefined }
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
