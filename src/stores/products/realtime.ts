// Realtime: channel setup and teardown for products table changes. On each
// event the local products list is synced (via crud's local helpers) and the
// stock-status counts are re-fetched with the last used params.

import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ProductType } from './types'
import { realtimeChannel, realtimeStatus, lastStockStatusParams } from './state'
import { fetchAllStockStatusCounts } from './stockStatus'
import { upsertProductLocal, removeProductLocal } from './crud'

export const startRealtime = () => {
  // Avoid double subscriptions
  if (realtimeChannel.value) return realtimeChannel.value

  realtimeStatus.value = 'subscribing'

  const channel = supabase
    .channel('custom-all-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
      // Keep the user's debug log (requested)
      console.log('Change received!', payload)

      const eventType = payload.eventType

      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        const row = payload.new as ProductType
        if (row?.id != null) upsertProductLocal(row)
      }

      if (eventType === 'DELETE') {
        const row = payload.old as Partial<ProductType> | null
        const id = row?.id
        if (typeof id === 'number') removeProductLocal(id)
      }

      fetchAllStockStatusCounts(
        lastStockStatusParams.value.ref,
        lastStockStatusParams.value.excludedIds,
      )
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') realtimeStatus.value = 'subscribed'
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        realtimeStatus.value = 'error'
      }
    })

  realtimeChannel.value = channel
  return channel
}

export const stopRealtime = async () => {
  const channel = realtimeChannel.value
  if (!channel) return

  realtimeChannel.value = null
  realtimeStatus.value = 'idle'

  // Ensure it's actually removed on the client
  await supabase.removeChannel(channel)
}