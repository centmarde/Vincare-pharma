import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useCanvassDataStore } from '@/stores/canvassData'
import { generateIHNumber, generateDRNumber } from '@/utils/generativeHelpers'
import type { ProductType } from '@/stores/productsData'
import type { CustomerType } from '@/stores/customersData'
import type { Shortfall, CanvassQuote, CanvassSelection, CanvassPRResult } from '@/utils/canvassTypes'
import type { CollectionType } from '@/stores/ethicalData'

const toast = useToast()

// In-house government/LGU orders live in the transactions hub as
// transaction_type = 'inhouse_order'; lines in transaction_items; negotiation
// rounds in logs. View-model mapped from the hub (same style as salesData).

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
  order_no: string | null        // internal IH-YYYY-###
  govt_po_no: string | null      // the government's PO number
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

// Line values live in the 1:1 transaction_item_details extension table —
// transaction_items is a pure link (id/transaction_id/product_id).
const SELECT_ORDER =
  '*, transaction_items(id, product_id, transaction_item_details(qty, unit_price, line_total, cost_price, delivered_qty), product:product_id(*)), customer:customer_id(*), inhouse_details(*)'

function mapRow(row: any): InhouseOrderType {
  const details = row.inhouse_details ?? {}
  return {
    id:           row.id,
    created_at:   row.created_at,
    order_no:     row.reference_no,
    govt_po_no:   row.po_no,
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
    items: (row.transaction_items ?? []).map((li: any) => {
      const d = li.transaction_item_details ?? {}
      return {
        id:            li.id,
        product_id:    li.product_id,
        qty:           d.qty,
        unit_price:    d.unit_price,
        line_total:    d.line_total,
        cost_price:    d.cost_price,
        delivered_qty: d.delivered_qty ?? 0,
        product:       li.product,
      }
    }),
  }
}

