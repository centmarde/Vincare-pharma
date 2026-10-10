// Draft -> invoice: saving and discarding drafts, confirming one into an
// invoice (mints the EO number and draws the stock), and createOrder, which is
// the two in one go.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useCustomersDataStore } from '@/stores/customersData'
import { useStockSourcingStore } from '@/stores/stockSourcingData'
import { useProductsDataStore } from '@/stores/productsData'
import type { StockLocationId } from '@/stores/stockSourcingData'
import { generateNextNumber, insertWithDocRetry } from '@/utils/helpers'
import type { OrderPayload } from './types'
import { loading, handleError, clearError } from './state'
import { fetchOrders } from './orders'

const toast = useToast()

// Resolved lazily rather than at import time: a store factory called while
// this module is first evaluated can run before Pinia is installed.
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())
let customersStore: ReturnType<typeof useCustomersDataStore> | null = null
const getCustomersStore = () => (customersStore ??= useCustomersDataStore())
let sourcingStore: ReturnType<typeof useStockSourcingStore> | null = null
const getSourcingStore = () => (sourcingStore ??= useStockSourcingStore())
let productsStore: ReturnType<typeof useProductsDataStore> | null = null
const getProductsStore = () => (productsStore ??= useProductsDataStore())

// ---- Draft → invoice -------------------------------------------------------
// An ethical order starts as a DRAFT while the client is still haggling:
// lines, quantities, prices and terms stay editable, no stock moves, nothing
// is booked, and it carries NO EO number — the EO series is the invoice
// series, so minting one for a draft that is later discarded would leave a
// gap in it. confirmDraft() locks the terms: it mints the number, draws the
// stock and flips the order to 'invoiced'. createOrder() is simply the two in
// one go, so direct invoicing and draft confirmation share one code path.

// Validates the branch + stock location. Shared by save and confirm: a draft
// can sit for days, and the branch may be deactivated in the meantime.
export async function validateLocations(outletId: number | null, sourceLocationId: StockLocationId | undefined): Promise<boolean> {
  if (!outletId) { toast.warning('Select a branch.'); return false }
  if (sourceLocationId === undefined) { toast.warning('Select where the stock comes from.'); return false }

  const { data: outlet, error: outletError } = await supabase
    .from('outlets')
    .select('channel')
    .eq('id', outletId)
    .eq('is_active', true)
    .maybeSingle()
  if (outletError || !outlet) { toast.error('Branch not found or inactive.'); return false }
  if (outlet.channel !== 'ethical') { toast.error('That branch is not an ethical branch.'); return false }

  // A branch must be a real warehouse. The main warehouse (null) has no row to
  // check — it is the products table itself.
  if (sourceLocationId != null) {
    const { data: warehouse, error: warehouseError } = await supabase
      .from('warehouses')
      .select('id')
      .eq('id', sourceLocationId)
      .maybeSingle()
    if (warehouseError || !warehouse) { toast.error('Stock location not found.'); return false }
  }
  return true
}

