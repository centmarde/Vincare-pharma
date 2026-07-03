import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
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

const SELECT_ORDER =
  '*, transaction_items(id, product_id, qty, unit_price, line_total, cost_price, delivered_qty, product:product_id(*)), customer:customer_id(*), inhouse_details(*)'

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
    items: (row.transaction_items ?? []).map((li: any) => ({
      id:            li.id,
      product_id:    li.product_id,
      qty:           li.qty,
      unit_price:    li.unit_price,
      line_total:    li.line_total,
      cost_price:    li.cost_price,
      delivered_qty: li.delivered_qty ?? 0,
      product:       li.product,
    })),
  }
}

export const useInhouseDataStore = defineStore('inhouseData', () => {
  const authStore = useAuthUserStore()

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

    // Atomic: header + inhouse_details + items + reference_no all in one DB
    // transaction (no orphan headers, no client-side number race).
    const { data, error: rpcError } = await supabase.rpc('inhouse_create_order', {
      p_customer_id: payload.customerId,
      p_govt_po_no:  payload.govtPoNo ?? null,
      p_remarks:     payload.remarks ?? null,
      p_lines:       payload.lines.map((l) => ({
        product_id: l.product_id, qty: l.qty, unit_price: l.unit_price, cost_price: l.cost_price,
      })),
      p_user:        user.id,
    })

    if (rpcError || !data) {
      handleError(rpcError, 'Failed to create order.'); toast.error(rpcError?.message || 'Failed to create order.')
      loading.value = false; return { success: false }
    }

    const result = data as { order_id: number; order_no: string }
    toast.success(`Order ${result.order_no} raised.`)
    await fetchOrders()
    loading.value = false
    return { success: true, orderId: result.order_id, orderNo: result.order_no }
  }

  // Apply per-line price edits (optional) then log a negotiation round.
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

    // Line edits (incl. product swaps) + the logged round happen inside the one
    // RPC transaction — a failed offer never leaves the lines mutated.
    const { error: rpcError } = await supabase.rpc('inhouse_record_offer', {
      p_id: payload.orderId, p_total: payload.total, p_party: payload.party,
      p_note: payload.note ?? null,
      p_lines: (payload.lineUpdates ?? []).map((u) => ({
        item_id: u.item_id, unit_price: u.unit_price, qty: u.qty,
        product_id: u.product_id ?? null, cost_price: u.cost_price ?? null,
      })),
      p_user: user.id,
    })
    if (rpcError) {
      handleError(rpcError, 'Failed to record offer.'); toast.error(rpcError.message || 'Failed to record offer.')
      loading.value = false; return { success: false }
    }
    toast.success('Offer recorded.')
    await fetchOrders()
    loading.value = false
    return { success: true }
  }

  const agreeOrder = async (orderId: number): Promise<{ success: boolean; shortfall?: Shortfall[] }> => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data, error: rpcError } = await supabase.rpc('inhouse_agree', { p_id: orderId, p_user: user.id })
    if (rpcError) {
      handleError(rpcError, 'Failed to agree order.'); toast.error(rpcError.message || 'Failed to agree order.')
      loading.value = false; return { success: false }
    }
    const shortfall = (data ?? []) as Shortfall[]
    toast.success(shortfall.length ? 'Agreed — but stock is short.' : 'Agreed — stock is sufficient.')
    await fetchOrders()
    loading.value = false
    return { success: true, shortfall }
  }

  const recheckStock = async (orderId: number): Promise<Shortfall[]> => {
    const { data, error: e } = await supabase.rpc('inhouse_recheck_stock', { p_id: orderId })
    if (e) { handleError(e, 'Failed to recheck stock'); return [] }
    await fetchOrders()
    return (data ?? []) as Shortfall[]
  }

  // Recording a delivery also issues a numbered Delivery Receipt (DR-YYYY-###,
  // generated server-side); returns it so the caller can print immediately.
  const deliver = async (
    orderId: number,
    lines: { item_id: number; qty: number }[],
    opts: { receivedBy?: string; remarks?: string } = {},
  ) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data, error: rpcError } = await supabase.rpc('inhouse_deliver', {
      p_id: orderId, p_lines: lines,
      p_received_by: opts.receivedBy ?? null, p_remarks: opts.remarks ?? null,
      p_user: user.id,
    })
    if (rpcError) {
      handleError(rpcError, 'Failed to record delivery.'); toast.error(rpcError.message || 'Failed to record delivery.')
      loading.value = false; return { success: false }
    }
    const result = (data ?? {}) as { dr_id?: number; dr_no?: string }
    toast.success(result.dr_no ? `Delivery recorded — ${result.dr_no} issued.` : 'Delivery recorded.')
    await fetchOrders()
    loading.value = false
    return { success: true, drId: result.dr_id, drNo: result.dr_no }
  }

  // Government POs are commonly paid in tranches, not lump-sum — each call
  // records one payment against the balance (mirrors ethical_record_collection).
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

    const { data: paymentId, error: rpcError } = await supabase.rpc('inhouse_record_payment', {
      p_id:        payload.orderId,
      p_amount:    payload.amount,
      p_method:    payload.method ?? null,
      p_reference: payload.reference ?? null,
      p_remarks:   payload.remarks ?? null,
      p_user:      user.id,
    })
    if (rpcError || !paymentId) {
      handleError(rpcError, 'Failed to record payment.'); toast.error(rpcError?.message || 'Failed to record payment.')
      loading.value = false; return { success: false }
    }
    toast.success('Payment recorded.')
    await fetchOrders()
    loading.value = false
    return { success: true, paymentId }
  }

  const fetchPayments = async (orderId: number): Promise<CollectionType[]> => {
    const { data, error: e } = await supabase
      .from('collections').select('*')
      .eq('transaction_id', orderId).order('created_at', { ascending: true })
    if (e) { handleError(e, 'Failed to load payments'); return [] }
    return (data || []) as CollectionType[]
  }

  // Commit a supplier canvass: create one PR per winning supplier (atomic RPC).
  const canvassToPRs = async (orderId: number, selections: CanvassSelection[]) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }
    if (!selections.length) { toast.warning('Add at least one supplier selection.'); loading.value = false; return { success: false } }

    const { data, error: rpcError } = await supabase.rpc('canvass_to_prs', {
      p_order_type: 'inhouse_order',
      p_order_id:   orderId,
      p_selections: selections,
      p_user:       user.id,
    })
    if (rpcError) {
      handleError(rpcError, 'Failed to raise purchase requisitions.')
      toast.error(rpcError.message || 'Failed to raise purchase requisitions.')
      loading.value = false; return { success: false }
    }
    const prs = (data ?? []) as CanvassPRResult[]
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
