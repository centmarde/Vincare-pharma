import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useCanvassDataStore } from '@/stores/canvassData'
import { nextDocNumber } from '@/utils/helpers'
import type { ProductType } from '@/stores/productsData'
import type { CustomerType } from '@/stores/customersData'
import type { AgentType } from '@/stores/agentsData'
import type { OutletType } from '@/stores/outletsData'
import type { Shortfall, CanvassSelection, CanvassPRResult } from '@/utils/canvassTypes'

const toast = useToast()

export type { Shortfall, CanvassSelection, CanvassPRResult }

export type EthicalItemType = {
  id: number
  product_id: number | null
  quantity: number
  unit_price: number
  line_total: number
  delivered_qty: number
  product?: ProductType | null
}

export type CollectionType = {
  id: number
  created_at: string
  transaction_id: number | null
  amount: number | null
  payment_method: string | null
  reference_no: string | null
  collected_by: string | null
  agent_id: number | null
  commission_rate: number | null
  commission_amount: number | null
  commission_status: string | null
  commission_paid_at: string | null
  remarks: string | null
}

export type EthicalOrderType = {
  id: number
  created_at: string
  order_no: string | null
  outlet_id: number | null
  outlet?: OutletType | null
  customer_id: number | null
  agent_id: number | null
  status: string | null
  fulfillment_status: string | null
  subtotal: number | null
  total_amount: number | null
  discount_amount: number | null
  rebate_amount: number | null
  terms_days: number | null
  due_date: string | null
  amount_paid: number | null
  paid_at: string | null
  created_by: string | null
  remarks: string | null
  customer?: CustomerType | null
  agent?: AgentType | null
  items?: EthicalItemType[]
  collections?: CollectionType[]
}

export type EthicalLineInput = {
  product_id: number
  quantity: number
  unit_price: number
}

type FetchOrdersOptions = {
  status?: string
  agentId?: number
  customerId?: number
  orderBy?: 'created_at' | 'due_date' | 'total_amount'
  ascending?: boolean
}

type CommissionSummaryRow = {
  agent_id: number | null
  agent_name: string | null
  total_commission: number
  unpaid_commission: number
  paid_commission: number
}

// Line values live in the 1:1 transaction_item_details extension table —
// transaction_items is a pure link (id/transaction_id/product_id).
const SELECT_ORDER =
  '*, transaction_items(id, product_id, transaction_item_details(qty, unit_price, line_total, delivered_qty, stock_sources), product:product_id(*)), customer:customer_id(*), agent:agent_id(*), outlet:outlet_id(*), ethical_details(*)'

function mapRow(row: any): EthicalOrderType {
  const details = row.ethical_details ?? {}
  const discountAmount = details.discount_amount ?? 0
  const rebateAmount = details.rebate_amount ?? 0
  return {
    id:             row.id,
    created_at:     row.created_at,
    order_no:       row.reference_no,
    outlet_id:      row.outlet_id,
    outlet:         row.outlet,
    customer_id:    row.customer_id,
    agent_id:       row.agent_id,
    status:         row.status,
    fulfillment_status: details.fulfillment_status ?? null,
    subtotal:       (row.total_amount ?? 0) + discountAmount + rebateAmount,
    total_amount:   row.total_amount,
    discount_amount: discountAmount,
    rebate_amount:  rebateAmount,
    terms_days:     details.terms_days ?? null,
    due_date:       details.due_date ?? null,
    amount_paid:    details.amount_paid ?? 0,
    paid_at:        details.paid_at ?? null,
    created_by:     row.created_by,
    remarks:        row.remarks,
    customer:       row.customer,
    agent:          row.agent,
    items: (row.transaction_items ?? []).map((li: any) => {
      const d = li.transaction_item_details ?? {}
      return {
        id:            li.id,
        product_id:    li.product_id,
        quantity:      d.qty,
        unit_price:    d.unit_price,
        line_total:    d.line_total,
        delivered_qty: d.delivered_qty ?? 0,
        product:       li.product,
      }
    }),
  }
}

