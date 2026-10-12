// Barrel file for the purchaseRequisitionData store.
//
// Gisplit na ang store ngadto sa 'stores/purchaseRequisition/*'. Kini nga file
// ang parent/barrel nga ga-re-export sa tanang types (aron ang existing
// `@/stores/purchaseRequisitionData` imports magpadayon nga mo-works) ug
// mo-compose sa tanang actions ngadto sa usa ka Pinia defineStore. Shared state
// naa sa `./purchaseRequisition/state`, ug ang feature modules ga-read/write sa
// same refs (mappers, prActions, poActions, realtime).

import { defineStore } from 'pinia'
import { getLatestReferenceNo } from '@/utils/helpers'
import {
  prs,
  selectedPR,
  filterStatus,
  items,
  currentPR,
  loading,
  error,
  isLoading,
  hasError,
} from './purchaseRequisition/state'
import {
  resolveUserNames,
  mapToPR,
  mapTransactionItems,
  mapRPCRowToPR,
  mapRPCItemsToPR,
} from './purchaseRequisition/mappers'
import {
  updatePR,
  savePurchaseRequisition,
  resetStore,
  fetchPurchaseRequisition,
  fetchPRByRequisitionId,
  fetchPurchaseBreakdown,
  approvePR,
  rejectPR,
} from './purchaseRequisition/prActions'
import { issuePurchaseOrder, markPOAsReceived } from './purchaseRequisition/poActions'
import {
  subscribeToPurchaseRequisitions,
  unsubscribeFromPurchaseRequisitions,
} from './purchaseRequisition/realtime'

// Re-export the types so existing imports keep resolving from the barrel.
export type {
  PRItem,
  RequisitionItemType,
  PR,
  PurchaseRequisitionType,
  CreatedPR,
  SavePRResult,
} from './purchaseRequisition/types'

export const usePurchaseRequisitionStore = defineStore('purchaseRequisitionData', () => {
  return {
    // Generate reference numbers
    getLatestReferenceNo,

    // State
    prs,
    selectedPR,
    filterStatus,
    items,
    currentPR,
    loading,
    error,

    // Computed
    isLoading,
    hasError,

    // Mappers
    resolveUserNames,
    mapToPR,
    mapTransactionItems,
    mapRPCRowToPR,
    mapRPCItemsToPR,

    // PR actions
    updatePR,
    savePurchaseRequisition,
    resetStore,
    fetchPurchaseRequisition,
    fetchPRByRequisitionId,
    fetchPurchaseBreakdown,
    approvePR,
    rejectPR,

    // PO actions
    issuePurchaseOrder,
    markPOAsReceived,

    // Realtime
    subscribeToPurchaseRequisitions,
    unsubscribeFromPurchaseRequisitions,
  }
})