// Create a new draft, or overwrite an existing one (draftId). A draft has no
// stock or ledger effect, so its lines are simply replaced wholesale.
// Best-effort, not atomic (JS-over-RPC convention) — but a half-written draft
// is harmless: it is visible, editable and deletable, and books nothing.
export async function saveDraft(payload: OrderPayload & { draftId?: number }, options: { silent?: boolean } = {}) {
  loading.value = true
  clearError()
  try {
    const { user, error: authError } = await getAuthStore().getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return { success: false as const } }
    if (!payload.lines.length) { toast.warning('Add at least one line item.'); return { success: false as const } }
    if (!(await validateLocations(payload.outletId, payload.sourceLocationId))) return { success: false as const }

    const subtotal = payload.lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)
    const discount = payload.discount ?? 0
    // Discount is an on-invoice price reduction, so it lowers the total. The
    // rebate is a deferred incentive PAID OUT SEPARATELY (cash/GCash per the
    // customer's rebate_payment_mode) — it's recorded on the order for the
    // eventual payout but must NOT reduce what the customer owes here.
    const total = subtotal - discount
    if (total < 0) { toast.error('Total amount cannot be negative after discount.'); return { success: false as const } }

    const header = {
      // outlet_id = WHO SOLD IT (the ethical branch).
      // warehouse_id = WHERE THE STOCK WILL COME FROM — null means the main
      // warehouse. cancelOrder reads it back to return the goods there.
      outlet_id: payload.outletId,
      warehouse_id: payload.sourceLocationId,
      customer_id: payload.customerId, agent_id: payload.agentId ?? null,
      total_amount: total, remarks: payload.remarks || null,
      updated_at: new Date().toISOString(),
    }

    let orderId: number
    if (payload.draftId) {
      const { data: updated, error: updateError } = await supabase
        .from('transactions')
        .update(header)
        .eq('id', payload.draftId)
        .eq('transaction_type', 'ethical_order')
        .eq('status', 'draft')   // terms are locked once invoiced
        .select('id')
        .maybeSingle()
      if (updateError) { handleError(updateError, 'Failed to save draft.'); toast.error(updateError.message || 'Failed to save draft.'); return { success: false as const } }
      if (!updated) { toast.error('This order is no longer a draft — its terms are locked.'); return { success: false as const } }
      orderId = updated.id

      const { error: clearLinesError } = await supabase.from('transaction_items').delete().eq('transaction_id', orderId)
      if (clearLinesError) { handleError(clearLinesError, 'Failed to save draft lines.'); toast.error(clearLinesError.message || 'Failed to save draft lines.'); return { success: false as const } }
    } else {
      const { data: created, error: insertError } = await supabase
        .from('transactions')
        .insert({ ...header, transaction_type: 'ethical_order', status: 'draft', created_by: user.id })
        .select('id')
        .single()
      if (insertError || !created) { handleError(insertError, 'Failed to create draft.'); toast.error(insertError?.message || 'Failed to create draft.'); return { success: false as const } }
      orderId = created.id

      // Record the customer's home channel on first transaction — only when blank,
      // so a cross-channel order never relabels an already-stamped customer.
      // Best-effort, never blocks the order. See customersData.stampDepartmentIfBlank.
      await getCustomersStore().stampDepartmentIfBlank(payload.customerId, 'ethical')
    }

    const { error: linesError } = await supabase
      .from('transaction_items')
      .insert(payload.lines.map((l) => ({
        // An ethical order is outbound -> qty_stock_out. Nothing is sourced
        // yet, so actual_count_stock_out stays 0 until confirmDraft.
        transaction_id: orderId, product_id: l.product_id,
        qty_stock_out: l.quantity, unit_price: l.unit_price,
        // Without this the GL reads cost from the live product master at
        // projection time (or books no COGS at all when it is null).
        cost_price: l.cost_price ?? null,
        line_total: l.quantity * l.unit_price,
        actual_count_stock_out: 0, stock_sources: null,
      })))
    if (linesError) { handleError(linesError, 'Failed to save draft lines.'); toast.error(linesError.message || 'Failed to save draft lines.'); return { success: false as const } }

    // due_date is set at confirm (terms run from the invoice date, not from
    // when the draft was started); fulfillment_status likewise.
    const { error: detailsError } = await supabase.from('ethical_details').upsert({
      transaction_id: orderId, terms_days: payload.termsDays ?? 0, due_date: null,
      discount_amount: discount, rebate_amount: payload.rebate ?? 0, ads_amount: payload.ads ?? 0,
      fulfillment_status: null, amount_paid: 0, paid_at: null,
    }, { onConflict: 'transaction_id' })
    if (detailsError) { handleError(detailsError, 'Failed to save order details.'); toast.error(detailsError.message || 'Failed to save order details.'); return { success: false as const } }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: payload.draftId ? 'draft_updated' : 'draft_created',
      description: `Ethical draft #${orderId} ${payload.draftId ? 'updated' : 'saved'} — ${payload.lines.length} line(s), total ${total}`,
      module: 'ethical', transaction_id: orderId,
    })
    if (logError) console.warn('saveDraft: activity log insert failed:', logError.message)

    if (!options.silent) { toast.success('Draft saved.'); await fetchOrders() }
    return { success: true as const, orderId }
  } finally {
    loading.value = false
  }
}

