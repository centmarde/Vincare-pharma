// Barrel file for the glData store.
//
// The store is split into 'stores/gl/*' — this file re-exports every type,
// constant and helper (so existing `@/stores/glData` imports keep working) and
// composes the feature files' actions into one Pinia defineStore. Shared state
// lives in `./gl/state`, and every feature file reads and writes those same refs.
//
// The General Ledger is its own domain, separate from financeData.ts (which
// owns the existing cash-basis reporting). gl_* RPCs are the only writers;
// this store is the only layer allowed to call them. See FINANCE_GL_PLAN.md.

import { defineStore } from 'pinia'
import {
  accounts,
  allAccounts,
  journal,
  trialBalance,
  incomeStatement,
  balanceSheet,
  cashBasisStatement,
  monthlyIncomeStatement,
  monthlyCashBasisStatement,
  loading,
  error,
  clearError,
  resetStore,
} from './gl/state'
import { fetchAccounts, fetchAllAccounts, createAccount } from './gl/accounts'
import {
  postJournalEntry,
  fetchJournal,
  fetchAccountLedger,
  postManualEntry,
  approveManualEntry,
  reverseJournalEntry,
  describeReversalImpact,
  reverseEntry,
  projectEvents,
} from './gl/journal'
import {
  fetchCashBasisStatement,
  fetchMonthlyIncomeStatement,
  fetchMonthlyCashBasisStatement,
  fetchTrialBalance,
  fetchIncomeStatement,
  fetchBalanceSheet,
} from './gl/statements'
import { postOpeningBalances } from './gl/openingBalances'

// Re-export the types so existing imports keep resolving from the barrel.
export type {
  GLAccount,
  AccountCategoryKey,
  AccountCategory,
  JournalLineInput,
  JournalEntryLine,
  AccountLedgerLine,
  ReferenceType,
  JournalEntry,
  TrialBalanceRow,
  OpeningBalanceInput,
  StatementAccountRow,
  IncomeStatementSection,
  IncomeStatement,
  CashBasisRow,
  CashBasisStatement,
  MonthlyIncomeStatement,
  MonthlyCashBasisStatement,
  BalanceSheetSection,
  BalanceSheet,
} from './gl/types'

// Constants and pure helpers other modules import from here.
export { ACCOUNT_CATEGORIES, openingBalanceEquityCode, maxStatementColumns } from './gl/types'
export { nextAccountCode, monthsBetween, monthBounds } from './gl/helpers'

export const useGLDataStore = defineStore('glData', () => {
  return {
    // State
    accounts,
    allAccounts,
    journal,
    trialBalance,
    incomeStatement,
    balanceSheet,
    loading,
    error,

    // Statements
    cashBasisStatement,
    fetchCashBasisStatement,
    monthlyIncomeStatement,
    fetchMonthlyIncomeStatement,
    monthlyCashBasisStatement,
    fetchMonthlyCashBasisStatement,
    fetchTrialBalance,
    fetchIncomeStatement,
    fetchBalanceSheet,

    // Chart of accounts
    fetchAccounts,
    fetchAllAccounts,
    createAccount,

    // Journal
    fetchJournal,
    fetchAccountLedger,
    postJournalEntry,
    postManualEntry,
    approveManualEntry,
    reverseEntry,
    reverseJournalEntry,
    describeReversalImpact,
    projectEvents,

    // Opening balances
    postOpeningBalances,

    // Misc
    clearError,
    resetStore,
  }
})
