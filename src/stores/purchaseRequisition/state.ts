// Shared mutable state for the purchaseRequisitionData store.
//
// Parehas sa pattern sa products: kini nga file nagkupot sa TANANG refs ug
// computed nga gishare sa feature files (mappers, prActions, poActions,
// realtime) aron usa ra ka store instance ang mag-gamit sa usa ka state.

import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import type { PR, RequisitionItemType, PurchaseRequisitionType } from './types'
import { defaultPRForm } from './types'

// State
export const loading: Ref<boolean> = ref(false)
export const error: Ref<string> = ref('')
export const prs: Ref<PR[]> = ref([])
export const selectedPR: Ref<PR | null> = ref(null)
export const filterStatus: Ref<string | null> = ref(null)
export const items: Ref<RequisitionItemType[]> = ref([])
export const subscriptionChannel: Ref<any> = ref(null)

export const currentPR: Ref<PurchaseRequisitionType> = ref({ ...defaultPRForm })

// Computed
export const isLoading = computed(() => loading.value)
export const hasError = computed(() => error.value !== '')

// Helpers
export const handleError = (err: unknown, message: string) => {
  error.value = err instanceof Error ? err.message : message
}