// Lock the terms: mint the EO number, draw stock from the chosen location,
// start the credit term, and flip draft → invoiced. Best-effort, not atomic:
// a failure partway through can leave partial stock decrements (accepted
// trade-off, JS-over-RPC convention).
//
// Stock comes from ONE location (the draft's warehouse_id; null = the main
// warehouse) and nowhere else. A shortfall stays a shortfall and surfaces as
// `awaiting_stock` for a transfer or a procurement request to resolve.
export async function confirmDraft(draftId: number, options: { silent?: boolean } = {}) {
  loading.value = true
  clearError()
  try {
    const { user, error: authError } = await getAuthStore().getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return { success: false as const } }

    const { data: draft, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, outlet_id, warehouse_id, ethical_details(terms_days), transaction_items!transaction_items_transaction_id_fkey(id, product_id, qty_stock_out)')
      .eq('id', draftId)
      .eq('transaction_type', 'ethical_order')
      .maybeSingle()
    if (fetchError || !draft) { handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.'); return { success: false as const } }
    if (draft.status !== 'draft') { toast.error('This order has already been invoiced.'); return { success: false as const } }

    const lines = ((draft.transaction_items ?? []) as unknown as { id: number; product_id: number; qty_stock_out: number | null }[])
      .map((li) => ({ id: li.id, product_id: li.product_id, quantity: li.qty_stock_out ?? 0 }))
    if (!lines.length) { toast.warning('Add at least one line item before invoicing.'); return { success: false as const } }

    const sourceLocationId = draft.warehouse_id as StockLocationId
    if (!(await validateLocations(draft.outlet_id, sourceLocationId))) return { success: false as const }

    // The SAME planner the order form previewed with, so what the user approved
    // and what gets written cannot disagree. Re-run here rather than trusting a
    // figure from the form: another order may have taken the stock since.
    const plan = await getSourcingStore().planSourcing(sourceLocationId, lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })))
    // A failed stock read is NOT a shortage. Continuing here would invoice an
    // order sourced with nothing, turning a dropped connection into a backorder.
    if (!plan) { toast.error('Could not read stock for that location. The order was not invoiced.'); return { success: false as const } }

    // Claim the draft BEFORE any stock moves. The status-guarded update is
    // what stops a double click (or two users) from confirming — and drawing
    // stock — twice: only one of them can flip it out of 'draft'.
    const year = new Date().getFullYear().toString()
    const { data: claimed, docNo: orderNo, error: claimError } = await insertWithDocRetry<{ id: number }>(
      () => generateNextNumber('ethical_no', `EO-${year}-`, ['reference_no']),
      async (docNo) => supabase
        .from('transactions')
        .update({
          // Mirror the order number into reference_no too (parity with purchasing /
          // in-house). ethical_no stays the canonical per-type column; the
          // reference_no unique index already reserves the EO- prefix.
          ethical_no: docNo, reference_no: docNo,
          status: 'invoiced', updated_at: new Date().toISOString(),
          // The invoice date. created_at is when the DRAFT was started; the
          // GL projector books the sale on approved_at so revenue lands in
          // the period it was actually invoiced.
          approved_by: user.id, approved_at: new Date().toISOString(),
        })
        .eq('id', draftId)
        .eq('status', 'draft')
        .select('id')
        .maybeSingle(),
    )
    if (claimError) { handleError(claimError, 'Failed to invoice order.'); toast.error(claimError.message || 'Failed to invoice order.'); return { success: false as const } }
    if (!claimed) { toast.error('This order has already been invoiced.'); return { success: false as const } }

    // planSourcing zeroes an expired line rather than drawing it. Say so by
    // name: otherwise the line just lands short and staff go looking for
    // stock that is sitting on the shelf, unsellable.
    const expiredPlanned = plan.filter((p) => p.expired).map((p) => p.product_id)
    if (expiredPlanned.length) {
      const expiredProducts = await getProductsStore().fetchProductsByIds(expiredPlanned)
      const label = expiredProducts.length
        ? expiredProducts.map((p) => p.product_name).join(', ')
        : expiredPlanned.join(', ')
      toast.warning(`Expired, so not sourced: ${label}. Those lines are left awaiting stock.`)
    }

    let anyShort = false
    for (const [index, line] of lines.entries()) {
      const planned = plan[index]
      let sourced = 0

      if (planned && planned.take > 0) {
        const drawn = await getSourcingStore().drawStock(sourceLocationId, line.product_id, planned.take)
        // A failed draw must not be recorded as delivered stock, or the order
        // claims goods that never left the shelf.
        if (drawn) sourced = planned.take
        else toast.warning(`Stock for product ${line.product_id} could not be drawn; line left unsourced.`)
      }
      if (sourced < line.quantity) anyShort = true

      if (sourced > 0) {
        // stock_sources held a {branch, warehouse} split back when one line
        // could be filled from two places at once. With a single chosen
        // source there is nothing to split: WHERE is transactions.warehouse_id
        // and HOW MANY is actual_count_stock_out.
        const { error: lineError } = await supabase
          .from('transaction_items')
          .update({ actual_count_stock_out: sourced })
          .eq('id', line.id)
        if (lineError) {
          console.warn(`confirmDraft: sourced count not recorded for line ${line.id}:`, lineError.message)
          toast.warning(`Stock was drawn for product ${line.product_id}, but the line did not record it. Verify manually.`)
        }
      }
    }

    // Terms run from the invoice date, not from when the draft was started.
    const termsDays = (draft.ethical_details as unknown as { terms_days: number | null } | null)?.terms_days ?? 0
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + termsDays)
    const { error: detailsError } = await supabase
      .from('ethical_details')
      .update({ due_date: dueDate.toISOString().slice(0, 10), fulfillment_status: anyShort ? 'awaiting_stock' : 'fulfilled' })
      .eq('transaction_id', draftId)
    if (detailsError) {
      console.warn('confirmDraft: ethical_details update failed:', detailsError.message)
      toast.warning('Order invoiced, but its due date / stock status did not save. Verify manually.')
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'created', description: `Ethical order ${orderNo} invoiced`,
      module: 'ethical', transaction_id: draftId,
    })
    if (logError) console.warn('confirmDraft: activity log insert failed:', logError.message)

    if (!options.silent) toast.success(`Order ${orderNo} invoiced.`)
    await fetchOrders()
    return { success: true as const, orderId: draftId, orderNo }
  } finally {
    loading.value = false
  }
}

