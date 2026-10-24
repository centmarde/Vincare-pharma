import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useCanvassDataStore } from '@/stores/canvassData'
import { generateIHNumber, generateDocNumber, getLatestReferenceNo, insertWithDocRetry } from '@/utils/generativeHelpers'
import { useDeliveryReceiptsDataStore } from '@/stores/deliveryReceiptsData'
import type { ProductType } from '@/stores/productsData'
import { useProductsDataStore } from '@/stores/productsData'
import { useCustomersDataStore } from '@/stores/customersData'
import type { CustomerType } from '@/stores/customersData'
import type { Shortfall, CanvassQuote, CanvassSelection, CanvassPRResult } from '@/utils/canvassTypes'
import { govtShelfLife, QUALIFICATION_MONTHS } from '@/utils/qualification'
import { describeProduct } from '@/utils/helpers'
import { isCreditSettlement } from '@/utils/paymentMethods'
import type { ChequeDetails } from '@/utils/paymentMethods'
import { issueRow, useIssueList } from '@/composables/useIssueList'
import { hasPendingTermsRequest, isApprovedLockRequest, unlockBlocker } from '@/stores/shared/termsApprovalGuards'
import type { IssueRow } from '@/composables/useIssueList'
import { useShortDatedApprovalStore } from '@/pages/inhouse/stores/shortDatedApproval'
import type { CollectionType } from '@/stores/ethicalData'

const toast = useToast()
// Lists of products go to the issue dialog; the toast is for one-line messages.
const issues = useIssueList()


// In-house government/LGU orders live in the transactions hub as
// transaction_type = 'inhouse_order'; lines in transaction_items; negotiation
// rounds in logs. View-model mapped from the hub (same style as salesData).

// Negotiation-round log actions. These logs are written under module 'inhouse'
// (same as every other event in an order's lifecycle) so a whole order stays a
// single run in the activity logs (deduped by transaction_id). They used to
// carry a separate module 'inhouse_negotiation', which fragmented one order
// across two module buckets; fetchNegotiation now isolates them by ACTION
// instead. If a new negotiation action is ever added, add it here too.
export const NEGOTIATION_ACTIONS = ['offer', 'counter', 'agree'] as const

export type InhouseItemType = {
  id: number
  product_id: number | null
  qty: number
  unit_price: number          // agreed offer per unit (what the govt pays)
  line_total: number
  cost_price: number | null   // company cost snapshot (for margin)
  delivered_qty: number
  product?: ProductType | null
}

export type InhouseOrderType = {
  id: number
  created_at: string
  order_no: string | null        // internal IH-YYYY-### (never changes across the order's life)
  po_no: string | null           // COMPANY PO number, minted from the shared Purchasing PO
                                 // series at the agree step — but ONLY once stock is confirmed
                                 // sufficient. Stays null while awaiting_stock (not yet sourced),
                                 // minted later by recheckStock once the shortfall clears.
  govt_po_no: string | null      // the government's own PR number (labelled "Govt PR" — the
                                 // column predates staff clarifying it is a PR), typed at raise
                                 // time — pure transparency/documentation, no logic keys off
                                 // it (lives in inhouse_details, NOT transactions.po_no)
  po_amount: number | null       // the amount on that government PR, documentation only
  customer_id: number | null
  status: string | null
  total_amount: number | null
  amount_paid: number | null
  paid_at: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  remarks: string | null
  customer?: CustomerType | null
  items?: InhouseItemType[]
}

export type InhouseLineInput = {
  product_id: number
  qty: number
  unit_price: number
  cost_price: number
}

export type NegotiationRound = { id: number; created_at: string; created_by: string | null; action: string | null; description: string | null }

export type { Shortfall, CanvassQuote, CanvassSelection, CanvassPRResult }

// Line values live directly on transaction_items (transaction_item_details was
// merged back in). An in-house order is outbound, so the ordered quantity is
// qty_stock_out and the delivered count is actual_count_stock_out.
const SELECT_ORDER =
  '*, transaction_items!transaction_items_transaction_id_fkey(id, product_id, qty_stock_out, unit_price, line_total, cost_price, actual_count_stock_out, product:product_id(*)), customer:customer_id(*), inhouse_details(*)'

function mapRow(row: any): InhouseOrderType {
  const details = row.inhouse_details ?? {}
  return {
    id:           row.id,
    created_at:   row.created_at,
    order_no:     row.inhouse_no,
    po_no:        row.po_no,
    govt_po_no:   details.govt_po_no ?? null,
    po_amount:    row.po_amount ?? null,
    customer_id:  row.customer_id,
    status:       row.status,
    total_amount: row.total_amount,
    amount_paid:  details.amount_paid ?? 0,
    paid_at:      details.paid_at ?? null,
    created_by:   row.created_by,
    approved_by:  row.approved_by,
    approved_at:  row.approved_at,
    remarks:      row.remarks,
    customer:     row.customer,
    items: (row.transaction_items ?? []).map((li: any) => ({
      id:            li.id,
      product_id:    li.product_id,
      qty:           li.qty_stock_out,
      unit_price:    li.unit_price,
      line_total:    li.line_total,
      cost_price:    li.cost_price,
      delivered_qty: li.actual_count_stock_out ?? 0,
      product:       li.product,
    })),
  }
}

