import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useFinanceDataStore } from '@/stores/financeData'
import type { ExpenseCategory, ExpenseDepartment } from '@/stores/financeData'
import { useGLDataStore } from '@/stores/glData'
import { useSalesDataStore } from '@/stores/salesData'
import { useInhouseDataStore } from '@/stores/inhouseData'
import { useEthicalDataStore } from '@/stores/ethicalData'
import type { ProposedChange } from '@/utils/changeRequests'
import { parseProposedChanges, serializeProposedChanges } from '@/utils/changeRequests'

const toast = useToast()

// Approval-gated change requests: a staff member proposes an EDIT or an
// UNDO/VOID to an already-entered document; an executive approves before it's
// applied. On approval, applyChange dispatches to a per-type handler that
// reuses the module's existing undo/reversal functions.
//
// Storage: the `change_requests` table. `logs` keeps only its real job — one
// readable narrative row per event (change_requested / change_approved /
// change_rejected), carrying transaction_id so the request still appears on the
// document's cross-module timeline.
//
// Voids are SOFT: every handler below marks the document voided and leaves it
// in place (the accountant's requirement — a reversed document stays visible,
// flagged, for tracking). A ledger EDIT is reverse + reissue: the original is
// voided and a replacement is recorded at the CORRECTION date, with from_transaction_no /
// to_transaction_no linking the two ends.
//
// Best-effort, not atomic (JS-over-RPC convention): approve applies the change
// first and only then flips status, so a failure leaves the request pending and
// retryable rather than marking a change done that never landed.

const ACTION_REQUEST = 'change_requested'
const ACTION_APPROVE = 'change_approved'
const ACTION_REJECT = 'change_rejected'

// Reserved proposed_changes keys. change_requests.transaction_id is FK'd to
// transactions.id, but an in-house/ethical payment is a `collections` row, not
// a transactions row — so the collection being voided/edited travels here
// instead, keyed off the order's transaction_id. __prev_status stashes the
// pre-gate status at propose time so a REJECT (or a memo-only edit approve,
// which never sets a status of its own) can restore it instead of stranding
// the document on 'change_request' (same fix already applied in the finance/
// sales change-request stores).
const PREV_STATUS_KEY = '__prev_status'
const COLLECTION_ID_KEY = '__collection_id'

function stripReservedKeys(changes: ProposedChange): ProposedChange {
  const out: ProposedChange = {}
  for (const [k, v] of Object.entries(changes)) {
    if (k !== PREV_STATUS_KEY && k !== COLLECTION_ID_KEY) out[k] = v
  }
  return out
}

// NOTE: the old `ChangeRequestTargetType` union was removed — it was a leftover
// from the v1 polymorphic schema (`target_type`/`target_id`, dropped when
// change_requests was restructured to a single transaction_id FK). It was
// referenced nowhere, and its values ('inhouse_payment', 'ethical_collection',
// 'journal_entry') were never real `transactions.transaction_type` values, so
// it actively misled dispatch code. Dispatch keys off transaction_type now.

// One editable field surfaced in the proposal dialog. `value` is the current
// value (prefilled) so the dialog can compute the diff automatically.
export type ChangeRequestField = {
  key: string
  label: string
  value: string | number | null
  type: 'text' | 'number' | 'select' | 'date'
  items?: { title: string; value: string | number }[]
}

// Lives in `@/utils/changeRequests` (pure, no side effects) so other stores can
// use it without eagerly loading this module's store/toast dependencies.
// Re-exported here so existing `from '@/stores/changeRequestsData'` type imports
// keep working.
export type { ProposedChange } from '@/utils/changeRequests'

export type ChangeRequestType = {
  id: number // change_requests.id
  created_at: string
  transaction_id: number // FK to transactions.id
  request_type: 'edit' | 'void' | 'undo_pr'
  proposed_changes: ProposedChange
  summary: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_by: string | null
  created_by_email?: string | null
  resolved_by: string | null
  resolved_at: string | null
  //module: string | null
  resolution_note: string | null
  from_transaction_no: string | null // Original transaction ref
  to_transaction_no: string | null // Replacement transaction ref after a ledger edit
}

