// Realtime: channel setup and teardown for purchase_requisition transactions.
// On each event the PR list is refetched from the DB.

import { supabase } from '@/lib/supabase'
import { subscriptionChannel } from './state'
import { fetchPurchaseRequisition } from './prActions'

export function subscribeToPurchaseRequisitions() {
  subscriptionChannel.value = supabase
    .channel('transactions_pr_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'transactions',
        filter: 'transaction_type=eq.purchase_requisition',
      },
      async () => {
        await fetchPurchaseRequisition()
      },
    )
    .subscribe()
}

export function unsubscribeFromPurchaseRequisitions() {
  if (subscriptionChannel.value) {
    supabase.removeChannel(subscriptionChannel.value)
    subscriptionChannel.value = null
  }
}