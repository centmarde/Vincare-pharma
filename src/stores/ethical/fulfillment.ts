// Fulfillment: delivery receipts, cancelling an invoiced order (returning its
// stock), re-checking stock for short lines, and raising PRs off a supplier
// canvass.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useCanvassDataStore } from '@/stores/canvassData'
import { useDeliveryReceiptsDataStore } from '@/stores/deliveryReceiptsData'
import { useStockSourcingStore } from '@/stores/stockSourcingData'
import type { StockLocationId } from '@/stores/stockSourcingData'
import type { Shortfall, CanvassSelection } from './types'
import { loading, handleError, clearError } from './state'
import { fetchOrders } from './orders'

const toast = useToast()

// Resolved lazily rather than at import time: a store factory called while
// this module is first evaluated can run before Pinia is installed.
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())
let canvassStore: ReturnType<typeof useCanvassDataStore> | null = null
const getCanvassStore = () => (canvassStore ??= useCanvassDataStore())
let drStore: ReturnType<typeof useDeliveryReceiptsDataStore> | null = null
const getDRStore = () => (drStore ??= useDeliveryReceiptsDataStore())
let sourcingStore: ReturnType<typeof useStockSourcingStore> | null = null
const getSourcingStore = () => (sourcingStore ??= useStockSourcingStore())

// Issue a Delivery Receipt for the fulfilled quantities. Document-only (stock
// already moved at invoice) — was ethical_issue_dr; re-issuable (a reprint is
// a fresh DR number). Returns the DR so the caller can print it immediately.
export async function issueDeliveryReceipt(payload: {
  orderId: number
  receivedBy?: string
  remarks?: string
}) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

  const { data: order, error: fetchError } = await supabase
    .from('transactions')
    .select('id, status, customer_id, ethical_no')
    .eq('id', payload.orderId)
    .eq('transaction_type', 'ethical_order')
    .maybeSingle()
  if (fetchError || !order) {
    handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.')
    loading.value = false; return { success: false }
  }
  if (order.status === 'cancelled') {
    toast.error('Cannot issue a DR for a cancelled order.'); loading.value = false; return { success: false }
  }
  if (order.status === 'draft') {
    toast.error('Invoice the order before issuing a DR.'); loading.value = false; return { success: false }
  }

  const { data: fulfilledItemRows, error: itemsError } = await supabase
    .from('transaction_items')
    .select('product_id, actual_count_stock_out, unit_price')
    .eq('transaction_id', payload.orderId)
    .gt('actual_count_stock_out', 0)
  if (itemsError) {
    handleError(itemsError, 'Failed to issue delivery receipt.')
    toast.error(itemsError.message || 'Failed to issue delivery receipt.')
    loading.value = false; return { success: false }
  }
  if (!fulfilledItemRows || fulfilledItemRows.length === 0) {
    toast.error('Nothing has been fulfilled on this order yet to receipt.')
    loading.value = false; return { success: false }
  }

  // actual_count_stock_out is CUMULATIVE (the order's running total, not a
  // per-delivery amount), so a second DR after a recheck resolves more of
  // the shortfall must only list the NEW quantity, not the full cumulative
  // total again — otherwise units already on a prior DR get re-listed as if
  // newly delivered. Subtract what earlier DRs for this order already put
  // on paper, per product.
  const { data: priorDrLines, error: priorDrError } = await supabase
    .from('delivery_receipts')
    .select('delivery_receipt_items(product_id, qty)')
    .eq('order_id', payload.orderId)
    .eq('source', 'ethical_order')
  if (priorDrError) {
    handleError(priorDrError, 'Failed to issue delivery receipt.')
    toast.error(priorDrError.message || 'Failed to issue delivery receipt.')
    loading.value = false; return { success: false }
  }
  const alreadyReceipted = new Map<number, number>()
  for (const dr of (priorDrLines ?? []) as { delivery_receipt_items: { product_id: number | null; qty: number }[] }[]) {
    for (const line of dr.delivery_receipt_items ?? []) {
      if (line.product_id == null) continue
      alreadyReceipted.set(line.product_id, (alreadyReceipted.get(line.product_id) ?? 0) + line.qty)
    }
  }

  const fulfilledItems = fulfilledItemRows
    .map((row: any) => {
      const already = row.product_id != null ? (alreadyReceipted.get(row.product_id) ?? 0) : 0
      return {
        product_id: row.product_id,
        delivered_qty: (row.actual_count_stock_out ?? 0) - already,
        unit_price: row.unit_price,
      }
    })
    .filter((item) => item.delivered_qty > 0)
  if (!fulfilledItems.length) {
    toast.error('Nothing new to receipt since the last delivery receipt.')
    loading.value = false; return { success: false }
  }

  // Document-only DR (no stock movement) into the dedicated tables via drStore.
  const dr = await getDRStore().createDeliveryReceipt({
    orderId: payload.orderId, orderNo: order.ethical_no, source: 'ethical_order', customerId: order.customer_id,
    poNo: null, receivedBy: payload.receivedBy || null,
    lines: fulfilledItems.map(item => ({
      product_id: item.product_id, qty: item.delivered_qty, unit_price: item.unit_price,
    })),
  }, user.id)
  if (!dr.success) {
    toast.error('Failed to issue delivery receipt.')
    loading.value = false; return { success: false }
  }
  const drNo = dr.drNo!

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'deliver', description: `Delivery receipt ${drNo} issued`,
    module: 'ethical', transaction_id: payload.orderId,
  })
  if (logError) console.warn('issueDeliveryReceipt: activity log insert failed:', logError.message)

  toast.success(`${drNo} issued.`)
  loading.value = false
  return { success: true, drId: dr.drId, drNo }
}