export type ProposeChangePayload = {
  transactionId: number
  fromTransactionNo?: string | null
  toTransactionNo?: string | null
  requestType: 'edit' | 'void' | 'undo_pr'
  proposedChanges?: ProposedChange
  summary?: string
  reason?: string
}

type ApplyResult = { success: boolean; resultId?: number; resultRef?: string; error?: string }

// One approved edit against a document, for the "Edited" chip.
export type AppliedEdit = {
  transaction_id: number
  summary: string | null
  reason: string | null
  resolved_at: string | null
  to_transaction_no: string | null
}

function mapRequestRow(row: any): ChangeRequestType {
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
    // module: row.module ?? null,
  }
}

const txnLabel = (no: string | null, id: number) => no ?? `#${id}`

export const useChangeRequestsDataStore = defineStore('changeRequestsData', () => {
  const authStore = useAuthUserStore()

  const requests: Ref<ChangeRequestType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // Remembers the last fetch scope so the internal re-fetch after an
  // approve/reject preserves whatever filter the caller was using (e.g. the
  // executive queue's inhouse/ethical type scope) instead of silently
  // widening back to every pending request.
  let lastFetchOptions: { status?: 'pending' | 'approved' | 'rejected'; types?: string[] } = {}

  const pendingCount = computed(() => requests.value.filter((r) => r.status === 'pending').length)

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }
  const clearError = () => {
    error.value = ''
  }

  // `types` scopes to specific transaction_types via an inner join (e.g. the
  // executive approver queue passes ['inhouse_order','ethical_order'] to pull
  // only the in-house/ethical payment requests this shared store owns, without
  // dragging in finance/sales/PR rows those modules' own stores already surface).
  const fetchRequests = async (
    options: { status?: 'pending' | 'approved' | 'rejected'; types?: string[] } = {},
  ) => {
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

      if (!authStore.users.length) await authStore.getAllUsers()
      requests.value = (rows || []).map((row: any) => ({
        ...mapRequestRow(row),
        created_by_email: authStore.users.find((u: any) => u.id === row.created_by)?.email ?? null,
      }))
      return requests.value
    } catch (err) {
      handleError(err, 'Failed to fetch change requests')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchRequestById = async (id: number): Promise<ChangeRequestType | null> => {
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
  const hasPendingRequest = async (transactionId: number): Promise<boolean> => {
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
  const fetchPendingTargetIds = async (): Promise<number[]> => {
    const { data, error: e } = await supabase
      .from('change_requests')
      .select('transaction_id, proposed_changes')
      .eq('status', 'pending')
    if (e) {
      handleError(e, 'Failed to fetch pending change requests')
      return []
    }
    return (data || []).map((r: any) => {
      const cid = parseProposedChanges(r.proposed_changes)[COLLECTION_ID_KEY]?.to
      return typeof cid === 'number' ? cid : (r.transaction_id as number)
    })
  }

  // Transactions carrying an APPLIED edit — drives the "Edited" chip. Same
  // collection-id resolution as fetchPendingTargetIds above.
  const fetchAppliedEdits = async (): Promise<AppliedEdit[]> => {
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
      const cid = parseProposedChanges(r.proposed_changes)[COLLECTION_ID_KEY]?.to
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
  async function logChangeEvent(
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

  const proposeChange = async (payload: ProposeChangePayload) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
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
    await fetchRequests({ ...lastFetchOptions, status: 'pending' })
    loading.value = false
    return { success: true }
  }

  // Approve: apply the change first (dispatch by transaction type), and only write
  // the resolution log if the apply succeeded — a failed apply leaves the
  // request pending so it can be retried. Self-approval is allowed.
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
  // Reuses each module's existing undo/reversal where possible. Dispatching is
  // resolved at runtime by looking up the transaction_type from `transactions`,
  // instead of storing it on the request row.
  async function applyChange(request: ChangeRequestType, userId: string): Promise<ApplyResult> {
    const txnType = await resolveTransactionType(request.transaction_id)
    if (!txnType) return { success: false, error: 'Transaction not found.' }

    switch (txnType) {
      case 'expense':
        return applyExpenseChange(request, userId)
      case 'supplier_payment':
        return applySupplierPaymentChange(request, userId)
      case 'sale':
        return applySaleChange(request)
      case 'remittance':
        return applyRemittanceChange(request)
      case 'inhouse_order':
        return applyCollectionChange(request, userId, 'inhouse')
      case 'ethical_order':
        return applyCollectionChange(request, userId, 'ethical')
      // NOTE: no 'journal_entry' case — that is not a transaction_type value.
      // A GL entry is a journal_entries row, so it can never satisfy
      // change_requests.transaction_id (FK → transactions.id); GL corrections
      // go through GeneralJournal.vue's direct reversal instead.
      case 'purchase_requisition':
      case 'purchase_order':
      case 'stock_in':
        return applyPRChange(request, userId)
      default:
        return {
          success: false,
          error: `Change requests for transaction type "${txnType}" are not enabled yet.`,
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

  // ── Edit model ──────────────────────────────────────────────────────────────
  // Edits are hold-until-approve. On approval a MEMO field (no GL impact) is
  // updated in place (same document); a LEDGER field (amount/date/account/
  // category) is applied by REVERSE + REISSUE — the old document is voided
  // (its GL cleanly backed out) and a corrected replacement is recorded (new
  // document number, projects cleanly). This is the auditor-standard way to
  // fix a posted document.
  type Diff = { from: unknown; to: unknown }
  const toVal = (changes: ProposedChange, key: string): unknown =>
    key in changes ? (changes[key] as Diff).to : undefined
  const normVal = (v: unknown) => (v == null ? '' : String(v))
  // First changed field whose LIVE value no longer matches the request's `from`
  // (the document drifted since the request was filed) — don't apply stale edits.
  function firstStaleField(
    changes: ProposedChange,
    current: Record<string, unknown>,
  ): string | null {
    for (const [k, diff] of Object.entries(changes)) {
      if (normVal((diff as Diff).from) !== normVal(current[k])) return k
    }
    return null
  }
  const staleError = (k: string) => ({
    success: false as const,
    error: `"${k}" changed since this request was filed — please re-file the edit.`,
  })
  // Reverse + reissue dates the replacement at the correction date (accountant's
  // call), so a fix never lands back in an already-reported period.
  const correctionDate = () => new Date().toISOString().slice(0, 10)
  const reissueReason = (r: ChangeRequestType) =>
    `Corrected via change request #${r.id}${r.reason ? `: ${r.reason}` : ''}`
  // Backlink stamped onto the REPLACEMENT document's remarks, so a corrected
  // document points at what it superseded without needing a self-FK on
  // transactions.
  const reissueRemarks = (r: ChangeRequestType, remarks: unknown) => {
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
      : {
          success: false,
          error: 'Failed to void the expense (GL already reversed — please retry).',
        }
  }

  async function applyExpenseChange(
    request: ChangeRequestType,
    userId: string,
  ): Promise<ApplyResult> {
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

    // Memo-only edit → update in place (same document).
    if (!Object.keys(changes).some((k) => EXPENSE_LEDGER_KEYS.has(k))) {
      const txUpdate: Record<string, unknown> = {},
        detailUpdate: Record<string, unknown> = {}
      for (const [key, diff] of Object.entries(changes)) {
        const to = (diff as Diff).to
        if (EXPENSE_MEMO_TX_KEYS.has(key)) txUpdate[key] = to
        else if (EXPENSE_MEMO_DETAIL_KEYS.has(key)) detailUpdate[key] = to
      }
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
        ((toVal(changes, 'payment_method') ?? cur.payment_method) as string | undefined) ||
        undefined,
      valueDate:
        ((toVal(changes, 'paid_at') ?? correctionDate()) as string | undefined) || undefined,
      remarks: reissueRemarks(request, toVal(changes, 'remarks') ?? cur.remarks),
      department:
        ((toVal(changes, 'department') ?? fd.department) as ExpenseDepartment | undefined) ||
        undefined,
      orSiNo: ((toVal(changes, 'or_si_no') ?? fd.or_si_no) as string | undefined) || undefined,
      cashAccountId: Number(toVal(changes, 'cash_account_id') ?? cur.cash_account_id),
    }
    const v = await voidExpense(request.transaction_id, userId, reissueReason(request))
    if (!v.success) return v
    const res = await financeStore.recordExpense(merged)
    if (!res.success)
      return {
        success: false,
        error:
          'Old expense voided, but reissuing the corrected expense failed — please re-record it manually.',
      }
    return { success: true, resultId: res.expenseId, resultRef: res.expenseNo ?? undefined }
  }

  // ── Supplier payment ──────────────────────────────────────────────────────
  // Projects as 'disbursement' (DR AP / CR cash). Void reverses that + restores
  // suppliers.balance (which recordSupplierPayment decremented) + deletes the
  // row. Edit is memo-only; amount/supplier changes go through void + re-record.
  // Reverse the payment's disbursement entry + restore suppliers.balance, then
  // soft-void the document (it stays on the books, flagged).
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
    // it must land before the compensating balance restore (otherwise a failure
    // between the two would credit the supplier back for a payment still live).
    // (transactions.voided_at/voided_by/void_reason were dropped from the
    // schema — status='voided' is the only signal now.)
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

  async function applySupplierPaymentChange(
    request: ChangeRequestType,
    userId: string,
  ): Promise<ApplyResult> {
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

    // Memo-only (method/remarks) → in place.
    if (!('amount' in changes)) {
      const txUpdate: Record<string, unknown> = {}
      for (const [key, diff] of Object.entries(changes)) {
        if (key === 'payment_method' || key === 'remarks') txUpdate[key] = (diff as Diff).to
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

    // Amount edit → reverse + reissue, dated at the correction date.
    const financeStore = useFinanceDataStore()
    const merged = {
      supplierId: Number(cur.supplier_id),
      amount: Number(toVal(changes, 'amount') ?? cur.total_amount ?? 0),
      paymentMethod:
        ((toVal(changes, 'payment_method') ?? cur.payment_method) as string | undefined) ||
        undefined,
      valueDate: correctionDate(),
      remarks: reissueRemarks(request, toVal(changes, 'remarks') ?? cur.remarks),
    }
    const v = await voidSupplierPayment(request.transaction_id, userId, reissueReason(request))
    if (!v.success) return v
    const res = await financeStore.recordSupplierPayment(merged)
    if (!res.success)
      return {
        success: false,
        error:
          'Old payment voided, but reissuing the corrected payment failed — please re-record it manually.',
      }
    return { success: true, resultId: res.paymentId, resultRef: res.paymentNo ?? undefined }
  }

  // ── POS sale ──────────────────────────────────────────────────────────────
  // Reuse voidSale (restores stock, marks voided; the projection then books a
  // sales_return so the GL reverses). Sales aren't edited — void + re-ring.
  async function applySaleChange(request: ChangeRequestType): Promise<ApplyResult> {
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
  async function applyRemittanceChange(request: ChangeRequestType): Promise<ApplyResult> {
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

  // ── In-house payment / Ethical collection (both are `collections` rows) ─────
  // request.transaction_id is the ORDER's transaction id (it has to be — the
  // FK requires a real transactions row); the collection being voided/edited
  // is carried separately in proposed_changes[__collection_id], stashed at
  // propose time. Both project as 'collection' (DR Cash / CR AR). Void
  // reverses that, rolls back the collection, and rolls the order's
  // amount_paid + status back.
  // Reverse the collection's GL entry, soft-void it, then roll the order back.
  async function voidCollection(
    collectionId: number,
    userId: string,
    kind: 'inhouse' | 'ethical',
    reason: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    const { data: col } = await supabase
      .from('collections')
      .select('transaction_id, amount, voided_at')
      .eq('id', collectionId)
      .maybeSingle()
    if (!col) return { success: false, error: 'Payment not found.' }
    if (col.voided_at) return { success: false, error: 'This payment has already been voided.' }

    const rev = await reverseProjectedEntry('collection', collectionId, userId)
    if (!rev.ok)
      return {
        success: false,
        error: rev.error || 'Failed to reverse the collection journal entry.',
      }

    // Guarded on voided_at so a retry can't double-roll-back the order below.
    const { data: voided, error: voidErr } = await supabase
      .from('collections')
      .update({ voided_at: new Date().toISOString(), voided_by: userId, void_reason: reason })
      .eq('id', collectionId)
      .is('voided_at', null)
      .select('id')
    if (voidErr) return { success: false, error: voidErr.message }
    if (!voided?.length) return { success: false, error: 'This payment has already been voided.' }

    // Roll the order back: subtract the voided amount, re-derive status.
    const detailsTable = kind === 'inhouse' ? 'inhouse_details' : 'ethical_details'
    const zeroStatus = kind === 'inhouse' ? 'delivered' : 'invoiced'
    const orderId = col.transaction_id
    const { data: order } = await supabase
      .from('transactions')
      .select('total_amount')
      .eq('id', orderId)
      .maybeSingle()
    const { data: details } = await supabase
      .from(detailsTable)
      .select('amount_paid')
      .eq('transaction_id', orderId)
      .maybeSingle()
    const total = order?.total_amount ?? 0
    const newPaid = Math.max(0, (details?.amount_paid ?? 0) - (col.amount ?? 0))
    const newStatus = newPaid <= 0 ? zeroStatus : newPaid < total ? 'partial' : 'paid'
    const nowIso = new Date().toISOString()
    const { error: dErr } = await supabase
      .from(detailsTable)
      .update({ amount_paid: newPaid, paid_at: newPaid > 0 ? nowIso : null })
      .eq('transaction_id', orderId)
    if (dErr) console.warn('voidCollection: amount_paid rollback failed:', dErr.message)
    const { error: sErr } = await supabase
      .from('transactions')
      .update({ status: newStatus, updated_at: nowIso })
      .eq('id', orderId)
    if (sErr) console.warn('voidCollection: status rollback failed:', sErr.message)
    return { success: true }
  }

  async function applyCollectionChange(
    request: ChangeRequestType,
    userId: string,
    kind: 'inhouse' | 'ethical',
  ): Promise<ApplyResult> {
    const collectionId = Number(
      (request.proposed_changes?.[COLLECTION_ID_KEY] as { to?: unknown } | undefined)?.to,
    )
    if (!collectionId || Number.isNaN(collectionId))
      return { success: false, error: 'This request is missing its payment reference — please re-file it.' }

    if (request.request_type === 'void') {
      const v = await voidCollection(collectionId, userId, kind, request.reason)
      return v.success ? { success: true, resultRef: request.from_transaction_no ?? undefined } : v
    }

    const changes = stripReservedKeys(request.proposed_changes ?? {})
    const { data: cur } = await supabase
      .from('collections')
      .select('transaction_id, amount, payment_method, reference_no, remarks, voided_at')
      .eq('id', collectionId)
      .maybeSingle()
    if (!cur) return { success: false, error: 'Payment not found.' }
    if (cur.voided_at) return { success: false, error: 'This payment has already been voided.' }
    const current: Record<string, unknown> = {
      amount: cur.amount,
      payment_method: cur.payment_method,
      reference_no: cur.reference_no,
      remarks: cur.remarks,
    }
    const stale = firstStaleField(changes, current)
    if (stale) return staleError(stale)

    // Memo-only (method/reference/remarks) → in place. This path never sets a
    // status of its own (unlike void/reissue), so the 'change_request' gate
    // set at propose time must be cleared explicitly here.
    if (!('amount' in changes)) {
      const colUpdate: Record<string, unknown> = {}
      for (const [key, diff] of Object.entries(changes)) {
        if (key === 'payment_method' || key === 'reference_no' || key === 'remarks')
          colUpdate[key] = (diff as Diff).to
      }
      if (Object.keys(colUpdate).length) {
        const { error: e } = await supabase
          .from('collections')
          .update(colUpdate)
          .eq('id', collectionId)
        if (e) return { success: false, error: e.message }
      }
      const prevStatus = (request.proposed_changes?.[PREV_STATUS_KEY] as { from?: unknown } | undefined)?.from
      if (typeof prevStatus === 'string') {
        const { error: e } = await supabase
          .from('transactions')
          .update({ status: prevStatus, updated_at: new Date().toISOString() })
          .eq('id', request.transaction_id)
          .eq('status', 'change_request')
        if (e) console.warn('applyCollectionChange: failed to restore order status:', e.message)
      }
      return { success: true, resultRef: request.from_transaction_no ?? undefined }
    }

    // Amount edit → reverse the collection + re-record the corrected one.
    const payload = {
      orderId: Number(cur.transaction_id),
      amount: Number(toVal(changes, 'amount') ?? cur.amount ?? 0),
      method:
        ((toVal(changes, 'payment_method') ?? cur.payment_method) as string | undefined) ||
        undefined,
      reference:
        ((toVal(changes, 'reference_no') ?? cur.reference_no) as string | undefined) || undefined,
      remarks: reissueRemarks(request, toVal(changes, 'remarks') ?? cur.remarks),
    }
    const v = await voidCollection(collectionId, userId, kind, reissueReason(request))
    if (!v.success) return v
    const res =
      kind === 'inhouse'
        ? await useInhouseDataStore().recordPayment(payload)
        : await useEthicalDataStore().recordCollection(payload)
    if (!res.success)
      return {
        success: false,
        error:
          'Old payment voided, but reissuing the corrected payment failed — please re-record it manually.',
      }
    return {
      success: true,
      resultId: (res as any).paymentId ?? (res as any).collectionId ?? undefined,
    }
  }

  // ── Purchase Requisition unapprove ─────────────────────────────────────────
  // An "Unapprove" (void) for a PR reverts its status back to 'pending_approval'.
  // On approval, retrieve the current reference_no, stamp it as to_transaction_no
  // on the change_request row, and put the original recent_transaction_no (stored
  // as from_transaction_no) back into the transaction as recent_transaction_no
  // and reference_no. This effectively "undoes" the status progression while keeping
  // an audit trail via the change_request record.
  async function applyPRChange(request: ChangeRequestType, userId: string): Promise<ApplyResult> {
    // Only 'undo_pr' type is supported for PR unapprove
    if (request.request_type !== 'undo_pr') {
      return {
        success: false,
        error: 'Purchase requisitions can only be unapproved (undo_pr) via change request.',
      }
    }

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('id, reference_no, recent_transaction_no, status, voided_at')
      .eq('id', request.transaction_id)
      .maybeSingle()

    if (txErr || !tx) return { success: false, error: 'Transaction not found.' }
    if (tx.voided_at)
      return { success: false, error: 'This purchase requisition has already been voided.' }

    // Retrieve the current reference_no to store as to_transaction_no
    const currentRefNo = tx.reference_no
    // Use the recent_transaction_no as the from (the original doc number before progression)
    const fromRefNo = tx.recent_transaction_no ?? request.from_transaction_no ?? currentRefNo

    // Guarded update: only revert if the status is not already pending_approval
    // (prevents double-revert on retry). Status → pending_approval clears the
    // review trail so the PR can be re-evaluated.
    const { data: updated, error: updateErr } = await supabase
      .from('transactions')
      .update({
        status: 'pending_approval',
        approved_by: null,
        updated_at: new Date().toISOString(),
        reference_no: fromRefNo, // put back the original doc ref
        recent_transaction_no: fromRefNo, // also restore the recent_transaction_no
      })
      .eq('id', request.transaction_id)
      .eq('status', tx.status) // race guard: only update if status hasn't changed
      .neq('status', 'pending_approval') // don't re-revert an already-reverted PR
      .select('id, reference_no')

    if (updateErr) return { success: false, error: updateErr.message }
    if (!updated?.length)
      return {
        success: false,
        error: 'This purchase requisition was already reverted to pending approval.',
      }

    // Now update the change_request row with the to_transaction_no = current reference_no
    // This links: from_transaction_no (original ref) → to_transaction_no (current ref before revert)
    // The change_request already has from_transaction_no set at propose time.
    const { data: crUpdatedata, error: crUpdateErr } = await supabase
      .from('change_requests')
      .update({
        to_transaction_no: currentRefNo,
      })
      .eq('id', request.id)

    if (crUpdateErr) {
      console.warn(
        'applyPRChange: failed to update change_request to_transaction_no:',
        crUpdateErr.message,
      )

      // Non-fatal: the status revert already succeeded
    }

    return {
      success: true,
      resultRef: currentRefNo ?? undefined,
    }
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
    fetchAppliedEdits,
    proposeChange,
    approveRequest,
    rejectRequest,
    clearError,
    resetStore,
  }
})

