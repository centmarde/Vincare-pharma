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
import { useCustomersDataStore } from '@/stores/customersData'
import type { CustomerType } from '@/stores/customersData'
import type { Shortfall, CanvassQuote, CanvassSelection, CanvassPRResult } from '@/utils/canvassTypes'
import type { CollectionType } from '@/stores/ethicalData'

const toast = useToast()

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
  govt_po_no: string | null      // the government's own external PO number, typed at raise
                                 // time — pure transparency/documentation, no logic keys off
                                 // it (lives in inhouse_details, NOT transactions.po_no)
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
  '*, transaction_items(id, product_id, qty_stock_out, unit_price, line_total, cost_price, actual_count_stock_out, product:product_id(*)), customer:customer_id(*), inhouse_details(*)'

function mapRow(row: any): InhouseOrderType {
  const details = row.inhouse_details ?? {}
  return {
    id:           row.id,
    created_at:   row.created_at,
    order_no:     row.inhouse_no,
    po_no:        row.po_no,
    govt_po_no:   details.govt_po_no ?? null,
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
  const customersStore = useCustomersDataStore()

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
    govtPoNo?: string   // the government's external PO number (documentation-only)
    poAmount?: number   // the value on that PO (documentation-only; AR SOA column)
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

    for (const u of payload.lineUpdates ?? []) {
      // All line fields now live on transaction_items, so one update per line.
      // Omitting cost_price keeps the existing value (mirrors the RPC's
      // coalesce-with-existing-row behavior) — never overwrite with null.
      const lineUpdatePayload: Record<string, unknown> = { unit_price: u.unit_price, line_total: u.unit_price * u.qty }
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
      description: `${payload.note ?? ''} | proposed: ${payload.total}`,
      module: 'inhouse', transaction_id: payload.orderId,
    })
    if (logError) console.warn('recordOffer: activity log insert failed:', logError.message)

    toast.success('Offer recorded.')
    await fetchOrders()
    loading.value = false
    return { success: true }
  }

  // Read-only warehouse stock check, flag ready vs awaiting_stock (was inhouse_agree).
  const agreeOrder = async (orderId: number): Promise<{ success: boolean; shortfall?: Shortfall[] }> => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, transaction_items(product_id, qty_stock_out)')
      .eq('id', orderId)
      .eq('transaction_type', 'inhouse_order')
      .maybeSingle()
    if (fetchError || !order) {
      handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.')
      loading.value = false; return { success: false }
    }
    if (order.status !== 'negotiating') {
      toast.error('Order is not under negotiation.')
      loading.value = false; return { success: false }
    }

    const shortfall: Shortfall[] = []
    const lines = ((order.transaction_items ?? []) as unknown as { product_id: number; qty_stock_out: number | null }[])
      .map(li => ({ product_id: li.product_id, qty: li.qty_stock_out ?? 0 }))
    for (const line of lines) {
      const { data: product } = await supabase.from('products').select('current_stock').eq('id', line.product_id).maybeSingle()
      const onHand = product?.current_stock ?? 0
      if (onHand < line.qty) {
        shortfall.push({ product_id: line.product_id, ordered: line.qty, on_hand: onHand, needed: line.qty - onHand } as Shortfall)
      }
    }

    // Agreement is the PO stage — but only when the order can actually be
    // fulfilled from stock. Minting the company PO number (from the SHARED
    // Purchasing PO series, PO-YYYY-###, numeric max + 1) while the order is
    // still short would stamp a "PO" onto something Purchasing hasn't sourced
    // yet — reads as an auto-created PO despite no canvassing having happened.
    // So: sufficient stock → mint po_no now (as before). Short → leave po_no
    // null; it gets minted once recheckStock finds the shortfall resolved.
    const poNo = shortfall.length > 0 ? null : await generateDocNumber('PO', getLatestReferenceNo)

    const nowIso = new Date().toISOString()
    const { error: statusError } = await supabase
      .from('transactions')
      .update({
        approved_by: user.id, approved_at: nowIso, updated_at: nowIso,
        po_no: poNo,
        status: shortfall.length > 0 ? 'awaiting_stock' : 'ready',
      })
      .eq('id', orderId)
    if (statusError) {
      handleError(statusError, 'Failed to agree order.'); toast.error(statusError.message || 'Failed to agree order.')
      loading.value = false; return { success: false }
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

  // Read-only warehouse stock check for display — NO status flip, NO po_no
  // minting. Used when a detail view merely OPENS an awaiting_stock order, so
  // simply looking at an order never advances it or mints a document number.
  // Any state change is the explicit "Re-check stock" button's job (recheckStock).
  const computeShortfall = async (orderId: number): Promise<Shortfall[]> => {
    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('transaction_items(product_id, qty_stock_out)')
      .eq('id', orderId)
      .maybeSingle()
    if (fetchError || !order) { handleError(fetchError, 'Failed to check stock'); return [] }

    const shortfall: Shortfall[] = []
    const lines = ((order.transaction_items ?? []) as unknown as { product_id: number; qty_stock_out: number | null }[])
      .map(li => ({ product_id: li.product_id, qty: li.qty_stock_out ?? 0 }))
    for (const line of lines) {
      const { data: product } = await supabase.from('products').select('current_stock').eq('id', line.product_id).maybeSingle()
      const onHand = product?.current_stock ?? 0
      if (onHand < line.qty) {
        shortfall.push({ product_id: line.product_id, ordered: line.qty, on_hand: onHand, needed: line.qty - onHand } as Shortfall)
      }
    }
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
  // Was inhouse_deliver. Best-effort, not atomic: a failure partway through a
  // multi-line delivery can leave some lines delivered / stock deducted and
  // others not (accepted trade-off, JS-over-RPC convention). Note: `remarks`
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

    // Move stock + bump delivered_qty per line, collecting the DR line data as we
    // go. The DR document itself is written by the DR store afterwards.
    const drLines: { product_id: number | null; qty: number; unit_price: number | null }[] = []
    for (const line of lines) {
      if (line.qty <= 0) continue

      const { data: item, error: itemFetchError } = await supabase
        .from('transaction_items')
        .select('product_id, qty_stock_out, actual_count_stock_out, unit_price')
        .eq('id', line.item_id)
        .eq('transaction_id', orderId)
        .maybeSingle()
      if (itemFetchError) {
        handleError(itemFetchError, 'Failed to record delivery.'); toast.error(itemFetchError.message || 'Failed to record delivery.')
        loading.value = false; return { success: false }
      }
      if (!item?.product_id) continue

      const delivered = item.actual_count_stock_out ?? 0
      if (delivered + line.qty > (item.qty_stock_out ?? 0)) {
        toast.error(`Delivery exceeds ordered qty for item ${line.item_id}.`)
        loading.value = false; return { success: false }
      }

      const { data: product } = await supabase.from('products').select('current_stock').eq('id', item.product_id).maybeSingle()
      if ((product?.current_stock ?? 0) < line.qty) {
        toast.error(`Insufficient warehouse stock for product ${item.product_id}.`)
        loading.value = false; return { success: false }
      }

      const { error: stockError } = await supabase
        .from('products')
        .update({ current_stock: (product?.current_stock ?? 0) - line.qty })
        .eq('id', item.product_id)
      if (stockError) {
        handleError(stockError, 'Failed to deduct warehouse stock.'); toast.error(stockError.message || 'Failed to deduct warehouse stock.')
        loading.value = false; return { success: false }
      }

      const { error: deliveredError } = await supabase
        .from('transaction_items')
        .update({ actual_count_stock_out: delivered + line.qty })
        .eq('id', line.item_id)
      if (deliveredError) console.warn('deliver: delivered count update failed:', deliveredError.message)

      drLines.push({ product_id: item.product_id, qty: line.qty, unit_price: item.unit_price ?? null })
    }

    // Issue the DR document (dedicated delivery_receipts tables, owned by drStore).
    const drResponse = await drStore.createDeliveryReceipt({
      orderId, orderNo: order.inhouse_no, source: 'inhouse_order', customerId: order.customer_id,
      poNo: order.po_no || null, receivedBy: opts.receivedBy || null, lines: drLines,
    }, user.id)
    if (!drResponse.success) {
      toast.error('Failed to record delivery.')
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
    cashAccountId: number
  }) => {
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
    // pointing at a missing account would record money as landing nowhere.
    const { data: account, error: accountError } = await supabase
      .from('cash_accounts').select('id, name, balance').eq('id', payload.cashAccountId).maybeSingle()
    if (accountError || !account) {
      toast.error('Select a valid cash account to deposit this payment into.')
      loading.value = false; return { success: false }
    }

    const { data: payment, error: paymentError } = await supabase
      .from('collections')
      .insert({
        transaction_id: payload.orderId, amount: payload.amount,
        payment_method: payload.method || null, reference_no: payload.reference || null,
        collected_by: user.id, remarks: payload.remarks || null,
        cash_account_id: payload.cashAccountId,
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
    const { error: balanceError } = await supabase
      .from('cash_accounts')
      .update({ balance: (account.balance ?? 0) + payload.amount })
      .eq('id', payload.cashAccountId)
    if (balanceError) {
      console.warn('recordPayment: cash account balance update failed:', balanceError.message)
      toast.warning(`Payment recorded, but ${account.name}'s balance was not updated. Verify it manually.`)
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'payment',
      description: `Payment of ${payload.amount} into ${account.name} (${newPaid}/${total})`,
      module: 'inhouse', transaction_id: payload.orderId,
    })
    if (logError) console.warn('recordPayment: activity log insert failed:', logError.message)

    toast.success('Payment recorded.')
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
    fetchOrders, fetchOrderById, createOrder, recordOffer, agreeOrder,
    computeShortfall, recheckStock, deliver, recordPayment, fetchPayments, canvassToPRs, fetchNegotiation,
    startRealtime, stopRealtime, clearError, resetStore,
  }
})