// Return the goods to the location they were drawn from, only for invoiced,
// fully-fulfilled, uncollected orders (was ethical_cancel_order). The source
// is transactions.warehouse_id (null = main warehouse); the quantity is the
// line's actual_count_stock_out — what actually left, which is not always what
// was ordered.
export async function cancelOrder(orderId: number, reason: string) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

  const { data: order, error: fetchError } = await supabase
    .from('transactions')
    .select('id, status, warehouse_id, ethical_details(fulfillment_status)')
    .eq('id', orderId)
    .eq('transaction_type', 'ethical_order')
    .maybeSingle()
  if (fetchError || !order) {
    handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.')
    loading.value = false; return { success: false }
  }
  if (order.status !== 'invoiced') {
    toast.error('Only invoiced orders with no collections can be cancelled.'); loading.value = false; return { success: false }
  }
  const fulfillmentStatus = (order.ethical_details as unknown as { fulfillment_status: string | null } | null)?.fulfillment_status
  if (fulfillmentStatus !== 'fulfilled') {
    toast.error('Cannot cancel an order that is still awaiting stock.'); loading.value = false; return { success: false }
  }
  // Voided collections don't block cancellation — they no longer represent money received.
  const { count: collectionCount } = await supabase
    .from('collections').select('id', { count: 'exact', head: true }).eq('transaction_id', orderId).is('voided_at', null)
  if ((collectionCount ?? 0) > 0) {
    toast.error('Cannot cancel: order has collections.'); loading.value = false; return { success: false }
  }

  const { data: itemRows } = await supabase
    .from('transaction_items').select('product_id, actual_count_stock_out').eq('transaction_id', orderId)
  const items = (itemRows ?? []).map((row: any) => ({
    product_id: row.product_id as number | null,
    sourced: (row.actual_count_stock_out ?? 0) as number,
  }))

  // Best-effort restore, but — unlike other best-effort loops in this file —
  // a silent failure here used to leave stock permanently short while the
  // order still got marked 'cancelled' (implying the full restore
  // happened), with zero trace anywhere. Track failures so the log/toast
  // below actually reflect what happened.
  let restoreFailed = false
  for (const item of items) {
    if (item.product_id == null || item.sourced <= 0) continue
    const restored = await getSourcingStore().returnStock(
      order.warehouse_id as StockLocationId,
      item.product_id,
      item.sourced,
    )
    if (!restored) {
      console.warn(`cancelOrder: stock restore failed for product ${item.product_id}`)
      restoreFailed = true
    }
  }

  const { error: statusError } = await supabase
    .from('transactions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', orderId)
  if (statusError) {
    handleError(statusError, 'Failed to cancel order.')
    toast.error(statusError.message || 'Failed to cancel order.')
    loading.value = false
    return { success: false }
  }

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'cancelled',
    description: `Ethical order cancelled: ${reason || '(no reason)'}${restoreFailed ? ' — WARNING: stock restore partially failed, verify manually' : ''}`,
    module: 'ethical', transaction_id: orderId,
  })
  if (logError) console.warn('cancelOrder: activity log insert failed:', logError.message)

  if (restoreFailed) toast.warning('Order cancelled, but stock restore partially failed — verify stock manually.')
  else toast.success('Order cancelled and stock restored.')
  await fetchOrders()
  loading.value = false
  return { success: true }
}

