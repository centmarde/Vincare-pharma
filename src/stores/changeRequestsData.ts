import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useFinanceDataStore } from '@/stores/financeData'
import { useGLDataStore } from '@/stores/glData'
import { useSalesDataStore } from '@/stores/salesData'

const toast = useToast()

// Approval-gated change requests: a staff member proposes an EDIT or an
// UNDO/VOID to an already-entered document; an executive approves before it's
// applied. On approval, applyChange dispatches to a per-type handler that
// reuses the module's existing undo/reversal functions.
//
// NO dedicated table — the whole lifecycle lives in the existing `logs` table
// (the project's "connector = logs" convention, same shape as the Procurement
// request hand-off): a request is one `change_requested` log carrying the
// proposed diff as JSON in `description`; approve/reject are follow-up
// `change_approved` / `change_rejected` logs that reference the request log's
// id. Status is DERIVED — pending = a request log with no resolution log yet.

const ACTION_REQUEST = 'change_requested'
const ACTION_APPROVE = 'change_approved'
const ACTION_REJECT = 'change_rejected'

export type ChangeRequestTargetType =
  | 'expense' | 'supplier_payment' | 'sale' | 'remittance'
  | 'inhouse_payment' | 'ethical_collection' | 'journal_entry'

// One editable field surfaced in the proposal dialog. `value` is the current
// value (prefilled) so the dialog can compute the diff automatically.
export type ChangeRequestField = {
  key: string
  label: string
  value: string | number | null
  type: 'text' | 'number' | 'select' | 'date'
  items?: { title: string; value: string | number }[]
}

export type ProposedChange = Record<string, { from: unknown; to: unknown }>

export type ChangeRequestType = {
  id: number               // the request log's id
  created_at: string
  module: string
  target_type: ChangeRequestTargetType
  target_id: number
  target_ref: string | null
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
  result_ref: string | null
}

export type ProposeChangePayload = {
  module: string
  targetType: ChangeRequestTargetType
  targetId: number
  targetRef?: string | null
  requestType: 'edit' | 'void'
  proposedChanges?: ProposedChange
  summary?: string
  reason?: string
}

// The JSON payload stored in a `change_requested` log's description.
type RequestPayload = {
  target_type: ChangeRequestTargetType
  target_id: number
  target_ref: string | null
  request_type: 'edit' | 'void'
  proposed_changes: ProposedChange
  summary: string | null
  reason: string | null
}
// The JSON payload stored in a resolution log's description.
type ResolutionPayload = {
  request_log_id: number
  note: string | null
  result_ref: string | null
}

function safeParse<T>(text: string | null): T | null {
  if (!text) return null
  try { return JSON.parse(text) as T } catch { return null }
}

