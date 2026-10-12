// Barrel file for the financeData store.
//
// The store is split into 'stores/finance/*' — this file re-exports every type,
// constant and helper (so existing `@/stores/financeData` imports keep working)
// and composes the feature files' actions into one Pinia defineStore. Shared
// state lives in `./finance/state`, and every feature file reads and writes
// those same refs.
//
// Finance reads the transactions hub directly (own transaction_type filters) and
// never calls into salesData/ethicalData/inhouseData/suppliersData fetchers —
// those mutate shared module-scoped refs; Finance must not leak into that state.
// Only two new transaction_type rows are introduced here: 'expense' and
// 'supplier_payment'. Every other figure is derived from data that already
// exists in the hub (sale, ethical_order/collections, inhouse_order, stock_in,
// remittance) via plain select + JS reduce, mirroring ethicalData.fetchCommissionSummary.

import { defineStore } from 'pinia'
import {
  expenses,
  cashAccounts,
  replenishmentRequests,
  supplierPayments,
  supplierAP,
  apAging,
  pnl,
  incomeStatement,
  balanceSheet,
  trialBalance,
  remittanceDiscrepancies,
  arAging,
  commissionLiability,
  stockReconciliation,
  loading,
  error,
  isLoading,
  hasError,
  clearError,
  resetStore,
} from './finance/state'
import { fetchExpenses, recordExpense, voidExpense } from './finance/expenses'
import {
  fetchCashAccounts,
  createCashAccount,
  deactivateCashAccount,
  removeCashAccount,
} from './finance/cashAccounts'
import {
  fetchReplenishmentRequests,
  previewPettyCashLiquidation,
  requestReplenishment,
  approveReplenishment,
  rejectReplenishment,
} from './finance/pettyCash'
import {
  fetchSupplierPayments,
  reissueSupplierPayment,
  fetchSupplierAP,
  fetchAPAging,
} from './finance/payables'
import { fetchARAging, fetchReceivableDetail, fetchStatementOfAccount } from './finance/receivables'
import {
  fetchRemittanceDiscrepancies,
  fetchCommissionLiability,
  fetchStockReconciliation,
} from './finance/discrepancies'
import {
  fetchPnL,
  fetchIncomeStatement,
  fetchBalanceSheet,
  fetchTrialBalance,
} from './finance/statements'

// Re-export the types so existing imports keep resolving from the barrel.
export type {
  ExpenseCategory,
  ExpenseDepartment,
  ExpensePaymentMethod,
  CashClassification,
  CashAccountType,
  LiquidationReportItem,
  PettyCashReplenishmentType,
  ExpenseType,
  SupplierPaymentType,
  APAgeBucket,
  APAgingRow,
  SupplierAPRow,
  PnLByOutletRow,
  PnLSummary,
  RemittanceDiscrepancyRow,
  ARAgingTerm,
  ARAgingRow,
  ARReceivableLine,
  ARReceivablePayment,
  ARReceivableDetail,
  SOAEntry,
  StatementOfAccount,
  CommissionLiabilityRow,
  StockReconRow,
  GLAccountLine,
  GLISSection,
  GLIncomeStatement,
  GLBSSection,
  GLBalanceSheet,
  TrialBalanceLine,
} from './finance/types'

// Constants and pure helpers other modules import from here.
export {
  legacyExpenseCategories,
  disbursementAccountClasses,
  disbursementPreferredSubsections,
  expenseDepartments,
  expensePaymentMethods,
  apAgeBuckets,
} from './finance/types'
export { categoryTitle, apBucketFor, glCashCode, glAccountCodeFor } from './finance/helpers'

export const useFinanceDataStore = defineStore('financeData', () => {
  return {
    // State
    expenses,
    cashAccounts,
    replenishmentRequests,
    supplierPayments,
    supplierAP,
    apAging,
    pnl,
    incomeStatement,
    balanceSheet,
    trialBalance,
    remittanceDiscrepancies,
    arAging,
    commissionLiability,
    stockReconciliation,
    loading,
    error,

    // Computed
    isLoading,
    hasError,

    // Expenses
    fetchExpenses,
    recordExpense,
    voidExpense,

    // Cash accounts
    fetchCashAccounts,
    createCashAccount,
    deactivateCashAccount,
    removeCashAccount,

    // Petty cash replenishment
    fetchReplenishmentRequests,
    previewPettyCashLiquidation,
    requestReplenishment,
    approveReplenishment,
    rejectReplenishment,

    // Supplier payments / AP
    fetchSupplierPayments,
    reissueSupplierPayment,
    fetchSupplierAP,
    fetchAPAging,

    // P&L and statements
    fetchPnL,
    fetchIncomeStatement,
    fetchBalanceSheet,
    fetchTrialBalance,

    // Receivables
    fetchARAging,
    fetchReceivableDetail,
    fetchStatementOfAccount,

    // Discrepancies
    fetchRemittanceDiscrepancies,
    fetchCommissionLiability,
    fetchStockReconciliation,

    // Misc
    clearError,
    resetStore,
  }
})