// Straight to invoice — a draft that is confirmed immediately. If the confirm
// step fails, the order is left as a DRAFT (visible, editable, no stock moved)
// rather than as a half-built invoice.
export async function createOrder(payload: OrderPayload) {
  const saved = await saveDraft(payload, { silent: true })
  if (!saved.success) return { success: false as const }
  const confirmed = await confirmDraft(saved.orderId, { silent: true })
  if (!confirmed.success) {
    toast.warning('The order was saved as a draft but not invoiced — retry to invoice it.')
    await fetchOrders()
    // The draft id is RETURNED on failure, not swallowed. Without it the form
    // stays in create mode, and pressing submit again runs saveDraft from
    // scratch — a second draft for the same order. The caller adopts this id
    // so a retry re-saves and re-confirms the draft that already exists.
    return { success: false as const, draftId: saved.orderId }
  }
  toast.success(`Ethical order ${confirmed.orderNo} created.`)
  return { success: true as const, orderId: confirmed.orderId }
}

// Discard a draft. It has no number, no stock movement and no ledger entry,
// so it is removed outright rather than cancelled. Its activity logs are
// kept: logs.transaction_id is ON DELETE SET NULL, so they survive unlinked,
// and the discard itself is logged the same way.
export async function deleteDraft(draftId: number) {
  loading.value = true
  clearError()
  try {
    const { user, error: authError } = await getAuthStore().getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }

    const { data: draft } = await supabase
      .from('transactions').select('id, status').eq('id', draftId).eq('transaction_type', 'ethical_order').maybeSingle()
    if (!draft || draft.status !== 'draft') { toast.error('Only drafts can be discarded.'); return { success: false } }

    // transaction_items is ON DELETE SET NULL (not cascade), so the lines
    // must go first or they would linger as orphans.
    for (const table of ['transaction_items', 'ethical_details'] as const) {
      const { error: childError } = await supabase.from(table).delete().eq('transaction_id', draftId)
      if (childError) { handleError(childError, 'Failed to discard draft.'); toast.error(childError.message || 'Failed to discard draft.'); return { success: false } }
    }
    const { error: deleteError } = await supabase
      .from('transactions').delete().eq('id', draftId).eq('status', 'draft')
    if (deleteError) { handleError(deleteError, 'Failed to discard draft.'); toast.error(deleteError.message || 'Failed to discard draft.'); return { success: false } }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'draft_discarded', description: `Ethical draft #${draftId} discarded`,
      module: 'ethical', transaction_id: null,
    })
    if (logError) console.warn('deleteDraft: activity log insert failed:', logError.message)

    toast.success('Draft discarded.')
    await fetchOrders()
    return { success: true }
  } finally {
    loading.value = false
  }
}
