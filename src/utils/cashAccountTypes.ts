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

export const cashClassifications: CashClassificationMeta[] = [
  { value: 'CASA', title: 'CASA', description: 'Current Account / Savings Account', color: 'blue', icon: 'mdi-bank' },
  { value: 'TIME_INVESTMENT', title: 'Time Investment', description: 'Time deposit / money market', color: 'purple', icon: 'mdi-chart-timeline-variant' },
  { value: 'PETTY_CASH', title: 'Petty Cash', description: 'Physical cash on hand', color: 'orange', icon: 'mdi-cash-multiple' },
]

export const classificationMeta = (value: CashClassification): CashClassificationMeta =>
  cashClassifications.find((c) => c.value === value) ?? cashClassifications[0]

export const DEFAULT_REPLENISH_THRESHOLD = 1000

/**
 * Ceiling on undeposited cash. The mirror of DEFAULT_REPLENISH_THRESHOLD: that
 * one warns when a petty cash fund runs too LOW, this one warns when collections
 * held on hand run too HIGH and should be banked.
 *
 * Why a ceiling matters: a fidelity bond / insurance policy normally covers cash
 * on hand only up to a stated amount, theft and loss exposure grows with
 * whatever is sitting in the drawer, and auditors question large undeposited
 * balances. Tune this to whatever the company's insurance and cash-handling
 * policy actually allows.
 */
export const DEFAULT_DEPOSIT_THRESHOLD = 20000

export type CreateCashAccountPayload = {
  name: string
  classification: CashClassification
  opening_balance: number
  is_active: boolean
  /** Chart-of-accounts asset account this cash sits in (e.g. '1050' for a
   *  revolving fund). Defaulted from classification, overridable. */
  gl_account_code: string | null
}

/**
 * GL accounts a cash account may be filed under: current assets only, and NOT
 * the Cash Advances range.
 *
 * 1060-1090 are receivables -- money owed TO the company by an employee or the
 * owner -- not cash anyone can spend from. Offering them here would let someone
 * pay an expense "out of" a cash advance, which is not a thing.
 */
export const CASH_GL_RANGE = { floor: 1000, ceiling: 1059 }

/**
 * Inside that range but NOT cash: a receivable and stock, neither of which
 * anyone can pay an expense out of. Excluded by code rather than by narrowing
 * the range, so a future '1055 Cash in Bank - BPI' is offered automatically.
 */
export const CASH_GL_EXCLUDED = ['1030', '1035', '1040']

/** Outside the range but genuinely cash-like: where time deposits are filed. */
export const CASH_GL_EXTRA = ['1100']

/** Is this chart account somewhere a cash account's money can sit? */
export function isCashGLAccount(code: string): boolean {
  if (CASH_GL_EXCLUDED.includes(code)) return false
  if (CASH_GL_EXTRA.includes(code)) return true
  const n = parseInt(code, 10)
  return !isNaN(n) && n >= CASH_GL_RANGE.floor && n <= CASH_GL_RANGE.ceiling
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
