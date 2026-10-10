// Realtime: refetch the order list whenever an ethical_order transaction changes.

import { supabase } from '@/lib/supabase'
import { realtimeChannel } from './state'
import { fetchOrders } from './orders'

export function startRealtime() {
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

export async function stopRealtime() {
  const channel = realtimeChannel.value
  if (!channel) return
  realtimeChannel.value = null
  await supabase.removeChannel(channel)
}
