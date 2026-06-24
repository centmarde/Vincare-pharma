import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import type { ProductType } from '@/stores/productsData'
import type { CustomerType } from '@/stores/customersData'

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
  subtotal: number | null
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

export type Shortfall = { product_id: number; ordered: number; on_hand: number; needed: number }
export type NegotiationRound = { id: number; created_at: string; user_id: string | null; action: string | null; description: string | null }

const SELECT_ORDER =
  '*, transaction_items(id, product_id, qty, unit_price, line_total, cost_price, delivered_qty, product:product_id(*)), customer:customer_id(*)'

function mapRow(row: any): InhouseOrderType {
  return {
    id:           row.id,
    created_at:   row.created_at,
    order_no:     row.reference_no,
    govt_po_no:   row.po_no,
    customer_id:  row.customer_id,
    status:       row.status,
    subtotal:     row.subtotal,
    total_amount: row.total_amount,
    amount_paid:  row.amount_paid,
    paid_at:      row.paid_at,
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

  async function generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear()
    const prefix = `IH-${year}-`
    const { data } = await supabase
      .from('transactions').select('reference_no')
      .ilike('reference_no', `${prefix}%`).order('reference_no', { ascending: false }).limit(1)
    const latest = (data as { reference_no: string }[] | null)?.[0]?.reference_no
    const last = latest ? parseInt(latest.split('-')[2], 10) : 0
    return `${prefix}${String(last + 1).padStart(3, '0')}`
  }

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

    const subtotal = payload.lines.reduce((s, l) => s + l.qty * l.unit_price, 0)
    const orderNo = await generateOrderNumber()

    const { data: header, error: headerError } = await supabase
      .from('transactions').insert({
        reference_no:     orderNo,
        po_no:            payload.govtPoNo ?? null,
        transaction_type: 'inhouse_order',
        status:           'negotiating',
        customer_id:      payload.customerId,
        subtotal,
        total_amount:     subtotal,
        remarks:          payload.remarks ?? null,
        created_by:       user.id,
      }).select('id').single()

    if (headerError || !header) {
      handleError(headerError, 'Failed to create order.'); toast.error('Failed to create order.')
      loading.value = false; return { success: false }
    }

    const { error: itemsError } = await supabase.from('transaction_items').insert(
      payload.lines.map((l) => ({
        transaction_id: header.id,
        product_id:     l.product_id,
        qty:            l.qty,
        unit_price:     l.unit_price,
        line_total:     l.qty * l.unit_price,
        cost_price:     l.cost_price,
      })),
    )
    if (itemsError) {
      handleError(itemsError, 'Failed to save line items.'); toast.error('Failed to save line items.')
      loading.value = false; return { success: false }
    }

    toast.success(`Order ${orderNo} raised.`)
    await fetchOrders()
    loading.value = false
    return { success: true, orderId: header.id, orderNo }
  }

  // Apply per-line price edits (optional) then log a negotiation round.
  const recordOffer = async (payload: {
    orderId: number
    total: number
    party: 'government' | 'company'
    note?: string
    lineUpdates?: { item_id: number; unit_price: number; qty: number }[]
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    for (const u of payload.lineUpdates ?? []) {
      await supabase.from('transaction_items')
        .update({ unit_price: u.unit_price, line_total: u.unit_price * u.qty }).eq('id', u.item_id)
    }

    const { error: rpcError } = await supabase.rpc('inhouse_record_offer', {
      p_id: payload.orderId, p_total: payload.total, p_party: payload.party,
      p_note: payload.note ?? null, p_user: user.id,
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

  const deliver = async (orderId: number, lines: { item_id: number; qty: number }[]) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { error: rpcError } = await supabase.rpc('inhouse_deliver', { p_id: orderId, p_lines: lines, p_user: user.id })
    if (rpcError) {
      handleError(rpcError, 'Failed to record delivery.'); toast.error(rpcError.message || 'Failed to record delivery.')
      loading.value = false; return { success: false }
    }
    toast.success('Delivery recorded.')
    await fetchOrders()
    loading.value = false
    return { success: true }
  }

  const markPaid = async (orderId: number, amount: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { error: rpcError } = await supabase.rpc('inhouse_mark_paid', { p_id: orderId, p_amount: amount, p_user: user.id })
    if (rpcError) {
      handleError(rpcError, 'Failed to mark paid.'); toast.error(rpcError.message || 'Failed to mark paid.')
      loading.value = false; return { success: false }
    }
    toast.success('Payment recorded.')
    await fetchOrders()
    loading.value = false
    return { success: true }
  }

  const fetchNegotiation = async (orderId: number): Promise<NegotiationRound[]> => {
    const { data, error: e } = await supabase
      .from('logs').select('id, created_at, user_id, action, description')
      .eq('transaction_id', orderId).eq('module', 'inhouse_negotiation')
      .order('created_at', { ascending: true })
    if (e) { handleError(e, 'Failed to load negotiation history'); return [] }
    return (data || []) as NegotiationRound[]
  }

  const resetStore = () => { orders.value = []; loading.value = false; error.value = '' }

  return {
    orders, loading, error,
    fetchOrders, fetchOrderById, createOrder, recordOffer, agreeOrder,
    recheckStock, deliver, markPaid, fetchNegotiation, generateOrderNumber,
    startRealtime, stopRealtime, clearError, resetStore,
  }
})