// Re-attempt sourcing for short lines against the order's OWN location (was
// ethical_recheck_stock). It never reaches into another location: the order is
// bound to the source the user chose, and quietly filling it from elsewhere is
// what this refactor removed.
export async function recheckStock(orderId: number): Promise<Shortfall[]> {
  const { data: order, error: fetchError } = await supabase
    .from('transactions').select('warehouse_id').eq('id', orderId).eq('transaction_type', 'ethical_order').maybeSingle()
  if (fetchError || !order) { handleError(fetchError, 'Failed to recheck stock'); return [] }
  const locationId = order.warehouse_id as StockLocationId

  // Supabase can't compare two columns server-side, so filter client-side.
  const { data: allLineRows } = await supabase
    .from('transaction_items')
    .select('id, product_id, qty_stock_out, actual_count_stock_out')
    .eq('transaction_id', orderId)
  const allLines = (allLineRows ?? []).map((row: any) => ({
    id: row.id,
    product_id: row.product_id,
    qty: row.qty_stock_out ?? 0,
    delivered_qty: row.actual_count_stock_out ?? 0,
  }))
  const shortLines = allLines.filter(l => l.delivered_qty < l.qty)

  // One planner call for every short line, so two lines naming the same
  // product can't both be promised the same units.
  const plan = await getSourcingStore().planSourcing(
    locationId,
    shortLines.map(l => ({ product_id: l.product_id, quantity: l.qty - l.delivered_qty })),
  )
  // Same reasoning as createOrder: a failed read must not be mistaken for a
  // shortage, or a recheck would silently confirm the order is still short.
  if (!plan) {
    toast.error('Could not read stock for that location. Nothing was changed.')
    return []
  }

  const shortfall: Shortfall[] = []
  for (const [index, line] of shortLines.entries()) {
    const planned = plan[index]
    let sourced = 0

    if (planned && planned.take > 0) {
      const drawn = await getSourcingStore().drawStock(locationId, line.product_id, planned.take)
      if (drawn) sourced = planned.take
    }
    const need = (line.qty - line.delivered_qty) - sourced

    await supabase.from('transaction_items')
      .update({ actual_count_stock_out: (line.delivered_qty ?? 0) + sourced })
      .eq('id', line.id)

    if (need > 0) {
      shortfall.push({
        product_id: line.product_id, ordered: line.qty,
        on_hand: (line.delivered_qty ?? 0) + sourced, needed: need,
      } as Shortfall)
    }
  }

  await supabase
    .from('ethical_details')
    .update({ fulfillment_status: shortfall.length > 0 ? 'awaiting_stock' : 'fulfilled' })
    .eq('transaction_id', orderId)

  await fetchOrders()
  return shortfall
}

// Commit a supplier canvass: create one PR per winning supplier (shared with
// In-House via canvassData.ts — was the shared canvass_to_prs RPC).
export async function canvassToPRs(orderId: number, selections: CanvassSelection[]) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }
  if (!selections.length) { toast.warning('Add at least one supplier selection.'); loading.value = false; return { success: false } }

  const result = await getCanvassStore().commitToPRs('ethical_order', orderId, selections, user.id)
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