export const useChangeRequestsDataStore = defineStore('changeRequestsData', () => {
  const authStore = useAuthUserStore()

  const requests: Ref<ChangeRequestType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const pendingCount = computed(() => requests.value.filter((r) => r.status === 'pending').length)

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }
  const clearError = () => { error.value = '' }

  // Fetch every change_* log and fold it into the derived request view-model.
  // At this app's volume (change requests are rare) a single unfiltered read
  // of the change_* logs is trivial; bound by created_at later if it ever grows.
  async function loadAllRequests(): Promise<ChangeRequestType[]> {
    const { data, error: fetchError } = await supabase
      .from('logs')
      .select('id, created_at, action, description, module, created_by')
      .in('action', [ACTION_REQUEST, ACTION_APPROVE, ACTION_REJECT])
      .order('created_at', { ascending: false })
    if (fetchError) { handleError(fetchError, 'Failed to fetch change requests'); return [] }
    const rows = data || []

    // Index resolutions by the request log id they point at.
    const resolutions = new Map<number, { action: string; note: string | null; result_ref: string | null; by: string | null; at: string }>()
    for (const r of rows) {
      if (r.action !== ACTION_APPROVE && r.action !== ACTION_REJECT) continue
      const p = safeParse<ResolutionPayload>(r.description)
      if (p?.request_log_id != null && !resolutions.has(p.request_log_id)) {
        resolutions.set(p.request_log_id, { action: r.action, note: p.note ?? null, result_ref: p.result_ref ?? null, by: r.created_by, at: r.created_at })
      }
    }

    const out: ChangeRequestType[] = []
    for (const r of rows) {
      if (r.action !== ACTION_REQUEST) continue
      const p = safeParse<RequestPayload>(r.description)
      if (!p) continue
      const res = resolutions.get(r.id)
      out.push({
        id: r.id,
        created_at: r.created_at,
        module: r.module,
        target_type: p.target_type,
        target_id: p.target_id,
        target_ref: p.target_ref ?? null,
        request_type: p.request_type,
        proposed_changes: p.proposed_changes ?? {},
        summary: p.summary ?? null,
        reason: p.reason ?? null,
        status: res ? (res.action === ACTION_APPROVE ? 'approved' : 'rejected') : 'pending',
        created_by: r.created_by,
        resolved_by: res?.by ?? null,
        resolved_at: res?.at ?? null,
        resolution_note: res?.note ?? null,
        result_ref: res?.result_ref ?? null,
      })
    }
    return out
  }

  const fetchRequests = async (options: { status?: 'pending' | 'approved' | 'rejected'; module?: string } = {}) => {
    loading.value = true
    clearError()
    try {
      let all = await loadAllRequests()
      if (options.status) all = all.filter((r) => r.status === options.status)
      if (options.module) all = all.filter((r) => r.module === options.module)

      if (!authStore.users.length) await authStore.getAllUsers()
      requests.value = all.map((r) => ({
        ...r,
        created_by_email: authStore.users.find((u: any) => u.id === r.created_by)?.email ?? null,
      }))
      return requests.value
    } catch (err) {
      handleError(err, 'Failed to fetch change requests')
      return []
    } finally {
      loading.value = false
    }
  }

  const hasPendingRequest = async (targetType: ChangeRequestTargetType, targetId: number): Promise<boolean> => {
    const all = await loadAllRequests()
    return all.some((r) => r.status === 'pending' && r.target_type === targetType && r.target_id === targetId)
  }

  // Which documents of this type currently have a pending request (drives the
  // "Change pending" chip on a list view).
  const fetchPendingTargetIds = async (targetType: ChangeRequestTargetType): Promise<number[]> => {
    const all = await loadAllRequests()
    return all.filter((r) => r.status === 'pending' && r.target_type === targetType).map((r) => r.target_id)
  }

  const proposeChange = async (payload: ProposeChangePayload) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    if (await hasPendingRequest(payload.targetType, payload.targetId)) {
      toast.warning('There is already a pending change request for this document.')
      loading.value = false
      return { success: false }
    }

    const requestPayload: RequestPayload = {
      target_type: payload.targetType,
      target_id: payload.targetId,
      target_ref: payload.targetRef ?? null,
      request_type: payload.requestType,
      proposed_changes: payload.proposedChanges ?? {},
      summary: payload.summary ?? null,
      reason: payload.reason ?? null,
    }

    const { data, error: insertError } = await supabase.from('logs').insert({
      created_by: user.id, action: ACTION_REQUEST, module: payload.module,
      description: JSON.stringify(requestPayload),
      transaction_id: isTransactionTarget(payload.targetType) ? payload.targetId : null,
    }).select('id').single()

    if (insertError || !data) {
      handleError(insertError, 'Failed to submit change request.')
      toast.error(insertError?.message || 'Failed to submit change request.')
      loading.value = false
      return { success: false }
    }

    toast.success('Change request submitted for approval.')
    loading.value = false
    return { success: true, requestId: data.id }
  }

  const rejectRequest = async (requestLogId: number, reason: string) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const request = (await loadAllRequests()).find((r) => r.id === requestLogId)
    if (!request || request.status !== 'pending') {
      toast.error('Pending change request not found.'); loading.value = false; return { success: false }
    }

    const ok = await writeResolution(requestLogId, request, user.id, ACTION_REJECT, { note: reason || 'Rejected by approver.', result_ref: null })
    loading.value = false
    if (!ok) return { success: false }
    toast.success('Change request rejected.')
    await fetchRequests({ status: 'pending' })
    return { success: true }
  }

  // Approve: apply the change first (dispatch by target_type), and only write
  // the resolution log if the apply succeeded — a failed apply leaves the
  // request pending so it can be retried. Self-approval is allowed.
  const approveRequest = async (requestLogId: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const request = (await loadAllRequests()).find((r) => r.id === requestLogId)
    if (!request || request.status !== 'pending') {
      toast.error('Pending change request not found.'); loading.value = false; return { success: false }
    }

    const applied = await applyChange(request, user.id)
    if (!applied.success) {
      toast.error(applied.error || 'Failed to apply the change; request left pending.')
      loading.value = false
      return { success: false }
    }

    // The change is applied at this point; the resolution log is what flips the
    // request out of 'pending'. If it fails to write, the change stuck but the
    // request would still show pending — surface that rather than reporting a
    // clean success.
    const wrote = await writeResolution(requestLogId, request, user.id, ACTION_APPROVE, { note: 'Applied.', result_ref: applied.resultRef ?? null })
    if (!wrote) {
      toast.warning('Change applied, but recording the approval failed — the request may still show as pending.')
    } else {
      toast.success('Change request approved and applied.')
    }
    await fetchRequests({ status: 'pending' })
    loading.value = false
    return { success: true }
  }

  async function writeResolution(
    requestLogId: number,
    request: ChangeRequestType,
    userId: string,
    action: typeof ACTION_APPROVE | typeof ACTION_REJECT,
    extra: { note: string | null; result_ref: string | null },
  ): Promise<boolean> {
    const payload: ResolutionPayload = { request_log_id: requestLogId, note: extra.note, result_ref: extra.result_ref }
    // transaction_id is intentionally null: a resolution links to its request
    // via request_log_id (in the description), and a void may have just DELETED
    // the target transaction — FK-ing to it here would fail the insert and
    // leave the request stuck showing 'pending' even though it was applied.
    const { error: e } = await supabase.from('logs').insert({
      created_by: userId, action, module: request.module,
      description: JSON.stringify(payload),
      transaction_id: null,
    })
    if (e) { handleError(e, 'Failed to record the approval decision.'); toast.error(e.message || 'Failed to record the approval decision.'); return false }
    return true
  }

  // ─── Apply dispatch ─────────────────────────────────────────────────────────
  // Reuses each module's existing undo/reversal where possible. Phase 1 wires
  // 'expense'; other target types return a not-yet-supported error so approving
  // one fails gracefully (only expense requests can be created in Phase 1).
  async function applyChange(request: ChangeRequestType, userId: string): Promise<{ success: boolean; resultRef?: string; error?: string }> {
    switch (request.target_type) {
      case 'expense':            return applyExpenseChange(request, userId)
      case 'supplier_payment':   return applySupplierPaymentChange(request, userId)
      case 'sale':               return applySaleChange(request)
      case 'remittance':         return applyRemittanceChange(request)
      case 'inhouse_payment':    return applyCollectionVoid(request, userId, 'inhouse')
      case 'ethical_collection': return applyCollectionVoid(request, userId, 'ethical')
      case 'journal_entry':      return applyJournalEntryChange(request, userId)
      default:
        return { success: false, error: `Change requests for "${request.target_type}" are not enabled yet.` }
    }
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
    const { data: je } = await supabase.from('journal_entries')
      .select('id')
      .eq('reference_type', referenceType).eq('reference_id', referenceId)
      .eq('status', 'posted').is('reverses_entry', null)
      .maybeSingle()
    if (!je) return { ok: true }
    const rev = await gl.reverseJournalEntry(je.id, userId)
    return rev.success ? { ok: true } : { ok: false, error: rev.error }
  }

  // Ledger-affecting fields — an expense edit may NOT change these in place
  // (they'd desync the GL, which the projection won't re-book). Value/account/
  // date corrections go through Void + re-record, per the "correct by reversal,
  // never edit a posted record in place" rule. Only the memo fields below edit
  // in place (they never appear in the expense's journal entry).
  const EXPENSE_LEDGER_KEYS = new Set(['amount', 'category', 'cash_account_id', 'paid_at'])
  const EXPENSE_MEMO_TX_KEYS = new Set(['payment_method', 'remarks'])
  const EXPENSE_MEMO_DETAIL_KEYS = new Set(['paid_to', 'department', 'or_si_no'])

  async function applyExpenseChange(request: ChangeRequestType, userId: string): Promise<{ success: boolean; resultRef?: string; error?: string }> {
    const financeStore = useFinanceDataStore()

    // VOID = reverse the expense's projected GL entry (if it was booked), then
    // delete + restore the cash balance. Expenses project as
    // (reference_type='disbursement', reference_id=expense id); a never-projected
    // expense simply has no entry to reverse (deleting the source is enough).
    if (request.request_type === 'void') {
      const rev = await reverseProjectedEntry('disbursement', request.target_id, userId)
      if (!rev.ok) return { success: false, error: rev.error || 'Failed to reverse the expense journal entry.' }
      const result = await financeStore.deleteExpense(request.target_id)
      return result.success
        ? { success: true, resultRef: request.target_ref ?? undefined }
        : { success: false, error: 'Failed to delete the expense (GL already reversed — please retry the delete).' }
    }

    // EDIT = memo fields only. Reject a ledger-field change outright so the
    // approver is never misled into thinking an amount/account/date change was
    // applied when it can't be (it must be a Void + re-record instead).
    const changes = request.proposed_changes ?? {}
    const ledgerHit = Object.keys(changes).find((k) => EXPENSE_LEDGER_KEYS.has(k))
    if (ledgerHit) {
      return { success: false, error: `"${ledgerHit}" changes the ledger — use Void + re-record instead of an edit.` }
    }

    const txUpdate: Record<string, unknown> = {}
    const detailUpdate: Record<string, unknown> = {}
    for (const [key, diff] of Object.entries(changes)) {
      const to = (diff as { to: unknown }).to
      if (EXPENSE_MEMO_TX_KEYS.has(key)) txUpdate[key] = to
      else if (EXPENSE_MEMO_DETAIL_KEYS.has(key)) detailUpdate[key] = to
    }

    if (Object.keys(txUpdate).length) {
      const { error: e } = await supabase.from('transactions').update(txUpdate).eq('id', request.target_id)
      if (e) return { success: false, error: e.message }
    }
    if (Object.keys(detailUpdate).length) {
      const { error: e } = await supabase.from('finance_details').update(detailUpdate).eq('transaction_id', request.target_id)
      if (e) return { success: false, error: e.message }
    }

    return { success: true, resultRef: request.target_ref ?? undefined }
  }

  // ── Supplier payment ──────────────────────────────────────────────────────
  // Projects as 'disbursement' (DR AP / CR cash). Void reverses that + restores
  // suppliers.balance (which recordSupplierPayment decremented) + deletes the
  // row. Edit is memo-only; amount/supplier changes go through void + re-record.
  async function applySupplierPaymentChange(request: ChangeRequestType, userId: string): Promise<{ success: boolean; resultRef?: string; error?: string }> {
    const changes = request.proposed_changes ?? {}
    if (request.request_type === 'edit') {
      const ledgerHit = Object.keys(changes).find((k) => k === 'amount' || k === 'supplier_id')
      if (ledgerHit) return { success: false, error: `"${ledgerHit}" changes the ledger — use Void + re-record instead of an edit.` }
      const txUpdate: Record<string, unknown> = {}
      for (const [key, diff] of Object.entries(changes)) {
        if (key === 'payment_method' || key === 'remarks') txUpdate[key] = (diff as { to: unknown }).to
      }
      if (Object.keys(txUpdate).length) {
        const { error: e } = await supabase.from('transactions').update(txUpdate).eq('id', request.target_id)
        if (e) return { success: false, error: e.message }
      }
      return { success: true, resultRef: request.target_ref ?? undefined }
    }

    const { data: pay } = await supabase.from('transactions')
      .select('supplier_id, total_amount').eq('id', request.target_id).eq('transaction_type', 'supplier_payment').maybeSingle()
    if (!pay) return { success: false, error: 'Supplier payment not found.' }

    const rev = await reverseProjectedEntry('disbursement', request.target_id, userId)
    if (!rev.ok) return { success: false, error: rev.error || 'Failed to reverse the payment journal entry.' }

    if (pay.supplier_id) {
      const { data: s } = await supabase.from('suppliers').select('balance').eq('id', pay.supplier_id).maybeSingle()
      if (s) {
        const { error: e } = await supabase.from('suppliers').update({ balance: (s.balance ?? 0) + (pay.total_amount ?? 0) }).eq('id', pay.supplier_id)
        if (e) console.warn('applySupplierPaymentChange: suppliers.balance restore failed:', e.message)
      }
    }

    const { error: delErr } = await supabase.from('transactions').delete().eq('id', request.target_id).eq('transaction_type', 'supplier_payment')
    if (delErr) return { success: false, error: delErr.message }
    return { success: true, resultRef: request.target_ref ?? undefined }
  }

  // ── POS sale ──────────────────────────────────────────────────────────────
  // Reuse voidSale (restores stock, marks voided; the projection then books a
  // sales_return so the GL reverses). Sales aren't edited — void + re-ring.
  async function applySaleChange(request: ChangeRequestType): Promise<{ success: boolean; resultRef?: string; error?: string }> {
    if (request.request_type === 'edit') return { success: false, error: 'A sale cannot be edited — void it and re-ring instead.' }
    const salesStore = useSalesDataStore()
    const result = await salesStore.voidSale(request.target_id, request.reason ?? 'Voided via change request')
    return result.success
      ? { success: true, resultRef: request.target_ref ?? undefined }
      : { success: false, error: 'Failed to void the sale (it may already be remitted).' }
  }

  // ── Remittance ────────────────────────────────────────────────────────────
  // Remittances are GL-silent (a cash-reconciliation artifact), so correcting
  // the counted amount / notes in place is safe. Edit only — no void.
  async function applyRemittanceChange(request: ChangeRequestType): Promise<{ success: boolean; resultRef?: string; error?: string }> {
    if (request.request_type === 'void') return { success: false, error: 'A remittance is corrected by editing the counted amount, not voided.' }
    const changes = request.proposed_changes ?? {}
    const detailUpdate: Record<string, unknown> = {}
    const txUpdate: Record<string, unknown> = {}
    for (const [key, diff] of Object.entries(changes)) {
      const to = (diff as { to: unknown }).to
      if (key === 'actual_amount') detailUpdate.actual_amount = to
      else if (key === 'notes') txUpdate.remarks = to
    }
    if (Object.keys(detailUpdate).length) {
      const { error: e } = await supabase.from('remittance_details').update(detailUpdate).eq('transaction_id', request.target_id)
      if (e) return { success: false, error: e.message }
    }
    if (Object.keys(txUpdate).length) {
      const { error: e } = await supabase.from('transactions').update(txUpdate).eq('id', request.target_id)
      if (e) return { success: false, error: e.message }
    }
    return { success: true, resultRef: request.target_ref ?? undefined }
  }

  // ── In-house payment / Ethical collection (both are `collections` rows) ─────
  // target_id is the collection id. Both project as 'collection' (DR Cash / CR
  // AR). Void reverses that, deletes the collection, and rolls the order's
  // amount_paid + status back. Payments aren't edited — void + re-record.
  async function applyCollectionVoid(request: ChangeRequestType, userId: string, kind: 'inhouse' | 'ethical'): Promise<{ success: boolean; resultRef?: string; error?: string }> {
    if (request.request_type === 'edit') return { success: false, error: 'A payment cannot be edited — void it and re-record instead.' }

    const { data: col } = await supabase.from('collections')
      .select('transaction_id, amount').eq('id', request.target_id).maybeSingle()
    if (!col) return { success: false, error: 'Payment not found.' }

    const rev = await reverseProjectedEntry('collection', request.target_id, userId)
    if (!rev.ok) return { success: false, error: rev.error || 'Failed to reverse the collection journal entry.' }

    const { error: delErr } = await supabase.from('collections').delete().eq('id', request.target_id)
    if (delErr) return { success: false, error: delErr.message }

    // Roll the order back: subtract the voided amount, re-derive status.
    const detailsTable = kind === 'inhouse' ? 'inhouse_details' : 'ethical_details'
    const zeroStatus = kind === 'inhouse' ? 'delivered' : 'invoiced'
    const orderId = col.transaction_id
    const { data: order } = await supabase.from('transactions').select('total_amount').eq('id', orderId).maybeSingle()
    const { data: details } = await supabase.from(detailsTable).select('amount_paid').eq('transaction_id', orderId).maybeSingle()
    const total = order?.total_amount ?? 0
    const newPaid = Math.max(0, (details?.amount_paid ?? 0) - (col.amount ?? 0))
    const newStatus = newPaid <= 0 ? zeroStatus : (newPaid < total ? 'partial' : 'paid')
    const nowIso = new Date().toISOString()
    const { error: dErr } = await supabase.from(detailsTable).update({ amount_paid: newPaid, paid_at: newPaid > 0 ? nowIso : null }).eq('transaction_id', orderId)
    if (dErr) console.warn('applyCollectionVoid: amount_paid rollback failed:', dErr.message)
    const { error: sErr } = await supabase.from('transactions').update({ status: newStatus, updated_at: nowIso }).eq('id', orderId)
    if (sErr) console.warn('applyCollectionVoid: status rollback failed:', sErr.message)

    return { success: true, resultRef: request.target_ref ?? undefined }
  }

  // ── GL journal entry ────────────────────────────────────────────────────────
  // A posted entry is corrected by reversal, never edited. Reuse the GL
  // reversal (posts a mirror + flips the original to 'reversed').
  async function applyJournalEntryChange(request: ChangeRequestType, userId: string): Promise<{ success: boolean; resultRef?: string; error?: string }> {
    if (request.request_type === 'edit') return { success: false, error: 'A posted journal entry is corrected by reversal, not edited.' }
    const gl = useGLDataStore()
    const rev = await gl.reverseJournalEntry(request.target_id, userId)
    return rev.success
      ? { success: true, resultRef: request.target_ref ?? undefined }
      : { success: false, error: rev.error || 'Failed to reverse the journal entry.' }
  }

  function isTransactionTarget(t: ChangeRequestTargetType): boolean {
    // These target a `transactions` row, so their id is a valid logs.transaction_id.
    // inhouse_payment/ethical_collection target a `collections` row and
    // journal_entry a `journal_entries` row — those get a null transaction_id.
    return t === 'expense' || t === 'supplier_payment' || t === 'sale' || t === 'remittance'
  }

  const resetStore = () => {
    requests.value = []
    loading.value = false
    error.value = ''
  }

  return {
    requests, loading, error, pendingCount,
    fetchRequests, hasPendingRequest, fetchPendingTargetIds, proposeChange, approveRequest, rejectRequest,
    clearError, resetStore,
  }
})