export const useInhouseDataStore = defineStore('inhouseData', () => {
  const authStore = useAuthUserStore()
  const canvassStore = useCanvassDataStore()

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
    govtPoNo?: string
    remarks?: string
    lines: InhouseLineInput[]
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }
    if (!payload.lines.length) { toast.warning('Add at least one line item.'); loading.value = false; return { success: false } }

    const subtotal = payload.lines.reduce((sum, l) => sum + l.qty * l.unit_price, 0)

    const orderNo = await generateIHNumber()

    const { data: created, error: insertError } = await supabase
      .from('transactions')
      .insert({
        reference_no: orderNo,
        po_no: payload.govtPoNo || null,
        transaction_type: 'inhouse_order',
        status: 'negotiating',
        customer_id: payload.customerId,
        total_amount: subtotal,
        remarks: payload.remarks || null,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (insertError || !created) {
      handleError(insertError, 'Failed to create order.'); toast.error(insertError?.message || 'Failed to create order.')
      loading.value = false; return { success: false }
    }

    const { error: detailsError } = await supabase.from('inhouse_details').insert({ transaction_id: created.id })
    if (detailsError) {
      handleError(detailsError, 'Failed to create order.'); toast.error(detailsError.message || 'Failed to create order.')
      loading.value = false; return { success: false }
    }

    const { data: createdItems, error: itemsError } = await supabase
      .from('transaction_items')
      .insert(payload.lines.map(l => ({ transaction_id: created.id, product_id: l.product_id })))
      .select('id')
    if (itemsError || !createdItems) {
      handleError(itemsError, 'Failed to save order line items.'); toast.error(itemsError?.message || 'Failed to save order line items.')
      loading.value = false; return { success: false }
    }

    const { error: itemDetailsError } = await supabase.from('transaction_item_details').insert(
      createdItems.map((row, i) => ({
        transaction_item_id: row.id, qty: payload.lines[i].qty, unit_price: payload.lines[i].unit_price,
        line_total: payload.lines[i].qty * payload.lines[i].unit_price, cost_price: payload.lines[i].cost_price,
      })),
    )
    if (itemDetailsError) {
      handleError(itemDetailsError, 'Failed to save order line items.'); toast.error(itemDetailsError.message || 'Failed to save order line items.')
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
      // product_id is a link-table column (stays on transaction_items); the
      // rest are line values (transaction_item_details). Omitting cost_price
      // keeps the existing value (mirrors the RPC's coalesce-with-existing-row
      // behavior) — never overwrite with null.
      if (u.product_id != null) {
        const { error: linkError } = await supabase
          .from('transaction_items')
          .update({ product_id: u.product_id })
          .eq('id', u.item_id)
          .eq('transaction_id', payload.orderId)
        if (linkError) {
          handleError(linkError, 'Failed to update order line.'); toast.error(linkError.message || 'Failed to update order line.')
          loading.value = false; return { success: false }
        }
      }

      const detailsUpdatePayload: Record<string, unknown> = { unit_price: u.unit_price, line_total: u.unit_price * u.qty }
      if (u.cost_price != null) detailsUpdatePayload.cost_price = u.cost_price
      const { error: lineError } = await supabase
        .from('transaction_item_details')
        .update(detailsUpdatePayload)
        .eq('transaction_item_id', u.item_id)
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
      module: 'inhouse_negotiation', transaction_id: payload.orderId,
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
      .select('id, status, transaction_items(product_id, transaction_item_details(qty))')
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
    const lines = ((order.transaction_items ?? []) as unknown as { product_id: number; transaction_item_details: { qty: number } | null }[])
      .map(li => ({ product_id: li.product_id, qty: li.transaction_item_details?.qty ?? 0 }))
    for (const line of lines) {
      const { data: product } = await supabase.from('products').select('current_stock').eq('id', line.product_id).maybeSingle()
      const onHand = product?.current_stock ?? 0
      if (onHand < line.qty) {
        shortfall.push({ product_id: line.product_id, ordered: line.qty, on_hand: onHand, needed: line.qty - onHand } as Shortfall)
      }
    }

    const nowIso = new Date().toISOString()
    const { error: statusError } = await supabase
      .from('transactions')
      .update({
        approved_by: user.id, approved_at: nowIso, updated_at: nowIso,
        status: shortfall.length > 0 ? 'awaiting_stock' : 'ready',
      })
      .eq('id', orderId)
    if (statusError) {
      handleError(statusError, 'Failed to agree order.'); toast.error(statusError.message || 'Failed to agree order.')
      loading.value = false; return { success: false }
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'agree', description: 'Terms agreed',
      module: 'inhouse_negotiation', transaction_id: orderId,
    })
    if (logError) console.warn('agreeOrder: activity log insert failed:', logError.message)

    toast.success(shortfall.length ? 'Agreed — but stock is short.' : 'Agreed — stock is sufficient.')
    await fetchOrders()
    loading.value = false
    return { success: true, shortfall }
  }

  // Re-attempt the same warehouse stock check for an awaiting_stock/ready order
  // (was inhouse_recheck_stock).
  const recheckStock = async (orderId: number): Promise<Shortfall[]> => {
    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('transaction_items(product_id, transaction_item_details(qty))')
      .eq('id', orderId)
      .maybeSingle()
    if (fetchError || !order) { handleError(fetchError, 'Failed to recheck stock'); return [] }

    const shortfall: Shortfall[] = []
    const lines = ((order.transaction_items ?? []) as unknown as { product_id: number; transaction_item_details: { qty: number } | null }[])
      .map(li => ({ product_id: li.product_id, qty: li.transaction_item_details?.qty ?? 0 }))
    for (const line of lines) {
      const { data: product } = await supabase.from('products').select('current_stock').eq('id', line.product_id).maybeSingle()
      const onHand = product?.current_stock ?? 0
      if (onHand < line.qty) {
        shortfall.push({ product_id: line.product_id, ordered: line.qty, on_hand: onHand, needed: line.qty - onHand } as Shortfall)
      }
    }

    await supabase
      .from('transactions')
      .update({ status: shortfall.length > 0 ? 'awaiting_stock' : 'ready', updated_at: new Date().toISOString() })
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
      .select('id, status, customer_id, po_no')
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

    const drNo = await generateDRNumber()

    const { data: dr, error: drError } = await supabase
      .from('transactions')
      .insert({
        reference_no: drNo, transaction_type: 'delivery_receipt', parent_transaction_id: orderId,
        customer_id: order.customer_id, po_no: order.po_no || null,
        remarks: opts.receivedBy || null, created_by: user.id,
      })
      .select('id')
      .single()
    if (drError || !dr) {
      handleError(drError, 'Failed to record delivery.'); toast.error(drError?.message || 'Failed to record delivery.')
      loading.value = false; return { success: false }
    }

    for (const line of lines) {
      if (line.qty <= 0) continue

      const { data: item, error: itemFetchError } = await supabase
        .from('transaction_items')
        .select('product_id, transaction_item_details(qty, delivered_qty, unit_price)')
        .eq('id', line.item_id)
        .eq('transaction_id', orderId)
        .maybeSingle()
      if (itemFetchError) {
        handleError(itemFetchError, 'Failed to record delivery.'); toast.error(itemFetchError.message || 'Failed to record delivery.')
        loading.value = false; return { success: false }
      }
      if (!item?.product_id) continue
      const itemDetails = (item.transaction_item_details ?? {}) as unknown as { qty?: number; delivered_qty?: number; unit_price?: number }

      const delivered = itemDetails.delivered_qty ?? 0
      if (delivered + line.qty > (itemDetails.qty ?? 0)) {
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
        .from('transaction_item_details')
        .update({ delivered_qty: delivered + line.qty })
        .eq('transaction_item_id', line.item_id)
      if (deliveredError) console.warn('deliver: delivered_qty update failed:', deliveredError.message)

      const { data: drItem, error: drItemError } = await supabase
        .from('transaction_items')
        .insert({ transaction_id: dr.id, product_id: item.product_id })
        .select('id')
        .single()
      if (drItemError || !drItem) {
        console.warn('deliver: DR line insert failed:', drItemError?.message)
      } else {
        const { error: drItemDetailsError } = await supabase.from('transaction_item_details').insert({
          transaction_item_id: drItem.id, qty: line.qty,
          unit_price: itemDetails.unit_price, line_total: (itemDetails.unit_price ?? 0) * line.qty,
        })
        if (drItemDetailsError) console.warn('deliver: DR line details insert failed:', drItemDetailsError.message)
      }
    }

    // Supabase can't compare two columns server-side, so check client-side.
    const { data: allItems } = await supabase
      .from('transaction_items').select('transaction_item_details(qty, delivered_qty)').eq('transaction_id', orderId)
    const stillShort = ((allItems ?? []) as unknown as { transaction_item_details: { qty?: number; delivered_qty?: number } | null }[])
      .some(i => (i.transaction_item_details?.delivered_qty ?? 0) < (i.transaction_item_details?.qty ?? 0))

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
    return { success: true, drId: dr.id, drNo }
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

    const { data: payment, error: paymentError } = await supabase
      .from('collections')
      .insert({
        transaction_id: payload.orderId, amount: payload.amount,
        payment_method: payload.method || null, reference_no: payload.reference || null,
        collected_by: user.id, remarks: payload.remarks || null,
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

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'payment',
      description: `Payment of ${payload.amount} recorded (${newPaid}/${total})`,
      module: 'inhouse', transaction_id: payload.orderId,
    })
    if (logError) console.warn('recordPayment: activity log insert failed:', logError.message)

    toast.success('Payment recorded.')
    await fetchOrders()
    loading.value = false
    return { success: true, paymentId: payment.id }
  }

  const fetchPayments = async (orderId: number): Promise<CollectionType[]> => {
    const { data, error: e } = await supabase
      .from('collections').select('*')
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
      .eq('transaction_id', orderId).eq('module', 'inhouse_negotiation')
      .order('created_at', { ascending: true })
    if (e) { handleError(e, 'Failed to load negotiation history'); return [] }
    return (data || []) as NegotiationRound[]
  }

  const resetStore = () => { orders.value = []; loading.value = false; error.value = '' }

  return {
    orders, loading, error,
    fetchOrders, fetchOrderById, createOrder, recordOffer, agreeOrder,
    recheckStock, deliver, recordPayment, fetchPayments, canvassToPRs, fetchNegotiation,
    startRealtime, stopRealtime, clearError, resetStore,
  }
})
