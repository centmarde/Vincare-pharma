import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useInhouseDataStore } from '@/stores/inhouseData'
import { useEthicalDataStore } from '@/stores/ethicalData'
import { useStockSourcingStore } from '@/stores/stockSourcingData'
import type { StockLocationId } from '@/stores/stockSourcingData'
import { getErrorMessage } from '@/utils/helpers'
import { parseProposedChanges } from '@/utils/changeRequests'
import {
  lockTermsRequestType, unlockTermsRequestType, termsRequestTypes, unlockBlocker,
} from '@/stores/shared/termsApprovalGuards'

// Executive approval to LOCK an order's terms (In-House "Agree", Ethical
// "Invoice") and to UNLOCK them again.
//
// Built the way the other approvals are: a row in change_requests per request
// (the short-dated delivery approval and the PR unapprove), shown to the
// executives in Action Required, approved or rejected there, and logged.
// request_type has no CHECK constraint, so the two new types need no schema
// change.
//
// One deliberate difference from the PR unapprove: the order is NOT parked on
// a 'change_request' status while a request is pending. Order statuses feed the
// ledger (an Ethical order is booked whenever it is not draft or cancelled) and
// receivables, so a new status value would ripple through both. The pending
// request itself is the lock — the order stores refuse edits while one exists
// (termsApprovalGuards) — and everything is re-checked when it is approved.

export type TermsOrderType = 'inhouse_order' | 'ethical_order'
export type TermsRequestType = typeof lockTermsRequestType | typeof unlockTermsRequestType

export type TermsLine = { product_name: string; qty: number; unit_price: number; line_total: number }

export type TermsRequest = {
  id: number
  created_at: string
  transaction_id: number
  request_type: TermsRequestType
  status: 'pending' | 'approved' | 'rejected'
  summary: string | null
  reason: string | null
  created_by: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  order_type: TermsOrderType | null
  /** The order's number, or "Draft #id" for an Ethical draft that has none yet. */
  order_no: string | null
  customer_name: string | null
  /** The terms as they stood when the request was filed — what is being approved. */
  total: number | null
  lines: TermsLine[]
}

/** One line as the executive sees it: what is sold, at what price, and at what cost. */
export type DecisionLine = {
  product_name: string
  unit: string | null
  batch_no: string | null
  expiry_date: string | null
  qty: number
  unit_price: number
  line_total: number
  /** Company cost per unit — the line's snapshot, else the product master's; null if neither. */
  cost_unit: number | null
}

export type DecisionShortLine = { product_name: string; needed: number; available: number; expired: boolean }

/**
 * Everything an executive needs to decide on a terms request, read LIVE when
 * they open it. Live is safe: the order is frozen while a lock request is
 * pending, so it is exactly what was sent — and it covers requests filed
 * before this view existed.
 */
export type TermsDecision = {
  order_type: TermsOrderType
  order_no: string | null
  order_date: string | null
  status: string | null
  remarks: string | null
  customer: { name: string | null; agency_type: string | null; area: string | null; term_days: string | null } | null
  requested_by: string | null
  total: number
  lines: DecisionLine[]
  // In-House
  govt_pr_no: string | null
  govt_pr_amount: number | null
  po_no: string | null
  negotiation_rounds: number
  last_round: string | null
  // Ethical
  agent_name: string | null
  discount: number
  rebate: number
  ads: number
  terms_days: number | null
  /** Stock on the day of the decision: null when it could not be read, or does
   *  not apply (an unapprove — the stock already moved). */
  short_lines: DecisionShortLine[] | null
}

const requestSelect = `
  id, created_at, transaction_id, request_type, proposed_changes,
  summary, reason, status, created_by, resolved_by, resolved_at, resolution_note,
  transactions!inner ( transaction_type, inhouse_no, ethical_no, reference_no, customer:customer_id ( name ) )
`

