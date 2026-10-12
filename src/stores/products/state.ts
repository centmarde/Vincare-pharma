// Shared mutable state for the productsData store.
//
// Gisplit na ang store ngadto sa 'stores/products/*' para ma-maintain. Kini nga
// file nagkupot sa TANANG refs ug computed nga gishare sa feature files (crud,
// picker, stockStatus, reorder, receiving, realtime), aron usa ra ka store
// instance ang mag-gamit sa usa ka state — parehas sa dati nga store nga usa ra
// ka Pinia setup store ang mag-hold sa iyang state.

import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type {
  ProductType,
  ProductPickerResult,
  StockStatusCounts,
  StockStatusRef,
} from './types'

// State
export const products: Ref<ProductType[]> = ref([])
export const currentProduct: Ref<ProductType | undefined> = ref(undefined)
export const eligibleProductIds: Ref<Set<number>> = ref(new Set())
/** Products whose batch has already expired, per the warehouse `expired` bucket. */
export const expiredProductIds: Ref<Set<number>> = ref(new Set())
/** Epoch ms of the last successful expired-set read; 0 = not usable. */
export const expiredProductIdsFetchedAt = ref(0)
export const loading = ref(false)
export const error: Ref<string> = ref('')
export const pickerProducts = ref<ProductPickerResult[]>([])
export const pickerTotalCount = ref(0)
export const reorderRequests: Ref<any[]> = ref([])
export const reorderCount: Ref<number> = ref(0)
export const totalCount = ref(0)

// Stock status (RPC counts/paging) shared state
export const stockStatusCounts: Ref<StockStatusCounts> = ref({
  'out-of-stock': 0,
  'low-stock': 0,
  'no-reorder-level': 0,
  'expiring-soon': 0,
  expired: 0,
})
export const stockStatusProducts: Ref<ProductType[]> = ref([])
export const stockStatusProductsTotal = ref(0)
export const stockStatusLoading = ref(false)

// cached so realtime changes can silently re-sync counts with the same params
export const lastStockStatusParams: Ref<{ ref: StockStatusRef; excludedIds: number[] }> = ref({
  ref: null,
  excludedIds: [],
})

// Realtime
export const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
export const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

// Computed
export const productsCount = computed(() => products.value.length)
export const hasProducts = computed(() => products.value.length > 0)
export const isLoading = computed(() => loading.value)
export const hasError = computed(() => error.value !== '')
export const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')

// Helpers
export const handleError = (err: unknown, defaultMessage: string) => {
  const errorMessage = err instanceof Error ? err.message : defaultMessage
  error.value = errorMessage
}

export const clearError = () => {
  error.value = ''
}