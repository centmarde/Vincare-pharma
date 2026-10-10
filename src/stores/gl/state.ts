// Shared mutable state for the glData store.
//
// Every ref lives here, at module scope, so all the feature files (accounts,
// journal, statements, openingBalances) read and write ONE copy — the same
// arrangement as stores/products/state.ts. The barrel (../glData.ts) returns
// these refs from its defineStore.

import { ref } from 'vue'
import type { Ref } from 'vue'
import type {
  BalanceSheet,
  CashBasisStatement,
  GLAccount,
  IncomeStatement,
  JournalEntry,
  MonthlyCashBasisStatement,
  MonthlyIncomeStatement,
  TrialBalanceRow,
} from './types'

// State
export const accounts: Ref<GLAccount[]> = ref([])
/**
 * The chart INCLUDING deactivated accounts, for label resolution only.
 *
 * Kept separate from `accounts` on purpose: that list feeds every picker, and
 * folding inactive accounts into it would offer them for new entries. This
 * one answers "what was this code called", which a saved voucher or a
 * historical expense report still needs after an account is retired —
 * otherwise those documents fall back to printing the bare code.
 */
export const allAccounts: Ref<GLAccount[]> = ref([])
export const journal: Ref<JournalEntry[]> = ref([])
export const trialBalance: Ref<TrialBalanceRow[]> = ref([])
export const incomeStatement: Ref<IncomeStatement | null> = ref(null)
export const balanceSheet: Ref<BalanceSheet | null> = ref(null)
export const cashBasisStatement: Ref<CashBasisStatement | null> = ref(null)
export const monthlyIncomeStatement: Ref<MonthlyIncomeStatement | null> = ref(null)
export const monthlyCashBasisStatement: Ref<MonthlyCashBasisStatement | null> = ref(null)

export const loading = ref(false)
export const error: Ref<string> = ref('')

// Helpers
export function handleError(err: unknown, msg: string) {
  error.value = err instanceof Error ? err.message : msg
}

export function clearError() {
  error.value = ''
}

export function resetStore() {
  accounts.value = []
  journal.value = []
  trialBalance.value = []
  incomeStatement.value = null
  balanceSheet.value = null
  loading.value = false
  error.value = ''
}