const orderLabel = (type: TermsOrderType | null, no: string | null, id: number) =>
  no ?? (type === 'ethical_order' ? `Draft #${id}` : `Order #${id}`)

function mapRow(row: any): TermsRequest {
  const proposed = parseProposedChanges(row.proposed_changes) as unknown as { total?: unknown; lines?: unknown }
  const tx = row.transactions ?? {}
  const type = (tx.transaction_type ?? null) as TermsOrderType | null
  return {
    id: row.id,
    created_at: row.created_at,
    transaction_id: row.transaction_id,
    request_type: row.request_type,
    status: row.status,
    summary: row.summary ?? null,
    reason: row.reason ?? null,
    created_by: row.created_by ?? null,
    resolved_by: row.resolved_by ?? null,
    resolved_at: row.resolved_at ?? null,
    resolution_note: row.resolution_note ?? null,
    order_type: type,
    order_no: tx.inhouse_no ?? tx.ethical_no ?? tx.reference_no ?? null,
    customer_name: tx.customer?.name ?? null,
    total: typeof proposed.total === 'number' ? proposed.total : null,
    lines: Array.isArray(proposed.lines) ? (proposed.lines as TermsLine[]) : [],
  }
}

/** A request the requester took back. Stored as 'rejected' (the status set is
 *  pending / approved / rejected) with this note, which tells the two apart. */
export const withdrawnNote = 'Withdrawn by the requester.'
export const isWithdrawn = (r: TermsRequest | null | undefined) =>
  r?.status === 'rejected' && r.resolution_note === withdrawnNote

const moduleFor = (type: TermsOrderType) => (type === 'inhouse_order' ? 'inhouse' : 'ethical')