export const useInhouseDataStore = defineStore('inhouseData', () => {
  const authStore = useAuthUserStore()
  const canvassStore = useCanvassDataStore()
  const drStore = useDeliveryReceiptsDataStore()
  const productsStore = useProductsDataStore()
  const customersStore = useCustomersDataStore()
  const shortDatedStore = useShortDatedApprovalStore()

  const orders: Ref<InhouseOrderType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)

  const handleError = (err: unknown, msg: string) => { error.value = err instanceof Error ? err.message : msg }
  const clearError = () => { error.value = '' }

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value
    const channel = supabase
      .channel('inhouse-channel')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: 'transaction_type=eq.inhouse_order' },
        async () => { await fetchOrders() })
      .subscribe()
    realtimeChannel.value = channel
    return channel
  }
  const stopRealtime = async () => {
    const channel = realtimeChannel.value
    if (!channel) return
    realtimeChannel.value = null
    await supabase.removeChannel(channel)
  }

  const fetchOrders = async (options: { status?: string } = {}) => {
    loading.value = true
    clearError()
    try {
      let q = supabase.from('transactions').select(SELECT_ORDER).eq('transaction_type', 'inhouse_order')
      if (options.status) q = q.eq('status', options.status)
      q = q.order('created_at', { ascending: false })
      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      orders.value = (data || []).map(mapRow)
      return orders.value
    } catch (err) {
      handleError(err, 'Failed to fetch in-house orders')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchOrderById = async (id: number): Promise<InhouseOrderType | null> => {
    const { data, error: e } = await supabase.from('transactions').select(SELECT_ORDER).eq('id', id).single()
    if (e || !data) { handleError(e, 'Failed to load order'); return null }
    return mapRow(data)
  }

  // Header + inhouse_details + reference_no + items (was inhouse_create_order).
  // Best-effort, not atomic: a failure between the header insert and the items
  // insert leaves an orphan header, and the reference_no is generated by a
  // read-max-and-increment without a server-side lock (accepted trade-off,
  // JS-over-RPC convention).
  const createOrder = async (payload: {
    customerId: number
    /** 'YYYY-MM-DD' for an order placed before today; omitted for today's. */
    orderDate?: string
    govtPoNo?: string   // the government's PR number (documentation-only)
    poAmount?: number   // the amount on that PR (documentation-only; AR SOA column)
    remarks?: string
    lines: InhouseLineInput[]
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }
    if (!payload.lines.length) { toast.warning('Add at least one line item.'); loading.value = false; return { success: false } }

    const subtotal = payload.lines.reduce((sum, l) => sum + l.qty * l.unit_price, 0)

    const { data: created, docNo: orderNo, error: insertError } = await insertWithDocRetry<{ id: number }>(
      () => generateIHNumber(),
      async (docNo) => supabase
        .from('transactions')
        .insert({
          inhouse_no: docNo,
          // Mirror the order number into reference_no too, so the transactions row
          // carries its live document number in the same column purchasing uses
          // (parity with the other modules; the reference_no unique index already
          // reserves the IH- prefix in its shared series space). Kept constant as
          // the IH- number for the whole lifecycle — deliberately NOT mutated to
          // the PO number at agree: in-house and purchasing share the PO series,
          // and both would write it to reference_no, colliding on that unique
          // index. inhouse_no stays as the canonical per-type column.
          reference_no: docNo,
          // Company PO stays null while negotiating — it's stamped (PO-YYYY-###,
          // minted from the shared Purchasing PO series) when terms are agreed,
          // see agreeOrder. The government's own PO number goes to
          // inhouse_details.govt_po_no below.
          po_no: null,
          transaction_type: 'inhouse_order',
          status: 'negotiating',
          customer_id: payload.customerId,
          total_amount: subtotal,
          // The government's PO value, as printed on their PO. Documentation
          // only — nothing keys off it; it's a column on the AR Statement of
          // Accounts register so the accountant can eyeball ordered-vs-delivered.
          po_amount: payload.poAmount ?? null,
          remarks: payload.remarks || null,
          created_by: user.id,
          // A backdated order is dated the day it was placed, the way opening
          // receivables carry their invoice date. Today's keeps the real time.
          ...(payload.orderDate ? { created_at: payload.orderDate } : {}),
        })
        .select('id')
        .single(),
    )

    if (insertError || !created) {
      handleError(insertError, 'Failed to create order.'); toast.error(insertError?.message || 'Failed to create order.')
      loading.value = false; return { success: false }
    }

    // Record the customer's home channel the first time they transact. The
    // picker no longer filters by department, so this is what eventually
    // classifies the customer file — but only when it is still blank: once a
    // customer is stamped they belong to that department, and a cross-channel
    // order must never relabel them. Best-effort, never blocks the order.
    await customersStore.stampDepartmentIfBlank(payload.customerId, 'inhouse')

    const { error: detailsError } = await supabase.from('inhouse_details').insert({
      transaction_id: created.id, govt_po_no: payload.govtPoNo || null,
    })
    if (detailsError) {
      handleError(detailsError, 'Failed to create order.'); toast.error(detailsError.message || 'Failed to create order.')
      loading.value = false; return { success: false }
    }

    const { data: createdItems, error: itemsError } = await supabase
      .from('transaction_items')
      // One insert per line now that line values live on transaction_items.
      // Ordered quantity is outbound -> qty_stock_out.
      .insert(payload.lines.map(l => ({
        transaction_id: created.id, product_id: l.product_id,
        qty_stock_out: l.qty, unit_price: l.unit_price,
        line_total: l.qty * l.unit_price, cost_price: l.cost_price,
      })))
      .select('id')
    if (itemsError || !createdItems) {
      handleError(itemsError, 'Failed to save order line items.'); toast.error(itemsError?.message || 'Failed to save order line items.')
      loading.value = false; return { success: false }
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'created', description: `In-house order ${orderNo} raised`,
      module: 'inhouse', transaction_id: created.id,
    })
    if (logError) console.warn('createOrder: activity log insert failed:', logError.message)

    toast.success(`Order ${orderNo} raised.`)
    await fetchOrders()
    loading.value = false
    return { success: true, orderId: created.id, orderNo }
  }

  // Apply per-line price edits (optional) then log a negotiation round (was
  // inhouse_record_offer). Best-effort, not atomic: a failure after the line
  // edits but before the log insert leaves the lines mutated with no audit
  // trail for that round (accepted trade-off, JS-over-RPC convention).
  const recordOffer = async (payload: {
    orderId: number
    total: number
    party: 'government' | 'company'
    note?: string
    // product_id/cost_price are set when a counter-offer swaps a line's
    // product (customer wants something else for ~the same spend).
    lineUpdates?: { item_id: number; unit_price: number; qty: number; product_id?: number; cost_price?: number }[]
    // Lines are editable until terms are agreed: the customer may drop an item
    // or ask for one more, not just haggle on price.
    addLines?: InhouseLineInput[]
    removeItemIds?: number[]
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('id', payload.orderId)
      .eq('transaction_type', 'inhouse_order')
      .maybeSingle()
    if (fetchError || !order) {
      handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.')
      loading.value = false; return { success: false }
    }
    if (order.status !== 'negotiating') {
      toast.error('Order is no longer under negotiation.')
      loading.value = false; return { success: false }
    }
    // Frozen while the executives are deciding on these terms: what they were
    // shown must be what they approve.
    if (await hasPendingTermsRequest(payload.orderId)) {
      toast.error('These terms are awaiting executive approval. Withdraw the request to change them.')
      loading.value = false; return { success: false }
    }

    const removeIds = payload.removeItemIds ?? []
    const addLines = payload.addLines ?? []
    const keptCount = (payload.lineUpdates ?? []).filter((u) => !removeIds.includes(u.item_id)).length
    if (keptCount + addLines.length === 0) {
      toast.warning('An order needs at least one line item.')
      loading.value = false; return { success: false }
    }

    // Nothing has been delivered while negotiating (delivery only opens once
    // the order is ready), so a removed line has no stock or DR hanging off it.
    if (removeIds.length) {
      const { error: removeError } = await supabase
        .from('transaction_items')
        .delete()
        .in('id', removeIds)
        .eq('transaction_id', payload.orderId)
      if (removeError) {
        handleError(removeError, 'Failed to remove order line.'); toast.error(removeError.message || 'Failed to remove order line.')
        loading.value = false; return { success: false }
      }
    }

    for (const u of (payload.lineUpdates ?? []).filter((l) => !removeIds.includes(l.item_id))) {
      // All line fields now live on transaction_items, so one update per line.
      // Omitting cost_price keeps the existing value (mirrors the RPC's
      // coalesce-with-existing-row behavior) — never overwrite with null.
      const lineUpdatePayload: Record<string, unknown> = {
        qty_stock_out: u.qty, unit_price: u.unit_price, line_total: u.unit_price * u.qty,
      }
      if (u.product_id != null) lineUpdatePayload.product_id = u.product_id
      if (u.cost_price != null) lineUpdatePayload.cost_price = u.cost_price
      const { error: lineError } = await supabase
        .from('transaction_items')
        .update(lineUpdatePayload)
        .eq('id', u.item_id)
        .eq('transaction_id', payload.orderId)
      if (lineError) {
        handleError(lineError, 'Failed to update order line.'); toast.error(lineError.message || 'Failed to update order line.')
        loading.value = false; return { success: false }
      }
    }

    if (addLines.length) {
      const { error: addError } = await supabase
        .from('transaction_items')
        .insert(addLines.map((l) => ({
          transaction_id: payload.orderId, product_id: l.product_id,
          qty_stock_out: l.qty, unit_price: l.unit_price,
          line_total: l.qty * l.unit_price, cost_price: l.cost_price,
        })))
      if (addError) {
        handleError(addError, 'Failed to add order line.'); toast.error(addError.message || 'Failed to add order line.')
        loading.value = false; return { success: false }
      }
    }

    const lineChanges = [
      addLines.length ? `${addLines.length} line(s) added` : '',
      removeIds.length ? `${removeIds.length} line(s) removed` : '',
    ].filter(Boolean).join(', ')

    const { error: statusError } = await supabase
      .from('transactions')
      .update({ total_amount: payload.total, status: 'negotiating', updated_at: new Date().toISOString() })
      .eq('id', payload.orderId)
    if (statusError) {
      handleError(statusError, 'Failed to record offer.'); toast.error(statusError.message || 'Failed to record offer.')
      loading.value = false; return { success: false }
    }

    const { error: detailsError } = await supabase
      .from('inhouse_details')
      .upsert({ transaction_id: payload.orderId, offer_price: payload.total }, { onConflict: 'transaction_id' })
    if (detailsError) {
      handleError(detailsError, 'Failed to record offer.'); toast.error(detailsError.message || 'Failed to record offer.')
      loading.value = false; return { success: false }
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id,
      action: payload.party === 'company' ? 'counter' : 'offer',
      description: `${payload.note ?? ''}${lineChanges ? ` [${lineChanges}]` : ''} | proposed: ${payload.total}`,
      module: 'inhouse', transaction_id: payload.orderId,
    })
    if (logError) console.warn('recordOffer: activity log insert failed:', logError.message)

    toast.success('Offer recorded.')
    await fetchOrders()
    loading.value = false
    return { success: true }
  }

  /**
   * Shortfall for a set of order lines, against WAREHOUSE stock.
   *
   * Stock failing govtShelfLife counts as UNUSABLE, not available. An order
   * filled from an expired or short-dated batch cannot be delivered to a
   * government client, so counting it would leave the order sitting `ready`
   * and fail at the door — instead of raising a shortfall now and reaching
   * Purchasing through the flow that already exists for exactly this.
   *
   * Measured as of TODAY. The real test is the shelf life on the delivery day,
   * which nobody knows yet at agreement time, so this is a preview and
   * deliver() re-checks authoritatively.
   *
   * `allowShortDated`: the order has an executive's approval to ship
   * short-dated stock, so that stock counts — the same rule deliver() applies.
   * Without this an approved order stayed `awaiting_stock` for ever: the stock
   * never counted, so it never became ready, so it could never be delivered.
   * EXPIRED stock never counts, approval or not.
   */
  async function shortfallForLines(
    lines: { product_id: number; qty: number }[],
    options: { allowShortDated?: boolean } = {},
  ): Promise<Shortfall[]> {
    const shortfall: Shortfall[] = []
    for (const line of lines) {
      const { data: product } = await supabase
        .from('products')
        .select('current_stock, expiry_date')
        .eq('id', line.product_id)
        .maybeSingle()
      const physical = product?.current_stock ?? 0
      const shelf = govtShelfLife(product?.expiry_date as string | null)
      const usable = shelf.ok || (options.allowShortDated === true && shelf.reason === 'short_dated')
      const onHand = usable ? physical : 0
      if (onHand < line.qty) {
        shortfall.push({
          product_id: line.product_id,
          ordered: line.qty,
          on_hand: onHand,
          needed: line.qty - onHand,
          ...(usable || shelf.ok ? {} : { blocked_reason: shelf.reason, physical_on_hand: physical }),
        })
      }
    }
    return shortfall
  }

  // Read-only warehouse stock check, flag ready vs awaiting_stock (was inhouse_agree).
  // Locks the terms. Only ever run by an executive APPROVING a lock-terms
  // request (termsApprovalData), which passes that request's id: the id is
  // checked here so no other path — and no older approval from before an
  // unlock — can agree an order. approved_by is the approving executive.
  const agreeOrder = async (
    orderId: number,
    options: { approvedRequestId?: number } = {},
  ): Promise<{ success: boolean; shortfall?: Shortfall[]; error?: string }> => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    if (!(await isApprovedLockRequest(options.approvedRequestId, orderId))) {
      loading.value = false
      return { success: false, error: 'Locking the terms needs an executive\'s approval.' }
    }

    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, po_no, transaction_items!transaction_items_transaction_id_fkey(product_id, qty_stock_out)')
      .eq('id', orderId)
      .eq('transaction_type', 'inhouse_order')
      .maybeSingle()
    if (fetchError || !order) {
      handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.')
      loading.value = false; return { success: false }
    }
    if (order.status !== 'negotiating') {
      // Returned, not toasted: the approver's screen says why it was not applied.
      loading.value = false; return { success: false, error: 'the order is no longer under negotiation' }
    }

    const lines = ((order.transaction_items ?? []) as unknown as { product_id: number; qty_stock_out: number | null }[])
      .map(li => ({ product_id: li.product_id, qty: li.qty_stock_out ?? 0 }))
    const shortfall = await shortfallForLines(lines, { allowShortDated: await shortDatedStore.hasApproval(orderId) })

    // Agreement is the PO stage — but only when the order can actually be
    // fulfilled from stock. Minting the company PO number (from the SHARED
    // Purchasing PO series, PO-YYYY-###, numeric max + 1) while the order is
    // still short would stamp a "PO" onto something Purchasing hasn't sourced
    // yet — reads as an auto-created PO despite no canvassing having happened.
    // So: sufficient stock → mint po_no now (as before). Short → leave po_no
    // null; it gets minted once recheckStock finds the shortfall resolved.
    // An order agreed before, then unlocked, KEEPS its PO number: it is
    // reused rather than a second one minted, so the series has no gap and
    // paperwork already printed with it stays valid.
    const existingPo = (order as { po_no?: string | null }).po_no ?? null
    const poNo = existingPo ?? (shortfall.length > 0 ? null : await generateDocNumber('PO', getLatestReferenceNo))

    const nowIso = new Date().toISOString()
    // Guarded on 'negotiating', so two approvals landing together lock once.
    const { data: locked, error: statusError } = await supabase
      .from('transactions')
      .update({
        approved_by: user.id, approved_at: nowIso, updated_at: nowIso,
        po_no: poNo,
        status: shortfall.length > 0 ? 'awaiting_stock' : 'ready',
      })
      .eq('id', orderId)
      .eq('status', 'negotiating')
      .select('id')
    if (statusError || !locked?.length) {
      handleError(statusError, 'Failed to agree order.')
      loading.value = false
      return { success: false, error: statusError?.message || 'The order is no longer under negotiation.' }
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'agree',
      description: poNo ? `Terms agreed — ${poNo} issued` : 'Terms agreed — awaiting stock, PO withheld',
      module: 'inhouse', transaction_id: orderId,
    })
    if (logError) console.warn('agreeOrder: activity log insert failed:', logError.message)

    toast.success(shortfall.length ? 'Agreed — but stock is short.' : 'Agreed — stock is sufficient.')
    await fetchOrders()
    loading.value = false
    return { success: true, shortfall }
  }

  // Undoes Agree: the order goes back to negotiation so its terms can change.
  // Run only by an executive approving an unlock request. Allowed until the
  // first delivery or payment — after that the terms have been acted on. The
  // PO number stays on the order (reused when it is agreed again). Nothing is
  // in the ledger yet for an agreed In-House order — deliveries are what book.
  const unlockTerms = async (orderId: number): Promise<{ success: boolean; error?: string }> => {
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) return { success: false, error: 'User not authenticated.' }

    const blocker = await unlockBlocker(orderId)
    if (blocker) return { success: false, error: `Cannot unapprove: ${blocker}` }

    const nowIso = new Date().toISOString()
    const { data: reopened, error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'negotiating', approved_by: null, approved_at: null, updated_at: nowIso })
      .eq('id', orderId)
      .eq('transaction_type', 'inhouse_order')
      .in('status', ['ready', 'awaiting_stock'])
      .select('id')
    if (updateError) return { success: false, error: updateError.message }
    if (!reopened?.length) return { success: false, error: 'Only an agreed order that has not started delivering can be unapproved.' }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'terms_unlocked',
      description: 'Terms unapproved — back to negotiation (PO number kept)',
      module: 'inhouse', transaction_id: orderId,
    })
    if (logError) console.warn('unlockTerms: activity log insert failed:', logError.message)
    await fetchOrders()
    return { success: true }
  }

  // Read-only warehouse stock check for display — NO status flip, NO po_no
  // minting. Used when a detail view merely OPENS an awaiting_stock order, so
  // simply looking at an order never advances it or mints a document number.
  // Any state change is the explicit "Re-check stock" button's job (recheckStock).
  const computeShortfall = async (orderId: number): Promise<Shortfall[]> => {
    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('transaction_items!transaction_items_transaction_id_fkey(product_id, qty_stock_out)')
      .eq('id', orderId)
      .maybeSingle()
    if (fetchError || !order) { handleError(fetchError, 'Failed to check stock'); return [] }

    const lines = ((order.transaction_items ?? []) as unknown as { product_id: number; qty_stock_out: number | null }[])
      .map(li => ({ product_id: li.product_id, qty: li.qty_stock_out ?? 0 }))
    const shortfall = await shortfallForLines(lines, { allowShortDated: await shortDatedStore.hasApproval(orderId) })
    return shortfall
  }

  // Explicit "Re-check stock" action: recompute the shortfall AND advance the
  // order — flip awaiting_stock↔ready, and mint the company po_no the moment
  // the shortfall clears (agreeOrder withheld it while short). This is the only
  // path that mutates, so state only changes on a deliberate user click, never
  // on view. (Was inhouse_recheck_stock.)
  const recheckStock = async (orderId: number): Promise<Shortfall[]> => {
    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('po_no')
      .eq('id', orderId)
      .maybeSingle()
    if (fetchError || !order) { handleError(fetchError, 'Failed to recheck stock'); return [] }

    const shortfall = await computeShortfall(orderId)

    // Shortfall just resolved (stock arrived) and agreeOrder withheld po_no
    // while it was short — mint it now, same shared Purchasing PO series.
    const poNo = shortfall.length === 0 && !order.po_no
      ? await generateDocNumber('PO', getLatestReferenceNo)
      : undefined

    await supabase
      .from('transactions')
      .update({
        status: shortfall.length > 0 ? 'awaiting_stock' : 'ready',
        updated_at: new Date().toISOString(),
        ...(poNo ? { po_no: poNo } : {}),
      })
      .eq('id', orderId)
      .eq('transaction_type', 'inhouse_order')
      .in('status', ['awaiting_stock', 'ready'])

    await fetchOrders()
    return shortfall
  }

  // Recording a delivery also issues a numbered Delivery Receipt (DR-YYYY-###,
  // generated client-side); returns it so the caller can print immediately.
  // Was inhouse_deliver.
  //
  // CHECK EVERYTHING, THEN MOVE. Every line is validated first — quantity left
  // to deliver, shelf life, and stock totalled per product — with nothing
  // written; any problems are reported together. Only then is stock deducted
  // and the delivered counts stamped. It used to check and deduct one line at a
  // time, so a short line 3 left lines 1-2 deducted with no DR behind them.
  //
  // Still not atomic (JS-over-RPC convention), so a failure DURING the moves —
  // including the DR itself failing to save — puts back what was already
  // moved, rather than leaving stock gone with no receipt for it.
  //
  // CONCURRENT DELIVERIES: each line's delivered count is written only if it
  // is still the figure the checks were made against, so two clerks
  // delivering the same order at once cannot both pass and both deduct — the
  // second finds the count changed and backs out. Stock moves through
  // adjustMainStock, which cannot overwrite a movement landing at the same
  // time. Note: `remarks`
  // on the DR header stores receivedBy (matches the RPC it replaces — that
  // function accepted a p_remarks argument but never actually wrote it
  // anywhere, a pre-existing quirk preserved here rather than silently fixed).
  const deliver = async (
    orderId: number,
    lines: { item_id: number; qty: number }[],
    opts: { receivedBy?: string; remarks?: string } = {},
  ) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, customer_id, po_no, inhouse_no')
      .eq('id', orderId)
      .eq('transaction_type', 'inhouse_order')
      .maybeSingle()
    if (fetchError || !order) {
      handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.')
      loading.value = false; return { success: false }
    }
    if (order.status !== 'ready' && order.status !== 'delivered') {
      toast.error('Order is not ready for delivery.')
      loading.value = false; return { success: false }
    }

    // Read ONCE for the whole order, not per line: the approval is a
    // per-order decision ("this order may ship short-dated stock"), and asking
    // per line would both re-query needlessly and imply a granularity the
    // executive was never offered. Read at delivery rather than cached, since
    // an approval can land while the order waits.
    const shortDatedApproved = await shortDatedStore.hasApproval(orderId)

    // ── 1. Validate every line. Nothing is written in this phase. ──────────
    const requested = lines.filter((l) => l.qty > 0)
    if (!requested.length) {
      toast.warning('Enter a quantity to deliver on at least one line.')
      loading.value = false; return { success: false }
    }
    if (requested.some((l) => !Number.isFinite(l.qty))) {
      toast.error('A delivery quantity is not a valid number.')
      loading.value = false; return { success: false }
    }
    // One entry per order line: the same line twice would be checked and
    // stamped twice against the same starting count.
    if (new Set(requested.map((l) => l.item_id)).size !== requested.length) {
      toast.error('The same order line is listed twice. Nothing was delivered.')
      loading.value = false; return { success: false }
    }

    const { data: itemRows, error: itemsError } = await supabase
      .from('transaction_items')
      .select('id, product_id, qty_stock_out, actual_count_stock_out, unit_price')
      .eq('transaction_id', orderId)
      .in('id', requested.map((l) => l.item_id))
    if (itemsError) {
      handleError(itemsError, 'Failed to record delivery.'); toast.error(itemsError.message || 'Failed to record delivery.')
      loading.value = false; return { success: false }
    }
    const itemById = new Map((itemRows ?? []).map((it) => [it.id as number, it]))

    const productIds = [...new Set((itemRows ?? []).map((it) => it.product_id).filter((id): id is number => id != null))]
    const { data: productRows, error: productsError } = productIds.length
      ? await supabase
        .from('products')
        .select('id, current_stock, expiry_date, product_name, sku, batch_no')
        .in('id', productIds)
      : { data: [], error: null }
    if (productsError) {
      handleError(productsError, 'Could not check warehouse stock.')
      toast.error('Could not check warehouse stock. Nothing was delivered — try again.')
      loading.value = false; return { success: false }
    }
    const productById = new Map((productRows ?? []).map((p) => [p.id as number, p]))

    // `countAsRead` is the delivered count exactly as read (NULL included): the
    // claim below is guarded on it.
    type PlannedLine = {
      item_id: number; product_id: number; qty: number; delivered: number
      countAsRead: number | null; unit_price: number | null
    }
    const planned: PlannedLine[] = []
    const problems: IssueRow[] = []
    const neededByProduct = new Map<number, number>()

    for (const line of requested) {
      const item = itemById.get(line.item_id)
      if (!item?.product_id) continue
      const product = productById.get(item.product_id)
      const delivered = item.actual_count_stock_out ?? 0
      const ordered = item.qty_stock_out ?? 0

      if (delivered + line.qty > ordered) {
        problems.push(issueRow(product, item.product_id,
          `Delivering ${line.qty} would exceed the order (ordered ${ordered}, already delivered ${delivered})`))
        continue
      }

      // The authoritative shelf-life gate. agreeOrder only previewed this
      // against the stock of the day; weeks of negotiation can pass before
      // anything ships, and a batch that qualified then may not now.
      // EXPIRED is absolute — no approval can make expired goods deliverable.
      // SHORT-DATED is a contract term the business may waive, so an executive
      // approval on this order lets it through; without one it still blocks,
      // pointing at how to get it.
      const shelf = govtShelfLife(product?.expiry_date as string | null)
      if (!shelf.ok && shelf.reason === 'expired') {
        problems.push(issueRow(product, item.product_id, 'Expired — cannot be delivered'))
        continue
      }
      if (!shelf.ok && !shortDatedApproved) {
        problems.push(issueRow(product, item.product_id,
          `Under ${QUALIFICATION_MONTHS} months of shelf life — needs executive approval (request it from the order)`))
        continue
      }

      neededByProduct.set(item.product_id, (neededByProduct.get(item.product_id) ?? 0) + line.qty)
      planned.push({
        item_id: line.item_id, product_id: item.product_id, qty: line.qty, delivered,
        countAsRead: item.actual_count_stock_out ?? null, unit_price: item.unit_price ?? null,
      })
    }

    // Stock is checked per PRODUCT, summed across lines: two lines of the same
    // product each passed on their own while the pair exceeded what was there.
    for (const [productId, needed] of neededByProduct) {
      const product = productById.get(productId)
      const onHand = product?.current_stock ?? 0
      if (onHand < needed) {
        problems.push(issueRow(product, productId, `Not enough warehouse stock — needs ${needed} · ${onHand} on hand`))
      }
    }

    if (problems.length) {
      issues.showIssues({
        title: 'Nothing was delivered',
        message: 'Fix these lines and try again. No stock was moved.',
        rows: problems,
      })
      loading.value = false; return { success: false }
    }
    if (!planned.length) {
      toast.warning('None of those lines can be delivered.')
      loading.value = false; return { success: false }
    }

    // ── 2. Claim the lines, then move the stock. ───────────────────────────
    // What has been applied so far, so a later failure can put it back.
    const stamped: { itemId: number; previous: number | null }[] = []
    const deducted: { productId: number; qty: number }[] = []

    // Best-effort undo of phase 2. Stock goes back through adjustMainStock, so a
    // sale made in the meantime is not wiped out. Anything that cannot be put
    // back is named so it can be corrected by hand.
    async function undo(reason: string) {
      const needsHand: IssueRow[] = []
      for (const d of deducted) {
        const back = await productsStore.adjustMainStock(d.productId, d.qty)
        if (!back.ok) needsHand.push(issueRow(productById.get(d.productId), d.productId, `${d.qty} not put back into stock`))
      }
      // A count left stamped marks the line delivered when nothing was — so a
      // failed reset is listed, never reported as "nothing was delivered".
      for (const st of stamped) {
        const { error: countError } = await supabase
          .from('transaction_items').update({ actual_count_stock_out: st.previous }).eq('id', st.itemId)
        if (countError) {
          console.warn(`deliver: could not restore the delivered count on line ${st.itemId}:`, countError.message)
          const line = planned.find((p) => p.item_id === st.itemId)
          const productId = line?.product_id ?? null
          needsHand.push(issueRow(productId != null ? productById.get(productId) : null, productId,
            `Delivered count left at ${line ? line.delivered + line.qty : '?'} — set it back to ${st.previous ?? 0}`))
        }
      }
      if (needsHand.length) {
        issues.showIssues({
          title: 'Delivery failed — correct by hand',
          message: `${reason} These could not be undone automatically:`,
          rows: needsHand,
        })
      } else {
        toast.error(`${reason} Nothing was delivered; stock was put back.`, { timeout: 12000 })
      }
    }

    // 2a. Claim each line by stamping its delivered count — guarded on the count
    // the checks above used. If another delivery got there first the guard
    // matches nothing and this one backs out before any stock moves. A failed
    // count is not just logged: the count is what marks a line delivered, so
    // without it the same goods could be delivered — and deducted — again.
    for (const line of planned) {
      const base = supabase
        .from('transaction_items')
        .update({ actual_count_stock_out: line.delivered + line.qty })
        .eq('id', line.item_id)
      const guarded = line.countAsRead == null
        ? base.is('actual_count_stock_out', null)
        : base.eq('actual_count_stock_out', line.countAsRead)
      const { data: claimedLine, error: deliveredError } = await guarded.select('id')
      if (deliveredError) {
        handleError(deliveredError, 'Failed to record the delivered quantities.')
        await undo(`Failed to record the delivered quantities (${deliveredError.message}).`)
        loading.value = false; return { success: false }
      }
      if (!claimedLine?.length) {
        await undo('Someone else recorded a delivery on this order at the same time. Reload the order and check what is left to deliver.')
        loading.value = false; return { success: false }
      }
      stamped.push({ itemId: line.item_id, previous: line.countAsRead })
    }

    // 2b. Deduct stock per product.
    for (const [productId, needed] of neededByProduct) {
      const result = await productsStore.adjustMainStock(productId, -needed)
      if (!result.ok) {
        const label = describeProduct(productById.get(productId), productId)
        await undo(result.reason === 'insufficient'
          ? `Not enough warehouse stock for ${label} — needs ${needed}, ${result.onHand ?? 0} on hand now (it changed while recording).`
          : `Stock for ${label} could not be updated (${result.message ?? result.reason}).`)
        loading.value = false; return { success: false }
      }
      deducted.push({ productId, qty: needed })
    }

    // Issue the DR document (dedicated delivery_receipts tables, owned by drStore).
    const drLines = planned.map((l) => ({ product_id: l.product_id, qty: l.qty, unit_price: l.unit_price }))
    const drResponse = await drStore.createDeliveryReceipt({
      orderId, orderNo: order.inhouse_no, source: 'inhouse_order', customerId: order.customer_id,
      poNo: order.po_no || null, receivedBy: opts.receivedBy || null, lines: drLines,
    }, user.id)
    if (!drResponse.success) {
      // Stock has left the shelf by now; without a receipt nothing would
      // account for it, so it goes back.
      await undo('The delivery receipt could not be saved.')
      loading.value = false; return { success: false }
    }
    const drNo = drResponse.drNo!

    // Supabase can't compare two columns server-side, so check client-side.
    const { data: allItems } = await supabase
      .from('transaction_items').select('qty_stock_out, actual_count_stock_out').eq('transaction_id', orderId)
    const stillShort = ((allItems ?? []) as unknown as { qty_stock_out?: number; actual_count_stock_out?: number }[])
      .some(i => (i.actual_count_stock_out ?? 0) < (i.qty_stock_out ?? 0))

    if (!stillShort) {
      await supabase.from('transactions').update({ status: 'delivered', updated_at: new Date().toISOString() }).eq('id', orderId)
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'deliver', description: `Delivery recorded — ${drNo}`,
      module: 'inhouse', transaction_id: orderId,
    })
    if (logError) console.warn('deliver: activity log insert failed:', logError.message)

    toast.success(`Delivery recorded — ${drNo} issued.`)
    await fetchOrders()
    loading.value = false
    return { success: true, drId: drResponse.drId, drNo }
  }

  // Government POs are commonly paid in tranches, not lump-sum — each call
  // records one payment against the balance (was inhouse_record_payment,
  // mirrors ethical_record_collection).
  const recordPayment = async (payload: {
    orderId: number
    amount: number
    method?: string
    reference?: string
    remarks?: string
    // Which of our accounts received the money. Without it nothing ever
    // credited cash_accounts.balance, which only ever decreased.
    // Null only for a return credit (method 'return_credit'): returned goods
    // settling the bill, so no money lands anywhere.
    cashAccountId: number | null
    /**
     * The cheque, when the payment was one. Written to collections.cheque_bank /
     * cheque_no / cheque_date — only when present, so a cash payment never
     * touches those columns.
     */
    cheque?: ChequeDetails | null
  }) => {
    // A return credit or a credit memo: settled by a credit, so no money moves.
    const isReturnCredit = isCreditSettlement(payload.method)
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }
    if (payload.amount <= 0) { toast.error('Payment amount must be positive.'); loading.value = false; return { success: false } }

    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, total_amount, inhouse_details(amount_paid)')
      .eq('id', payload.orderId)
      .eq('transaction_type', 'inhouse_order')
      .maybeSingle()
    if (fetchError || !order) {
      handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.')
      loading.value = false; return { success: false }
    }
    if (order.status !== 'delivered' && order.status !== 'partial') {
      toast.error('Order must be fully delivered before payment.')
      loading.value = false; return { success: false }
    }

    const paid = (order.inhouse_details as unknown as { amount_paid: number | null } | null)?.amount_paid ?? 0
    const total = order.total_amount ?? 0
    const balance = total - paid
    if (payload.amount > balance) {
      toast.error(`Payment (${payload.amount}) exceeds outstanding balance (${balance}).`)
      loading.value = false; return { success: false }
    }

    // Resolve the receiving account before writing anything — a payment
    // pointing at a missing account would record money as landing nowhere. A
    // return credit is the one payment with no account: no money moves.
    let account: { id: number; name: string; balance: number | null } | null = null
    if (!isReturnCredit) {
      const { data, error: accountError } = payload.cashAccountId == null
        ? { data: null, error: null }
        : await supabase.from('cash_accounts').select('id, name, balance').eq('id', payload.cashAccountId).maybeSingle()
      if (accountError || !data) {
        toast.error('Select a valid cash account to deposit this payment into.')
        loading.value = false; return { success: false }
      }
      account = data
    }

    const { data: payment, error: paymentError } = await supabase
      .from('collections')
      .insert({
        transaction_id: payload.orderId, amount: payload.amount,
        payment_method: payload.method || null, reference_no: payload.reference || null,
        collected_by: user.id, remarks: payload.remarks || null,
        cash_account_id: isReturnCredit ? null : payload.cashAccountId,
        ...(payload.cheque
          ? { cheque_bank: payload.cheque.bank, cheque_no: payload.cheque.number, cheque_date: payload.cheque.date }
          : {}),
      })
      .select('id')
      .single()
    if (paymentError || !payment) {
      handleError(paymentError, 'Failed to record payment.'); toast.error(paymentError?.message || 'Failed to record payment.')
      loading.value = false; return { success: false }
    }

    const newPaid = paid + payload.amount
    const newStatus = newPaid >= total ? 'paid' : 'partial'
    const nowIso = new Date().toISOString()

    const { error: detailsError } = await supabase
      .from('inhouse_details')
      .update({ amount_paid: newPaid, paid_at: nowIso })
      .eq('transaction_id', payload.orderId)
    if (detailsError) {
      handleError(detailsError, 'Failed to record payment.'); toast.error(detailsError.message || 'Failed to record payment.')
      loading.value = false; return { success: false }
    }

    const { error: statusError } = await supabase
      .from('transactions')
      .update({ status: newStatus, updated_at: nowIso })
      .eq('id', payload.orderId)
    if (statusError) console.warn('recordPayment: status flip failed:', statusError.message)

    // The money lands in the chosen account. Best-effort like every other
    // balance write in the app (JS-over-RPC convention) — surfaced, not rolled
    // back, since the collections row is the record of record.
    if (account) {
      const { error: balanceError } = await supabase
        .from('cash_accounts')
        .update({ balance: (account.balance ?? 0) + payload.amount })
        .eq('id', account.id)
      if (balanceError) {
        console.warn('recordPayment: cash account balance update failed:', balanceError.message)
        toast.warning(`Payment recorded, but ${account.name}'s balance was not updated. Verify it manually.`)
      }
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'payment',
      description: account
        ? `Payment of ${payload.amount} into ${account.name} (${newPaid}/${total})`
        : `Returned goods credit of ${payload.amount} (${payload.reference ?? 'return'}) (${newPaid}/${total})`,
      module: 'inhouse', transaction_id: payload.orderId,
    })
    if (logError) console.warn('recordPayment: activity log insert failed:', logError.message)

    toast.success(isReturnCredit ? 'Credit taken off the bill.' : 'Payment recorded.')
    await fetchOrders()
    loading.value = false
    return { success: true, paymentId: payment.id }
  }

  // Voided payments excluded — see the same note on ethicalData.fetchCollections.
  const fetchPayments = async (orderId: number): Promise<CollectionType[]> => {
    const { data, error: e } = await supabase
      .from('collections').select('*').is('voided_at', null)
      .eq('transaction_id', orderId).order('created_at', { ascending: true })
    if (e) { handleError(e, 'Failed to load payments'); return [] }
    return (data || []) as CollectionType[]
  }

  // Commit a supplier canvass: create one PR per winning supplier (shared with
  // Ethical via canvassData.ts — was the shared canvass_to_prs RPC).
  const canvassToPRs = async (orderId: number, selections: CanvassSelection[]) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }
    if (!selections.length) { toast.warning('Add at least one supplier selection.'); loading.value = false; return { success: false } }

    const result = await canvassStore.commitToPRs('inhouse_order', orderId, selections, user.id)
    if (!result.success) {
      handleError(result.error, 'Failed to raise purchase requisitions.')
      toast.error(result.error || 'Failed to raise purchase requisitions.')
      loading.value = false; return { success: false }
    }
    const prs = result.prs ?? []
    toast.success(prs.length === 1
      ? `Raised ${prs[0].pr_no}.`
      : `Raised ${prs.length} purchase requisitions.`)
    await fetchOrders()
    loading.value = false
    return { success: true, prs }
  }

  const fetchNegotiation = async (orderId: number): Promise<NegotiationRound[]> => {
    const { data, error: e } = await supabase
      .from('logs').select('id, created_at, created_by, action, description')
      // Isolate negotiation rounds by ACTION, not module — the module is now
      // 'inhouse' for the whole order lifecycle (one run). This also still
      // matches legacy rows written under module 'inhouse_negotiation', since
      // those carry the same actions.
      .eq('transaction_id', orderId).in('action', NEGOTIATION_ACTIONS)
      .order('created_at', { ascending: true })
    if (e) { handleError(e, 'Failed to load negotiation history'); return [] }
    return (data || []) as NegotiationRound[]
  }

  const resetStore = () => { orders.value = []; loading.value = false; error.value = '' }

  return {
    orders, loading, error,
    fetchOrders, fetchOrderById, createOrder, recordOffer, agreeOrder, unlockTerms,
    computeShortfall, recheckStock, deliver, recordPayment, fetchPayments, canvassToPRs, fetchNegotiation,
    startRealtime, stopRealtime, clearError, resetStore,
  }
})
