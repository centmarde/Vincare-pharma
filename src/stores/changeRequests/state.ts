// Shared mutable state for the changeRequestsData store.
//
// Every ref lives here, at module scope, so the feature files read and write ONE
// copy — the same arrangement as stores/products/state.ts. The barrel
// (../changeRequestsData.ts) returns these refs from its defineStore.

import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { ChangeRequestType } from './types'

// State
export const requests: Ref<ChangeRequestType[]> = ref([])
export const loading = ref(false)
export const error: Ref<string> = ref('')

// Computed
export const pendingCount = computed(() => requests.value.filter((r) => r.status === 'pending').length)

// Helpers
export function handleError(err: unknown, defaultMessage: string) {
  error.value = err instanceof Error ? err.message : defaultMessage
}

export function clearError() {
  error.value = ''
}

export function resetStore() {
  requests.value = []
  loading.value = false
  error.value = ''
}