export const useTermsApprovalStore = defineStore('termsApproval', () => {
  const toast = useToast()
  const authStore = useAuthUserStore()

  const requests: Ref<TermsRequest[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const pendingRequests = computed(() => requests.value.filter((r) => r.status === 'pending'))

  function handleError(err: unknown, fallback: string) {
    console.error(err)
    error.value = getErrorMessage(err) || fallback
  }

  async function log(type: TermsOrderType, orderId: number, action: string, description: string) {
    const { user } = await authStore.getCurrentUser()
    const { error: logError } = await supabase.from('logs').insert({
      created_by: user?.id ?? null, action, description, module: moduleFor(type), transaction_id: orderId,
    })
    if (logError) console.warn(`termsApproval: activity log (${action}) failed:`, logError.message)
  }

  // ── Reading ──────────────────────────────────────────────────────────────

  async function fetchRequests(options: { status?: TermsRequest['status'] } = {}) {
    loading.value = true
    error.value = ''
    try {
      let query = supabase
        .from('change_requests')
        .select(requestSelect)
        .in('request_type', termsRequestTypes)
        // Scoped like every other change-request reader: the table is shared.
        .in('transactions.transaction_type', ['inhouse_order', 'ethical_order'])
        .order('created_at', { ascending: false })
      if (options.status) query = query.eq('status', options.status)
      const { data, error: fetchError } = await query
      if (fetchError) throw fetchError
      requests.value = (data ?? []).map(mapRow)
      return requests.value
    } catch (err) {
      handleError(err, 'Failed to load terms approval requests')
      return []
    } finally {
      loading.value = false
    }
  }

  /** The latest terms request on an order, any status — drives its buttons. */
  async function requestFor(orderId: number): Promise<TermsRequest | null> {
    const { data, error: lookupError } = await supabase
      .from('change_requests')
      .select(requestSelect)
      .eq('transaction_id', orderId)
      .in('request_type', termsRequestTypes)
      .order('created_at', { ascending: false })
      .limit(1)
    if (lookupError) {
      handleError(lookupError, 'Failed to load the approval request')
      return null
    }
    const row = (data ?? [])[0]
    return row ? mapRow(row) : null
  }

  /** Orders of one type with a request awaiting a decision — for list chips. */
  async function pendingOrderIds(type: TermsOrderType): Promise<Set<number>> {
    const { data, error: lookupError } = await supabase
      .from('change_requests')
      .select('transaction_id, request_type, transactions!inner(transaction_type)')
      .in('request_type', termsRequestTypes)
      .eq('status', 'pending')
      .eq('transactions.transaction_type', type)
    if (lookupError) return new Set()
    return new Set((data ?? []).map((r: any) => r.transaction_id as number))
  }

  // ── The decision view ────────────────────────────────────────────────────

  async function fetchDecisionDetails(
    orderId: number,
    orderType: TermsOrderType,
    requestType: TermsRequestType,
    requestedBy: string | null,
  ): Promise<TermsDecision | null> {
    const { data: o, error: readError } = await supabase
      .from('transactions')
      .select(`
        id, status, total_amount, remarks, po_no, po_amount, inhouse_no, ethical_no, created_at, warehouse_id,
        customer:customer_id ( name, agency_type, area, term_days ),
        agent:agent_id ( name ),
        inhouse_details ( govt_po_no ),
        ethical_details ( discount_amount, rebate_amount, ads_amount, terms_days ),
        transaction_items!transaction_items_transaction_id_fkey (
          product_id, qty_stock_out, unit_price, line_total, cost_price,
          product:product_id ( product_name, unit, cost_price, batch_no, expiry_date )
        )
      `)
      .eq('id', orderId)
      .maybeSingle()
    if (readError || !o) {
      handleError(readError, 'Failed to load the order')
      return null
    }
    const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))
    const row = o as any
    const items = (row.transaction_items ?? []) as any[]
    const lines: DecisionLine[] = items.map((li) => {
      const qty = Number(li.qty_stock_out ?? 0)
      const unitPrice = Number(li.unit_price ?? 0)
      const cost = li.cost_price ?? li.product?.cost_price
      return {
        product_name: li.product?.product_name ?? 'Unknown product',
        unit: li.product?.unit ?? null,
        batch_no: li.product?.batch_no ?? null,
        expiry_date: li.product?.expiry_date ?? null,
        qty,
        unit_price: unitPrice,
        line_total: li.line_total != null ? Number(li.line_total) : qty * unitPrice,
        cost_unit: cost != null ? Number(cost) : null,
      }
    })
    const nameOf = (productId: number) =>
      items.find((li) => li.product_id === productId)?.product?.product_name ?? `Product #${productId}`

    // Stock today — only for a LOCK: an unapprove's stock has already moved.
    let shortLines: DecisionShortLine[] | null = null
    if (requestType === lockTermsRequestType) {
      if (orderType === 'inhouse_order') {
        const shortfall = await useInhouseDataStore().computeShortfall(orderId)
        shortLines = shortfall.map((sf) => ({
          product_name: nameOf(sf.product_id),
          needed: sf.ordered,
          available: sf.on_hand,
          expired: sf.blocked_reason === 'expired',
        }))
      } else {
        const plan = await useStockSourcingStore().planSourcing(
          (row.warehouse_id ?? null) as StockLocationId,
          items.map((li) => ({ product_id: li.product_id as number, quantity: Number(li.qty_stock_out ?? 0) })),
        )
        shortLines = plan
          ? plan.filter((p) => p.short > 0).map((p) => ({
              product_name: nameOf(p.product_id), needed: p.need, available: p.take, expired: p.expired,
            }))
          : null
      }
    }

    // Offers and counter-offers only — the negotiation log also carries 'agree',
    // which is a decision, not a round of haggling.
    let rounds: { action: string | null; description: string | null }[] = []
    if (orderType === 'inhouse_order') {
      rounds = (await useInhouseDataStore().fetchNegotiation(orderId)).filter((r) => r.action !== 'agree')
    }

    let requesterName: string | null = null
    if (requestedBy) {
      if (!authStore.users.length) await authStore.getAllUsers()
      const u = authStore.users.find((x: any) => x.id === requestedBy) as any
      requesterName = u?.full_name || u?.email || null
    }

    const customer = one(row.customer)
    const ethical = one(row.ethical_details) as any
    const inhouse = one(row.inhouse_details) as any
    return {
      order_type: orderType,
      order_no: row.inhouse_no ?? row.ethical_no ?? null,
      order_date: row.created_at ?? null,
      status: row.status ?? null,
      remarks: row.remarks ?? null,
      customer: customer
        ? { name: customer.name ?? null, agency_type: customer.agency_type ?? null, area: customer.area ?? null, term_days: customer.term_days ?? null }
        : null,
      requested_by: requesterName,
      total: Number(row.total_amount ?? 0),
      lines,
      govt_pr_no: inhouse?.govt_po_no ?? null,
      govt_pr_amount: row.po_amount != null ? Number(row.po_amount) : null,
      po_no: row.po_no ?? null,
      negotiation_rounds: rounds.length,
      last_round: rounds.length ? rounds[rounds.length - 1].description ?? null : null,
      agent_name: one(row.agent)?.name ?? null,
      discount: Number(ethical?.discount_amount ?? 0),
      rebate: Number(ethical?.rebate_amount ?? 0),
      ads: Number(ethical?.ads_amount ?? 0),
      terms_days: ethical?.terms_days ?? null,
      short_lines: shortLines,
    }
  }

  // ── Filing ───────────────────────────────────────────────────────────────

  /** The order's terms as they stand now — stored on the request so the
   *  executive sees exactly what they are approving. */
  async function snapshot(orderId: number) {
    const { data, error: readError } = await supabase
      .from('transactions')
      .select('total_amount, transaction_items!transaction_items_transaction_id_fkey(qty_stock_out, unit_price, line_total, product:product_id(product_name))')
      .eq('id', orderId)
      .maybeSingle()
    if (readError || !data) return null
    const lines: TermsLine[] = ((data.transaction_items ?? []) as any[]).map((li) => {
      const qty = Number(li.qty_stock_out ?? 0)
      const unitPrice = Number(li.unit_price ?? 0)
      return {
        product_name: li.product?.product_name ?? 'Unknown product',
        qty,
        unit_price: unitPrice,
        line_total: li.line_total != null ? Number(li.line_total) : qty * unitPrice,
      }
    })
    return { total: Number(data.total_amount ?? 0), lines }
  }

  async function file(payload: {
    orderId: number
    orderType: TermsOrderType
    requestType: TermsRequestType
    orderNo: string | null
    reason?: string | null
    /** Statuses the order must be in for this request to make sense. */
    allowedStatuses: string[]
    wrongStatusMessage: string
  }): Promise<{ success: boolean }> {
    loading.value = true
    error.value = ''
    const { orderId, orderType, requestType, orderNo, reason = null } = payload
    const label = orderLabel(orderType, orderNo, orderId)
    try {
      const { user, error: authError } = await authStore.getCurrentUser()
      if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }

      const { data: order, error: orderError } = await supabase
        .from('transactions').select('status').eq('id', orderId).eq('transaction_type', orderType).maybeSingle()
      if (orderError || !order) { toast.error('Order not found.'); return { success: false } }
      if (!payload.allowedStatuses.includes(order.status as string)) { toast.error(payload.wrongStatusMessage); return { success: false } }

      // One open request per order: a second would hand the executives two
      // decisions about the same terms.
      const { data: open, error: openError } = await supabase
        .from('change_requests').select('id').eq('transaction_id', orderId)
        .in('request_type', termsRequestTypes).eq('status', 'pending').limit(1)
      if (openError) throw openError
      if (open?.length) { toast.info('A request for this order is already awaiting a decision.'); return { success: false } }

      if (requestType === unlockTermsRequestType) {
        const blocker = await unlockBlocker(orderId)
        if (blocker) { toast.error(`Cannot unapprove: ${blocker}`); return { success: false } }
      }

      const terms = await snapshot(orderId)
      if (!terms) { toast.error('Could not read the order\'s terms. Try again.'); return { success: false } }

      const summary = requestType === lockTermsRequestType
        ? `Approve the terms of ${label} — lock ${terms.lines.length} line(s)`
        : `Unapprove the terms of ${label} — back to ${orderType === 'inhouse_order' ? 'negotiation' : 'draft'}`

      const { error: insertError } = await supabase.from('change_requests').insert({
        transaction_id: orderId,
        from_transaction_no: orderNo,
        request_type: requestType,
        status: 'pending',
        summary,
        reason,
        // Text column: written as JSON text, parsed on read (see utils/changeRequests).
        proposed_changes: JSON.stringify(terms),
        created_by: user.id,
      })
      if (insertError) throw insertError

      await log(orderType, orderId, `${requestType}_requested`, summary + (reason ? ` — ${reason}` : ''))
      toast.success('Sent to the executives for approval.')
      return { success: true }
    } catch (err) {
      handleError(err, 'Failed to request approval')
      toast.error(error.value || 'Failed to request approval.')
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  /** Staff: ask to lock the terms (In-House Agree / Ethical Invoice). */
  function requestLock(payload: { orderId: number; orderType: TermsOrderType; orderNo: string | null; reason?: string | null }) {
    return file({
      ...payload,
      requestType: lockTermsRequestType,
      allowedStatuses: [payload.orderType === 'inhouse_order' ? 'negotiating' : 'draft'],
      wrongStatusMessage: payload.orderType === 'inhouse_order'
        ? 'Only an order under negotiation can be sent for approval.'
        : 'Only a draft can be sent for approval.',
    })
  }

  /** Staff: ask to undo locked terms. A reason is required. */
  function requestUnlock(payload: { orderId: number; orderType: TermsOrderType; orderNo: string | null; reason: string }) {
    return file({
      ...payload,
      requestType: unlockTermsRequestType,
      allowedStatuses: payload.orderType === 'inhouse_order' ? ['ready', 'awaiting_stock'] : ['invoiced'],
      wrongStatusMessage: payload.orderType === 'inhouse_order'
        ? 'Only an agreed order that has not started delivering can be unapproved.'
        : 'Only an invoice with no payment yet can be unapproved.',
    })
  }

  // ── Deciding ─────────────────────────────────────────────────────────────

  /** Marks a pending request decided. Guarded on 'pending', so two approvers
   *  (or a double click) can only decide it once. */
  async function claim(requestId: number, status: 'approved' | 'rejected', note: string | null) {
    const { user } = await authStore.getCurrentUser()
    const { data, error: updateError } = await supabase
      .from('change_requests')
      .update({ status, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString(), resolution_note: note })
      .eq('id', requestId)
      .in('request_type', termsRequestTypes)
      .eq('status', 'pending')
      .select(requestSelect)
    if (updateError) throw updateError
    return data?.length ? mapRow(data[0]) : null
  }

  /** Puts a claimed request back to pending when applying it failed. */
  async function unclaim(requestId: number) {
    const { error: revertError } = await supabase
      .from('change_requests')
      .update({ status: 'pending', resolved_by: null, resolved_at: null, resolution_note: null })
      .eq('id', requestId)
      .eq('status', 'approved')
    if (revertError) console.warn('termsApproval: could not reopen the request after a failed apply:', revertError.message)
  }

  /**
   * Executive: approve. The request is claimed FIRST — Agree / Invoice check
   * that the id they are given is an approved lock request — then applied. If
   * applying fails, the request goes back to pending with the reason shown, so
   * it can be retried or rejected rather than sitting approved with nothing done.
   */
  async function approve(requestId: number): Promise<{ success: boolean }> {
    loading.value = true
    error.value = ''
    try {
      const request = await claim(requestId, 'approved', 'Approved.')
      if (!request) {
        toast.warning('That request has already been decided.')
        await fetchRequests({ status: 'pending' })
        return { success: false }
      }
      const type = request.order_type
      if (!type) { await unclaim(requestId); toast.error('The order for this request was not found.'); return { success: false } }
      const label = orderLabel(type, request.order_no, request.transaction_id)

      let applied: { success: boolean; error?: string; warnings?: string[] }
      if (request.request_type === lockTermsRequestType) {
        applied = type === 'inhouse_order'
          ? await useInhouseDataStore().agreeOrder(request.transaction_id, { approvedRequestId: requestId })
          : await useEthicalDataStore().confirmDraft(request.transaction_id, { approvedRequestId: requestId })
      } else {
        applied = type === 'inhouse_order'
          ? await useInhouseDataStore().unlockTerms(request.transaction_id)
          : await useEthicalDataStore().unlockTerms(request.transaction_id)
      }

      if (!applied.success) {
        await unclaim(requestId)
        toast.error(`Not applied — ${applied.error ?? 'the order could not be updated'}. The request is still pending.`)
        await fetchRequests({ status: 'pending' })
        return { success: false }
      }

      await log(type, request.transaction_id, `${request.request_type}_approved`, `${request.summary ?? label} — approved`)
      if (request.request_type === unlockTermsRequestType) {
        if (applied.warnings?.length) {
          toast.warning(`${label} unapproved, but correct by hand: ${applied.warnings.join('; ')}.`, { timeout: 20000 })
        } else {
          toast.success(`${label} unapproved — back to ${type === 'inhouse_order' ? 'negotiation' : 'draft'}.`)
        }
      }
      // Lock: agreeOrder / confirmDraft already said what happened (stock short, invoice number).
      await fetchRequests({ status: 'pending' })
      return { success: true }
    } catch (err) {
      handleError(err, 'Failed to approve the request')
      toast.error(error.value || 'Failed to approve the request.')
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  /** Executive: reject, with the reason staff will see on the order. */
  async function reject(requestId: number, note: string): Promise<{ success: boolean }> {
    loading.value = true
    error.value = ''
    try {
      const request = await claim(requestId, 'rejected', note || 'Not approved.')
      if (!request) {
        toast.warning('That request has already been decided.')
        await fetchRequests({ status: 'pending' })
        return { success: false }
      }
      if (request.order_type) {
        await log(request.order_type, request.transaction_id, `${request.request_type}_rejected`,
          `${request.summary ?? 'Terms request'} — not approved${note ? `: ${note}` : ''}`)
      }
      toast.success('Rejected.')
      await fetchRequests({ status: 'pending' })
      return { success: true }
    } catch (err) {
      handleError(err, 'Failed to reject the request')
      toast.error(error.value || 'Failed to reject the request.')
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  /** Staff: take back a pending request to edit the order again. */
  async function withdraw(requestId: number): Promise<{ success: boolean }> {
    loading.value = true
    error.value = ''
    try {
      const request = await claim(requestId, 'rejected', withdrawnNote)
      if (!request) { toast.warning('That request has already been decided.'); return { success: false } }
      if (request.order_type) {
        await log(request.order_type, request.transaction_id, `${request.request_type}_withdrawn`,
          `${request.summary ?? 'Terms request'} — withdrawn`)
      }
      toast.success('Request withdrawn — the order can be edited again.')
      return { success: true }
    } catch (err) {
      handleError(err, 'Failed to withdraw the request')
      toast.error(error.value || 'Failed to withdraw the request.')
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  return {
    requests, pendingRequests, loading, error,
    fetchRequests, requestFor, pendingOrderIds, fetchDecisionDetails,
    requestLock, requestUnlock, approve, reject, withdraw,
  }
})
