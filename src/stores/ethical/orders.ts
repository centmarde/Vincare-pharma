// Reading ethical orders: the list (with its filters) and a single order.

import { supabase } from '@/lib/supabase'
import type { EthicalOrderType, FetchOrdersOptions } from './types'
import { selectOrder, mapRow } from './mappers'
import { orders, loading, handleError, clearError } from './state'

export async function fetchOrders(options: FetchOrdersOptions = {}) {
  loading.value = true
  clearError()
  try {
    const { status, agentId, customerId, orderBy = 'created_at', ascending = false } = options
    let q = supabase.from('transactions').select(selectOrder).eq('transaction_type', 'ethical_order')
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

export async function fetchOrderById(id: number): Promise<EthicalOrderType | null> {
  const { data, error: e } = await supabase
    .from('transactions')
    .select(selectOrder)
    .eq('id', id)
    .single()
  if (e || !data) { handleError(e, 'Failed to load order'); return null }
  return mapRow(data)
}
