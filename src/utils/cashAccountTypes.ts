// Shared types/constants for the classified Cash Accounts UI
// (CashAccountsManager.vue + AddExpenseDialog.vue). These components are
// presentational — they take props and emit payloads up; persistence is
// wired by the parent (financeData store) later.

import type { CashClassification, ExpenseCategory, ExpenseDepartment } from '@/stores/financeData'

export type { CashClassification }

export type ClassifiedCashAccount = {
  id: number
  name: string
  classification: CashClassification
  opening_balance: number
  balance: number
  is_active: boolean
}

export type CashClassificationMeta = {
  value: CashClassification
  title: string
  description: string
  color: string
  icon: string
}

export const CASH_CLASSIFICATIONS: CashClassificationMeta[] = [
  { value: 'CASA', title: 'CASA', description: 'Current Account / Savings Account', color: 'blue', icon: 'mdi-bank' },
  { value: 'TIME_INVESTMENT', title: 'Time Investment', description: 'Time deposit / money market', color: 'purple', icon: 'mdi-chart-timeline-variant' },
  { value: 'PETTY_CASH', title: 'Petty Cash', description: 'Physical cash on hand', color: 'orange', icon: 'mdi-cash-multiple' },
]

export const classificationMeta = (value: CashClassification): CashClassificationMeta =>
  CASH_CLASSIFICATIONS.find((c) => c.value === value) ?? CASH_CLASSIFICATIONS[0]

export const DEFAULT_REPLENISH_THRESHOLD = 1000

export type CreateCashAccountPayload = {
  name: string
  classification: CashClassification
  opening_balance: number
  is_active: boolean
}

export type AddExpensePayload = {
  category: ExpenseCategory
  description: string
  amount: number
  expense_date: string
  cash_account_id: number
  department: ExpenseDepartment
  or_si_no: string
  paid_to: string
  request_replenishment: boolean
}
