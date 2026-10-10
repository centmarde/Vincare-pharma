// Shared mutable state for the ethicalData store.
//
// Every ref lives here, at module scope, so all the feature files (orders,
// drafts, collections, rebates, fulfillment, realtime) read and write ONE copy —
// the same arrangement as stores/products/state.ts. The barrel
// (../ethicalData.ts) returns these refs from its defineStore.

import { ref } from 'vue'
import type { Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { CollectionType, CommissionSummaryRow, EthicalOrderType } from './types'

// State
export const orders: Ref<EthicalOrderType[]> = ref([])
export const currentOrder: Ref<EthicalOrderType | undefined> = ref(undefined)
export const collections: Ref<CollectionType[]> = ref([])
export const commissionSummary: Ref<CommissionSummaryRow[]> = ref([])
export const rebateQueue: Ref<EthicalOrderType[]> = ref([])
export const loading = ref(false)
export const error: Ref<string> = ref('')

// Realtime
export const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)

// Helpers
export function handleError(err: unknown, msg: string) {
  error.value = err instanceof Error ? err.message : msg
}

export function clearError() {
  error.value = ''
}

export function resetStore() {
  orders.value = []
  currentOrder.value = undefined
  collections.value = []
  commissionSummary.value = []
  loading.value = false
  error.value = ''
}
