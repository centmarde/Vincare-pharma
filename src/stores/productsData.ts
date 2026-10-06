// Barrel file for the productsData store.
//
// Ang store na-split na ngadto sa 'stores/products/*' - kini nga file ang
// parent/barrel nga ga-re-export sa tanang types (aron ang existing
// `@/stores/productsData` imports magpadayon nga mo-works) ug mo-compose sa
// tanang actions ngadto sa usa ka Pinia defineStore. Ang shared state naa sa
// `./products/state`, ug ang mga feature modules ga-read/write sa same refs.

import { defineStore } from 'pinia'
import {
  products,
  currentProduct,
  eligibleProductIds,
  expiredProductIds,
  expiredProductIdsFetchedAt,
  loading,
  error,
  pickerProducts,
  pickerTotalCount,
  reorderRequests,
  reorderCount,
  totalCount,
  productsCount,
  hasProducts,
  isLoading,
  hasError,
  isRealtimeSubscribed,
  stockStatusCounts,
  stockStatusProducts,
  stockStatusProductsTotal,
  stockStatusLoading,
  clearError,
} from './products/state'
import {
  fetchEligibleProductIds,
  fetchProducts,
  fetchProductsByIds,
  fetchProductById,
  fetchSkusByProductNames,
  setProductsReorderFlag,
  createProduct,
  updateProduct,
  deleteProduct,
  upsertProductLocal,
  removeProductLocal,
  resetStore,
} from './products/crud'
import { fetchProductPicker } from './products/picker'
import {
  fetchExpiredProductIds,
  ensureExpiredProductIds,
  expiredAmong,
  fetchAllStockStatusCounts,
  fetchStockStatusProducts,
} from './products/stockStatus'
import {
  fetchReorderRequests,
  fetchReorderCount,
  createReorderRequest,
  fetchReorderRequestIdsForTransaction,
  filterPendingReorderRequestIds,
  approveReorderRequestsById,
  rejectReorderRequestsById,
  markReorderRequestsAwaitingStockById,
  completeReorderRequestsById,
} from './products/reorder'
import {
  updateProductSkuAndCount,
  syncPRSellingPrices,
  findSkuConflicts,
} from './products/receiving'
import { startRealtime, stopRealtime } from './products/realtime'

// Re-export the types so existing imports keep resolving from the barrel.
export type {
  ProductType,
  CreateProductData,
  UpdateProductData,
  ProductPickerResult,
  ReceiveStockUpdate,
  SkuConflict,
  StockStatusBucket,
  StockStatusCounts,
  StockStatusRef,
} from './products/types'

export const useProductsDataStore = defineStore('productsData', () => {
  return {
    // State
    products,
    currentProduct,
    eligibleProductIds,
    expiredProductIds,
    expiredProductIdsFetchedAt,
    loading,
    error,
    pickerProducts,
    pickerTotalCount,

    // Computed
    productsCount,
    hasProducts,
    isLoading,
    hasError,
    isRealtimeSubscribed,
    totalCount,

    // Actions
    fetchEligibleProductIds,
    fetchExpiredProductIds,
    ensureExpiredProductIds,
    expiredAmong,
    fetchProducts,
    fetchProductsByIds,
    fetchProductById,
    fetchProductPicker,
    fetchSkusByProductNames,
    findSkuConflicts,
    setProductsReorderFlag,
    createProduct,
    updateProduct,
    syncPRSellingPrices,
    deleteProduct,
    updateProductSkuAndCount,
    clearError,
    resetStore,

    // Reorder Requests
    fetchReorderRequests,
    fetchReorderCount,
    createReorderRequest,
    fetchReorderRequestIdsForTransaction,
    filterPendingReorderRequestIds,
    approveReorderRequestsById,
    rejectReorderRequestsById,
    markReorderRequestsAwaitingStockById,
    completeReorderRequestsById,
    reorderRequests,
    reorderCount,

    // Realtime
    startRealtime,
    stopRealtime,

    // Local helpers (optional)
    upsertProductLocal,
    removeProductLocal,

    // Product expiry status
    stockStatusCounts,
    stockStatusProducts,
    stockStatusProductsTotal,
    stockStatusLoading,
    fetchAllStockStatusCounts,
    fetchStockStatusProducts,
  }
})