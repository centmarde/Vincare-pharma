// Barrel file for the ethicalData store.
//
// The store is split into 'stores/ethical/*' — this file re-exports every type
// (so existing `@/stores/ethicalData` imports keep working) and composes the
// feature files' actions into one Pinia defineStore. Shared state lives in
// `./ethical/state`, and every feature file reads and writes those same refs.

import { defineStore } from 'pinia'
import {
  orders,
  currentOrder,
  collections,
  commissionSummary,
  rebateQueue,
  loading,
  error,
  clearError,
  resetStore,
} from './ethical/state'
import { fetchOrders, fetchOrderById } from './ethical/orders'
import { createOrder, saveDraft, confirmDraft, deleteDraft } from './ethical/drafts'
import {
  recordCollection,
  fetchCollections,
  markCommissionPaid,
  fetchCommissionSummary,
} from './ethical/collections'
import { fetchRebateQueue, approveRebate, rejectRebate, payRebate } from './ethical/rebates'
import {
  cancelOrder,
  recheckStock,
  canvassToPRs,
  issueDeliveryReceipt,
} from './ethical/fulfillment'
import { startRealtime, stopRealtime } from './ethical/realtime'

// Re-export the types so existing imports keep resolving from the barrel.
export type {
  Shortfall,
  CanvassSelection,
  CanvassPRResult,
  EthicalItemType,
  CollectionType,
  RebateStatus,
  RebatePaymentMethod,
  EthicalOrderType,
  EthicalLineInput,
} from './ethical/types'

export const useEthicalDataStore = defineStore('ethicalData', () => {
  return {
    // State
    orders,
    currentOrder,
    collections,
    commissionSummary,
    rebateQueue,
    loading,
    error,

    // Orders
    fetchOrders,
    fetchOrderById,

    // Draft -> invoice
    createOrder,
    saveDraft,
    confirmDraft,
    deleteDraft,

    // Collections and commissions
    recordCollection,
    fetchCollections,
    markCommissionPaid,
    fetchCommissionSummary,

    // Fulfillment
    cancelOrder,
    recheckStock,
    canvassToPRs,
    issueDeliveryReceipt,

    // Rebate payouts
    fetchRebateQueue,
    approveRebate,
    rejectRebate,
    payRebate,

    // Realtime
    startRealtime,
    stopRealtime,

    // Misc
    clearError,
    resetStore,
  }
})