export const useEthicalDataStore = defineStore('ethicalData', () => {
  const authStore = useAuthUserStore()
  const canvassStore = useCanvassDataStore()

  const orders: Ref<EthicalOrderType[]> = ref([])
  const currentOrder: Ref<EthicalOrderType | undefined> = ref(undefined)
  const collections: Ref<CollectionType[]> = ref([])
  const commissionSummary: Ref<CommissionSummaryRow[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)

  const handleError = (err: unknown, msg: string) => { error.value = err instanceof Error ? err.message : msg }
  const clearError = () => { error.value = '' }

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value
    const channel = supabase
      .channel('ethical-channel')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: 'transaction_type=eq.ethical_order' },
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

  const fetchOrders = async (options: FetchOrdersOptions = {}) => {
    loading.value = true
    clearError()
    try {
      const { status, agentId, customerId, orderBy = 'created_at', ascending = false } = options
      let q = supabase.from('transactions').select(SELECT_ORDER).eq('transaction_type', 'ethical_order')
      if (status) q = q.eq('status', status)
      if (agentId) q = q.eq('agent_id', agentId)
      if (customerId) q = q.eq('customer_id', customerId)
      q = q.order(orderBy, { ascending })
      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      orders.value = (data || []).map(mapRow)
      return orders.value
    } catch (err) {
      handleError(err, 'Failed to fetch ethical orders')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchOrderById = async (id: number): Promise<EthicalOrderType | null> => {
    const { data, error: e } = await supabase
      .from('transactions')
      .select(SELECT_ORDER)
      .eq('id', id)
      .single()
    if (e || !data) { handleError(e, 'Failed to load order'); return null }
    return mapRow(data)
  }

  // Header + branch-then-warehouse sourcing per line + ethical_details (was
  // ethical_create_order). Best-effort, not atomic: a failure partway through
  // can leave partial stock decrements against an order that never got created
  // or with only some lines sourced (accepted trade-off, JS-over-RPC convention).
  const createOrder = async (payload: {
    customerId: number
    agentId?: number | null
    outletId: number
    discount?: number
    rebate?: number
    termsDays?: number
    remarks?: string
    lines: EthicalLineInput[]
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }
    if (!payload.outletId) { toast.warning('Select a branch first.'); loading.value = false; return { success: false } }
    if (!payload.lines.length) { toast.warning('Add at least one line item.'); loading.value = false; return { success: false } }

    const { data: outlet, error: outletError } = await supabase
      .from('outlets')
      .select('channel, code')
      .eq('id', payload.outletId)
      .eq('is_active', true)
      .maybeSingle()
    if (outletError || !outlet) {
      toast.error('Outlet not found or inactive.'); loading.value = false; return { success: false }
    }
    if (outlet.channel !== 'ethical') {
      toast.error('Outlet is not an ethical outlet.'); loading.value = false; return { success: false }
    }

    const subtotal = payload.lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)
    const discount = payload.discount ?? 0
    const rebate = payload.rebate ?? 0
    const total = subtotal - discount - rebate
    if (total < 0) {
      toast.error('Total amount cannot be negative after discounts/rebates.'); loading.value = false; return { success: false }
    }

    const year = new Date().getFullYear().toString()
    const { data: existingOrders } = await supabase
      .from('transactions')
      .select('reference_no')
      .like('reference_no', `EO-${year}-%`)
    const orderNo = nextDocNumber((existingOrders ?? []).map(r => r.reference_no), `EO-${year}-`)

    const termsDays = payload.termsDays ?? 0
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + termsDays)

    const { data: created, error: insertError } = await supabase
      .from('transactions')
      .insert({
        reference_no: orderNo, transaction_type: 'ethical_order', status: 'invoiced',
        outlet_id: payload.outletId, customer_id: payload.customerId, agent_id: payload.agentId ?? null,
        total_amount: total, remarks: payload.remarks || null, created_by: user.id,
      })
      .select('id')
      .single()

    if (insertError || !created) {
      handleError(insertError, 'Failed to create order.')
      toast.error(insertError?.message || 'Failed to create order.')
      loading.value = false
      return { success: false }
    }

    let anyShort = false
    for (const line of payload.lines) {
      let need = line.quantity
      let sourced = 0
      const sources: Record<string, number> = {}

      const { data: branchStock } = await supabase
        .from('outlet_stock').select('quantity')
        .eq('outlet_id', payload.outletId).eq('product_id', line.product_id).maybeSingle()
      const branchOnHand = branchStock?.quantity ?? 0
      const branchTake = Math.min(need, branchOnHand)
      if (branchTake > 0) {
        await supabase.from('outlet_stock')
          .update({ quantity: branchOnHand - branchTake, updated_at: new Date().toISOString() })
          .eq('outlet_id', payload.outletId).eq('product_id', line.product_id)
        sources.branch = branchTake
        sourced += branchTake
        need -= branchTake
      }

      if (need > 0) {
        const { data: product } = await supabase.from('products').select('current_stock').eq('id', line.product_id).maybeSingle()
        const warehouseOnHand = product?.current_stock ?? 0
        const warehouseTake = Math.min(need, warehouseOnHand)
        if (warehouseTake > 0) {
          await supabase.from('products').update({ current_stock: warehouseOnHand - warehouseTake }).eq('id', line.product_id)
          sources.warehouse = warehouseTake
          sourced += warehouseTake
          need -= warehouseTake
        }
      }

      if (need > 0) anyShort = true

      const { data: item, error: itemError } = await supabase
        .from('transaction_items')
        .insert({ transaction_id: created.id, product_id: line.product_id })
        .select('id')
        .single()
      if (itemError || !item) {
        handleError(itemError, 'Failed to save order line item.')
        toast.error(itemError?.message || 'Failed to save order line item.')
        loading.value = false
        return { success: false }
      }
      const { error: itemDetailsError } = await supabase.from('transaction_item_details').insert({
        transaction_item_id: item.id, qty: line.quantity,
        unit_price: line.unit_price, line_total: line.quantity * line.unit_price,
        delivered_qty: sourced, stock_sources: sources,
      })
      if (itemDetailsError) {
        handleError(itemDetailsError, 'Failed to save order line item.')
        toast.error(itemDetailsError.message || 'Failed to save order line item.')
        loading.value = false
        return { success: false }
      }
    }

    const { error: detailsError } = await supabase.from('ethical_details').insert({
      transaction_id: created.id, terms_days: termsDays, due_date: dueDate.toISOString().slice(0, 10),
      discount_amount: discount, rebate_amount: rebate,
      fulfillment_status: anyShort ? 'awaiting_stock' : 'fulfilled', amount_paid: 0, paid_at: null,
    })
    if (detailsError) {
      handleError(detailsError, 'Failed to save order details.')
      toast.error(detailsError.message || 'Failed to save order details.')
      loading.value = false
      return { success: false }
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'created', description: `Ethical order ${orderNo} invoiced`,
      module: 'ethical', transaction_id: created.id,
    })
    if (logError) console.warn('createOrder: activity log insert failed:', logError.message)

    toast.success(`Ethical order created.`)
    await fetchOrders()
    loading.value = false
    return { success: true, orderId: created.id }
  }

  // Insert a payment against the balance, update the cumulative amount_paid
  // cache, flip status (was ethical_record_collection).
  const recordCollection = async (payload: {
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
    if (payload.amount <= 0) { toast.error('Collection amount must be positive.'); loading.value = false; return { success: false } }

    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, total_amount, agent_id, ethical_details(amount_paid)')
      .eq('id', payload.orderId)
      .eq('transaction_type', 'ethical_order')
      .maybeSingle()
    if (fetchError || !order) {
      handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.')
      loading.value = false; return { success: false }
    }
    if (order.status !== 'invoiced' && order.status !== 'partial') {
      toast.error('Order is not open for collection.'); loading.value = false; return { success: false }
    }

    const paid = (order.ethical_details as unknown as { amount_paid: number | null } | null)?.amount_paid ?? 0
    const total = order.total_amount ?? 0
    const balance = total - paid
    if (payload.amount > balance) {
      toast.error(`Collection amount (${payload.amount}) exceeds outstanding balance (${balance}).`)
      loading.value = false; return { success: false }
    }

    let commissionRate = 0
    if (order.agent_id) {
      const { data: agent } = await supabase.from('agents').select('commission_rate').eq('id', order.agent_id).maybeSingle()
      commissionRate = agent?.commission_rate ?? 0
    }
    const commissionAmount = payload.amount * (commissionRate / 100)
    const newStatus = paid + payload.amount >= total ? 'paid' : 'partial'

    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .insert({
        transaction_id: payload.orderId, amount: payload.amount,
        payment_method: payload.method || null, reference_no: payload.reference || null,
        collected_by: user.id, agent_id: order.agent_id,
        commission_rate: commissionRate, commission_amount: commissionAmount,
      })
      .select('id')
      .single()
    if (collectionError || !collection) {
      handleError(collectionError, 'Failed to record collection.')
      toast.error(collectionError?.message || 'Failed to record collection.')
      loading.value = false
      return { success: false }
    }

    const nowIso = new Date().toISOString()
    const { error: detailsError } = await supabase
      .from('ethical_details')
      .update({ amount_paid: paid + payload.amount, paid_at: nowIso })
      .eq('transaction_id', payload.orderId)
    if (detailsError) console.warn('recordCollection: ethical_details update failed:', detailsError.message)

    const { error: statusError } = await supabase
      .from('transactions')
      .update({ status: newStatus, updated_at: nowIso })
      .eq('id', payload.orderId)
    if (statusError) console.warn('recordCollection: status flip failed:', statusError.message)

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'collection', description: `Collection of ${payload.amount} recorded`,
      module: 'ethical', transaction_id: payload.orderId,
    })
    if (logError) console.warn('recordCollection: activity log insert failed:', logError.message)

    toast.success('Collection recorded.')
    await fetchOrders()
    await fetchCollections(payload.orderId)
    loading.value = false
    return { success: true, collectionId: collection.id }
  }

  // Issue a Delivery Receipt for the fulfilled quantities. Document-only (stock
  // already moved at invoice) — was ethical_issue_dr; re-issuable (a reprint is
  // a fresh DR number). Returns the DR so the caller can print it immediately.
  const issueDeliveryReceipt = async (payload: {
    orderId: number
    receivedBy?: string
    remarks?: string
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, customer_id')
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

    const { data: fulfilledItemRows, error: itemsError } = await supabase
      .from('transaction_items')
      .select('product_id, transaction_item_details!inner(delivered_qty, unit_price)')
      .eq('transaction_id', payload.orderId)
      .gt('transaction_item_details.delivered_qty', 0)
    if (itemsError) {
      handleError(itemsError, 'Failed to issue delivery receipt.')
      toast.error(itemsError.message || 'Failed to issue delivery receipt.')
      loading.value = false; return { success: false }
    }
    if (!fulfilledItemRows || fulfilledItemRows.length === 0) {
      toast.error('Nothing has been fulfilled on this order yet to receipt.')
      loading.value = false; return { success: false }
    }
    const fulfilledItems = fulfilledItemRows.map(row => ({
      product_id: row.product_id,
      delivered_qty: (row.transaction_item_details as unknown as { delivered_qty: number }).delivered_qty,
      unit_price: (row.transaction_item_details as unknown as { unit_price: number | null }).unit_price,
    }))

    const year = new Date().getFullYear().toString()
    const { data: existingDRs } = await supabase
      .from('transactions')
      .select('reference_no')
      .like('reference_no', `DR-${year}-%`)
    const drNo = nextDocNumber((existingDRs ?? []).map(r => r.reference_no), `DR-${year}-`)

    const { data: dr, error: drError } = await supabase
      .from('transactions')
      .insert({
        reference_no: drNo, transaction_type: 'delivery_receipt', parent_transaction_id: payload.orderId,
        customer_id: order.customer_id, remarks: payload.receivedBy || null, created_by: user.id,
      })
      .select('id')
      .single()
    if (drError || !dr) {
      handleError(drError, 'Failed to issue delivery receipt.')
      toast.error(drError?.message || 'Failed to issue delivery receipt.')
      loading.value = false; return { success: false }
    }

    const { data: drItems, error: linesError } = await supabase
      .from('transaction_items')
      .insert(fulfilledItems.map(item => ({ transaction_id: dr.id, product_id: item.product_id })))
      .select('id')
    if (linesError || !drItems) {
      console.warn('issueDeliveryReceipt: DR lines insert failed:', linesError?.message)
    } else {
      const { error: lineDetailsError } = await supabase.from('transaction_item_details').insert(
        drItems.map((row, i) => ({
          transaction_item_id: row.id, qty: fulfilledItems[i].delivered_qty,
          unit_price: fulfilledItems[i].unit_price, line_total: (fulfilledItems[i].unit_price ?? 0) * fulfilledItems[i].delivered_qty,
        })),
      )
      if (lineDetailsError) console.warn('issueDeliveryReceipt: DR line details insert failed:', lineDetailsError.message)
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'deliver', description: `Delivery receipt ${drNo} issued`,
      module: 'ethical', transaction_id: payload.orderId,
    })
    if (logError) console.warn('issueDeliveryReceipt: activity log insert failed:', logError.message)

    toast.success(`${drNo} issued.`)
    loading.value = false
    return { success: true, drId: dr.id, drNo }
  }

  // Restore branch + warehouse stock from stock_sources, only for invoiced,
  // fully-fulfilled, uncollected orders (was ethical_cancel_order).
  const cancelOrder = async (orderId: number, reason: string) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, outlet_id, ethical_details(fulfillment_status)')
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
    const { count: collectionCount } = await supabase
      .from('collections').select('id', { count: 'exact', head: true }).eq('transaction_id', orderId)
    if ((collectionCount ?? 0) > 0) {
      toast.error('Cannot cancel: order has collections.'); loading.value = false; return { success: false }
    }

    const { data: outlet } = await supabase.from('outlets').select('code').eq('id', order.outlet_id).maybeSingle()

    const { data: itemRows } = await supabase
      .from('transaction_items').select('product_id, transaction_item_details(stock_sources)').eq('transaction_id', orderId)
    const items = (itemRows ?? []).map(row => ({
      product_id: row.product_id,
      stock_sources: (row.transaction_item_details as unknown as { stock_sources: Record<string, number> | null } | null)?.stock_sources,
    }))

    for (const item of items) {
      const sources = (item.stock_sources ?? {}) as { branch?: number; warehouse?: number }
      if (sources.branch != null) {
        const { data: existingStock } = await supabase
          .from('outlet_stock').select('quantity')
          .eq('outlet_id', order.outlet_id).eq('product_id', item.product_id).maybeSingle()
        if (existingStock) {
          await supabase.from('outlet_stock')
            .update({ quantity: existingStock.quantity + sources.branch, updated_at: new Date().toISOString() })
            .eq('outlet_id', order.outlet_id).eq('product_id', item.product_id)
        } else {
          await supabase.from('outlet_stock')
            .insert({ outlet: outlet?.code ?? null, outlet_id: order.outlet_id, product_id: item.product_id, quantity: sources.branch })
        }
      }
      if (sources.warehouse != null) {
        const { data: product } = await supabase.from('products').select('current_stock').eq('id', item.product_id).maybeSingle()
        await supabase.from('products')
          .update({ current_stock: (product?.current_stock ?? 0) + sources.warehouse })
          .eq('id', item.product_id)
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
      created_by: user.id, action: 'cancelled', description: `Ethical order cancelled: ${reason || '(no reason)'}`,
      module: 'ethical', transaction_id: orderId,
    })
    if (logError) console.warn('cancelOrder: activity log insert failed:', logError.message)

    toast.success('Order cancelled and stock restored.')
    await fetchOrders()
    loading.value = false
    return { success: true }
  }

  // Re-attempt the branch-then-warehouse cascade for short lines (was
  // ethical_recheck_stock).
  const recheckStock = async (orderId: number): Promise<Shortfall[]> => {
    const { data: order, error: fetchError } = await supabase
      .from('transactions').select('outlet_id').eq('id', orderId).eq('transaction_type', 'ethical_order').maybeSingle()
    if (fetchError || !order?.outlet_id) { handleError(fetchError, 'Failed to recheck stock'); return [] }

    // Supabase can't compare two columns server-side, so filter client-side.
    const { data: allLineRows } = await supabase
      .from('transaction_items')
      .select('id, product_id, transaction_item_details(qty, delivered_qty, stock_sources)')
      .eq('transaction_id', orderId)
    const allLines = (allLineRows ?? []).map(row => {
      const d = (row.transaction_item_details ?? {}) as unknown as { qty?: number; delivered_qty?: number; stock_sources?: Record<string, number> }
      return { id: row.id, product_id: row.product_id, qty: d.qty ?? 0, delivered_qty: d.delivered_qty ?? 0, stock_sources: d.stock_sources }
    })
    const shortLines = allLines.filter(l => l.delivered_qty < l.qty)

    const shortfall: Shortfall[] = []
    for (const line of shortLines) {
      let need = line.qty - (line.delivered_qty ?? 0)
      let sourced = 0
      const sources = { ...(line.stock_sources ?? {}) } as { branch?: number; warehouse?: number }

      const { data: branchStock } = await supabase
        .from('outlet_stock').select('quantity')
        .eq('outlet_id', order.outlet_id).eq('product_id', line.product_id).maybeSingle()
      const branchOnHand = branchStock?.quantity ?? 0
      const branchTake = Math.min(need, branchOnHand)
      if (branchTake > 0) {
        await supabase.from('outlet_stock')
          .update({ quantity: branchOnHand - branchTake, updated_at: new Date().toISOString() })
          .eq('outlet_id', order.outlet_id).eq('product_id', line.product_id)
        sources.branch = (sources.branch ?? 0) + branchTake
        sourced += branchTake
        need -= branchTake
      }

      if (need > 0) {
        const { data: product } = await supabase.from('products').select('current_stock').eq('id', line.product_id).maybeSingle()
        const warehouseOnHand = product?.current_stock ?? 0
        const warehouseTake = Math.min(need, warehouseOnHand)
        if (warehouseTake > 0) {
          await supabase.from('products').update({ current_stock: warehouseOnHand - warehouseTake }).eq('id', line.product_id)
          sources.warehouse = (sources.warehouse ?? 0) + warehouseTake
          sourced += warehouseTake
          need -= warehouseTake
        }
      }

      await supabase.from('transaction_item_details')
        .update({ delivered_qty: (line.delivered_qty ?? 0) + sourced, stock_sources: sources })
        .eq('transaction_item_id', line.id)

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
  const canvassToPRs = async (orderId: number, selections: CanvassSelection[]) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }
    if (!selections.length) { toast.warning('Add at least one supplier selection.'); loading.value = false; return { success: false } }

    const result = await canvassStore.commitToPRs('ethical_order', orderId, selections, user.id)
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

  const fetchCollections = async (orderId?: number): Promise<CollectionType[]> => {
    try {
      let q = supabase.from('collections').select('*').order('created_at', { ascending: true })
      if (orderId !== undefined) q = q.eq('transaction_id', orderId)
      const { data, error: e } = await q
      if (e) throw e
      collections.value = (data || []) as CollectionType[]
      return collections.value
    } catch (err) {
      handleError(err, 'Failed to fetch collections')
      return []
    }
  }

  // Single-table update — done in JS per the "no RPC under ~10 round-trips"
  // convention (was ethical_mark_commission_paid, one `update collections`).
  const markCommissionPaid = async (collectionId: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { error: updateError } = await supabase
      .from('collections')
      .update({ commission_status: 'paid', commission_paid_at: new Date().toISOString() })
      .eq('id', collectionId)

    if (updateError) {
      handleError(updateError, 'Failed to mark commission as paid.')
      toast.error(updateError.message || 'Failed to mark commission as paid.')
      loading.value = false
      return { success: false }
    }

    toast.success('Commission marked as paid.')
    await fetchCommissionSummary()
    loading.value = false
    return { success: true }
  }

  const fetchCommissionSummary = async (): Promise<CommissionSummaryRow[]> => {
    try {
      const { data, error: e } = await supabase
        .from('collections')
        .select('agent_id, agent:agent_id(name), commission_amount, commission_status')
      if (e) throw e

      // Group by agent_id and sum commissions
      const grouped = new Map<number | null, { agent_name: string | null; total: number; unpaid: number; paid: number }>()
      for (const row of (data || []) as any[]) {
        const agentId = row.agent_id as number | null
        const agent = row.agent as any
        const agentName = agent?.name ?? null
        const amount = (row.commission_amount ?? 0) as number
        const isPaid = row.commission_status === 'paid'

        if (!grouped.has(agentId)) {
          grouped.set(agentId, { agent_name: agentName, total: 0, unpaid: 0, paid: 0 })
        }
        const summary = grouped.get(agentId)!
        summary.total += amount
        if (isPaid) summary.paid += amount
        else summary.unpaid += amount
      }

      const result: CommissionSummaryRow[] = Array.from(grouped.entries()).map(([agentId, summary]) => ({
        agent_id: agentId,
        agent_name: summary.agent_name,
        total_commission: summary.total,
        unpaid_commission: summary.unpaid,
        paid_commission: summary.paid,
      }))

      commissionSummary.value = result
      return result
    } catch (err) {
      handleError(err, 'Failed to fetch commission summary')
      return []
    }
  }

  const resetStore = () => {
    orders.value = []
    currentOrder.value = undefined
    collections.value = []
    commissionSummary.value = []
    loading.value = false
    error.value = ''
  }

  return {
    orders, currentOrder, collections, commissionSummary, loading, error,
    fetchOrders, fetchOrderById, createOrder, recordCollection, cancelOrder,
    recheckStock, canvassToPRs, issueDeliveryReceipt,
    fetchCollections, markCommissionPaid, fetchCommissionSummary,
    startRealtime, stopRealtime, clearError, resetStore,
  }
})
