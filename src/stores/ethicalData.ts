import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import type { ProductType } from '@/stores/productsData'
import type { CustomerType } from '@/stores/customersData'
import type { AgentType } from '@/stores/agentsData'
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
  outlet: string | null
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

const SELECT_ORDER =
  '*, transaction_items(id, product_id, qty, unit_price, line_total, delivered_qty, product:product_id(*)), customer:customer_id(*), agent:agent_id(*)'

function mapRow(row: any): EthicalOrderType {
  return {
    id:             row.id,
    created_at:     row.created_at,
    order_no:       row.reference_no,
    outlet:         row.outlet,
    customer_id:    row.customer_id,
    agent_id:       row.agent_id,
    status:         row.status,
    fulfillment_status: row.fulfillment_status,
    subtotal:       row.subtotal,
    total_amount:   row.total_amount,
    discount_amount: row.discount_amount,
    rebate_amount:  row.rebate_amount,
    terms_days:     row.terms_days,
    due_date:       row.due_date,
    amount_paid:    row.amount_paid ?? 0,
    paid_at:        row.paid_at,
    created_by:     row.created_by,
    remarks:        row.remarks,
    customer:       row.customer,
    agent:          row.agent,
    items: (row.transaction_items ?? []).map((li: any) => ({
      id:            li.id,
      product_id:    li.product_id,
      quantity:      li.qty,
      unit_price:    li.unit_price,
      line_total:    li.line_total,
      delivered_qty: li.delivered_qty ?? 0,
      product:       li.product,
    })),
  }
}

export const useEthicalDataStore = defineStore('ethicalData', () => {
  const authStore = useAuthUserStore()

  const orders: Ref<EthicalOrderType[]> = ref([])
  const currentOrder: Ref<EthicalOrderType | undefined> = ref(undefined)
  const collections: Ref<CollectionType[]> = ref([])
  const commissionSummary: Ref<CommissionSummaryRow[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)

  const handleError = (err: unknown, msg: string) => { error.value = err instanceof Error ? err.message : msg }
  const clearError = () => { error.value = '' }

  async function generateOrderNumber(): Promise<string> {
    const { data } = await supabase
      .rpc('generate_ethical_order_number')
    return (data as string) ?? 'EO-error'
  }

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

  const createOrder = async (payload: {
    customerId: number
    agentId?: number | null
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
    if (!payload.lines.length) { toast.warning('Add at least one line item.'); loading.value = false; return { success: false } }

    const { data: orderId, error: rpcError } = await supabase.rpc('ethical_create_order', {
      p_customer_id:  payload.customerId,
      p_agent_id:     payload.agentId ?? null,
      p_lines:        payload.lines.map(l => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })),
      p_discount:     payload.discount ?? 0,
      p_rebate:       payload.rebate ?? 0,
      p_terms_days:   payload.termsDays ?? 0,
      p_remarks:      payload.remarks ?? null,
      p_user:         user.id,
    })

    if (rpcError || !orderId) {
      handleError(rpcError, 'Failed to create order.')
      toast.error(rpcError?.message || 'Failed to create order.')
      loading.value = false
      return { success: false }
    }

    toast.success(`Ethical order created.`)
    await fetchOrders()
    loading.value = false
    return { success: true, orderId }
  }

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

    const { data: collectionId, error: rpcError } = await supabase.rpc('ethical_record_collection', {
      p_transaction_id: payload.orderId,
      p_amount:         payload.amount,
      p_method:         payload.method ?? null,
      p_reference:      payload.reference ?? null,
      p_remarks:        payload.remarks ?? null,
      p_user:           user.id,
    })

    if (rpcError || !collectionId) {
      handleError(rpcError, 'Failed to record collection.')
      toast.error(rpcError?.message || 'Failed to record collection.')
      loading.value = false
      return { success: false }
    }

    toast.success('Collection recorded.')
    await fetchOrders()
    await fetchCollections(payload.orderId)
    loading.value = false
    return { success: true, collectionId }
  }

  const cancelOrder = async (orderId: number, reason: string) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { error: rpcError } = await supabase.rpc('ethical_cancel_order', {
      p_id:     orderId,
      p_reason: reason,
      p_user:   user.id,
    })

    if (rpcError) {
      handleError(rpcError, 'Failed to cancel order.')
      toast.error(rpcError.message || 'Failed to cancel order.')
      loading.value = false
      return { success: false }
    }

    toast.success('Order cancelled and stock restored.')
    await fetchOrders()
    loading.value = false
    return { success: true }
  }

  const recheckStock = async (orderId: number): Promise<Shortfall[]> => {
    const { data, error: e } = await supabase.rpc('ethical_recheck_stock', { p_id: orderId })
    if (e) { handleError(e, 'Failed to recheck stock'); return [] }
    await fetchOrders()
    return (data ?? []) as Shortfall[]
  }

  // Commit a supplier canvass: create one PR per winning supplier (atomic RPC).
  const canvassToPRs = async (orderId: number, selections: CanvassSelection[]) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }
    if (!selections.length) { toast.warning('Add at least one supplier selection.'); loading.value = false; return { success: false } }

    const { data, error: rpcError } = await supabase.rpc('ethical_canvass_to_prs', {
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

  const fetchCollections = async (orderId: number): Promise<CollectionType[]> => {
    try {
      const { data, error: e } = await supabase
        .from('collections')
        .select('*')
        .eq('transaction_id', orderId)
        .order('created_at', { ascending: true })
      if (e) throw e
      collections.value = (data || []) as CollectionType[]
      return collections.value
    } catch (err) {
      handleError(err, 'Failed to fetch collections')
      return []
    }
  }

  const markCommissionPaid = async (collectionId: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { error: rpcError } = await supabase.rpc('ethical_mark_commission_paid', {
      p_collection_id: collectionId,
      p_user:          user.id,
    })

    if (rpcError) {
      handleError(rpcError, 'Failed to mark commission as paid.')
      toast.error(rpcError.message || 'Failed to mark commission as paid.')
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
    recheckStock, canvassToPRs,
    fetchCollections, markCommissionPaid, fetchCommissionSummary,
    generateOrderNumber, startRealtime, stopRealtime, clearError, resetStore,
  }
})
