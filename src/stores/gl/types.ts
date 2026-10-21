// Types and constants for the glData store, shared by its feature files.
// Re-exported from the barrel (../glData.ts) so existing `@/stores/glData`
// imports keep resolving.

export type GLAccount = {
  code: string
  name: string
  class: 'asset' | 'liability' | 'equity' | 'revenue' | 'cost' | 'expense'
  section: 'income_statement' | 'balance_sheet'
  subsection: string
  normal_balance: 'debit' | 'credit'
  is_contra: boolean
  is_active: boolean
}

// The account-code scheme (see CLAUDE.md's "ACCOUNT-CODE SCHEME") — one
// numeric range per category. New accounts get the next free code within
// their chosen category's range (existing max + 10), so the accountant only
// ever picks WHERE a new line belongs; the code itself is derived, never typed.
export type AccountCategoryKey =
  | 'assets_current' | 'assets_noncurrent'
  | 'liabilities_current' | 'liabilities_noncurrent'
  | 'equity' | 'revenue' | 'cost_of_sales'
  | 'selling_expenses' | 'admin_expenses' | 'finance_costs'

export type AccountCategory = {
  key: AccountCategoryKey
  label: string
  floor: number
  ceiling: number
  class: GLAccount['class']
  section: GLAccount['section']
  subsection: string
  normalBalance: GLAccount['normal_balance']
}

export const ACCOUNT_CATEGORIES: AccountCategory[] = [
  { key: 'assets_current', label: 'Assets — Current (1000–1499)', floor: 1000, ceiling: 1499, class: 'asset', section: 'balance_sheet', subsection: 'Current Assets', normalBalance: 'debit' },
  { key: 'assets_noncurrent', label: 'Assets — Non-Current / PPE (1500–1999)', floor: 1500, ceiling: 1999, class: 'asset', section: 'balance_sheet', subsection: 'Non-Current Assets', normalBalance: 'debit' },
  { key: 'liabilities_current', label: 'Liabilities — Current (2000–2499)', floor: 2000, ceiling: 2499, class: 'liability', section: 'balance_sheet', subsection: 'Current Liabilities', normalBalance: 'credit' },
  { key: 'liabilities_noncurrent', label: 'Liabilities — Non-Current (2500–2999)', floor: 2500, ceiling: 2999, class: 'liability', section: 'balance_sheet', subsection: 'Non-Current Liabilities', normalBalance: 'credit' },
  { key: 'equity', label: 'Equity (3000–3999)', floor: 3000, ceiling: 3999, class: 'equity', section: 'balance_sheet', subsection: 'Equity', normalBalance: 'credit' },
  { key: 'revenue', label: 'Revenue (4000–4999)', floor: 4000, ceiling: 4999, class: 'revenue', section: 'income_statement', subsection: 'Revenue', normalBalance: 'credit' },
  { key: 'cost_of_sales', label: 'Cost of Sales (5000–5999)', floor: 5000, ceiling: 5999, class: 'cost', section: 'income_statement', subsection: 'Cost of Sales', normalBalance: 'debit' },
  { key: 'selling_expenses', label: 'Selling Expenses (6000–6999)', floor: 6000, ceiling: 6999, class: 'expense', section: 'income_statement', subsection: 'Selling Expenses', normalBalance: 'debit' },
  { key: 'admin_expenses', label: 'Administrative & Operating Expenses (7000–7999)', floor: 7000, ceiling: 7999, class: 'expense', section: 'income_statement', subsection: 'Administrative & Operating Expenses', normalBalance: 'debit' },
  { key: 'finance_costs', label: 'Finance Costs (8000–8999)', floor: 8000, ceiling: 8999, class: 'expense', section: 'income_statement', subsection: 'Finance Costs', normalBalance: 'debit' },
]

export type JournalLineInput = {
  account_code: string
  debit: number
  credit: number
  memo?: string
}

export type JournalEntryLine = {
  id: number
  account_code: string
  account_name?: string | null
  debit: number
  credit: number
  line_memo: string | null
}

/**
 * One movement through a single account, flattened for the account drill-down:
 * the line's own debit/credit plus the entry it belongs to, so the ledger reads
 * as a statement instead of requiring the caller to join back to the entry.
 */
export type AccountLedgerLine = {
  id: number
  entry_no: string | null
  entry_date: string
  status: JournalEntry['status']
  reference_type: ReferenceType
  description: string | null
  line_memo: string | null
  debit: number
  credit: number
  /** Signed by the account's normal balance, accumulated oldest-first. */
  runningBalance: number
}

export type ReferenceType =
  // 'sales_return' is the label the projector stamps on the REVERSAL of a POS
  // void or an Ethical cancellation, keyed on the sale's own id. A genuine
  // customer return is 'goods_return' — returns share the transactions id
  // sequence, so reusing 'sales_return' would let a return's entry be mistaken
  // for a void's and the void reversal skipped for good.
  | 'sales_invoice' | 'sales_return' | 'goods_return' | 'payment' | 'collection' | 'purchase_invoice'
  | 'disbursement' | 'pdc' | 'payroll' | 'accrual' | 'depreciation' | 'loan'
  | 'bank_recon' | 'manual' | 'closing'
  // Stock written off in the warehouse. Deliberately NOT 'manual': the
  // petty-cash replenishment loop books ('manual', <transactions id>), and a
  // disposal is also a transactions row from the same id sequence, so sharing
  // the type would let one document's entry be read as the other's
  // already-booked marker.
  | 'disposal'

export type JournalEntry = {
  id: number
  entry_no: string | null
  entry_date: string
  reference_type: ReferenceType
  reference_id: number | null
  description: string | null
  status: 'draft' | 'posted' | 'reversed'
  reverses_entry: number | null
  posted_at: string | null
  posted_by: string | null
  created_by: string | null
  created_at: string
  lines?: JournalEntryLine[]
}

export type TrialBalanceRow = {
  account_code: string
  account_name: string
  class: string
  debit_balance: number
  credit_balance: number
}

/**
 * The account that absorbs the difference when opening balances are loaded.
 *
 * A dedicated equity account rather than plugging straight to 3010 Owner's
 * Capital: the balancing figure stays visible as its own line until the
 * accountant clears it, so a mistyped opening balance shows up instead of
 * quietly becoming owner's capital. Same idea as QuickBooks/Xero.
 */
export const openingBalanceEquityCode = '3050'

/** One row of the opening-balance screen. `target` is what the account SHOULD
 *  read once posted, not the movement to apply. */
export type OpeningBalanceInput = { account_code: string; target: number }

export type StatementAccountRow = { code: string; name: string; amount: number }
export type IncomeStatementSection = { subsection: string; accounts: StatementAccountRow[]; subtotal: number }
export type IncomeStatement = {
  from: string
  to: string
  sections: IncomeStatementSection[]
  netSales: number
  cogs: number
  grossProfit: number
  sellingExpenses: number
  adminExpenses: number
  operatingIncome: number
  otherIncome: number
  financeCosts: number
  netIncome: number
}

/**
 * The Income Statement BY COLLECTIONS: the same statement, from the same
 * ledger, with a credit sale recognised as it is COLLECTED instead of when it
 * is invoiced or delivered.
 *
 * Collect 40% of an order and 40% of its sales, discount AND cost of goods
 * count, so gross profit is the profit actually realised in cash (the
 * installment-method idea). A POS sale is paid on the spot and counts in full.
 * Every other line (rebates, selling, admin, other income, finance costs) is
 * exactly as booked, the same as the accrual statement. Agreed with the
 * accountant, 2026-10-19.
 *
 * ⚠️ A management view. The statutory statement is the accrual one.
 */
export type CollectionIncomeStatement = IncomeStatement & {
  /**
   * Collected in the period on pre-cutover (opening) receivables. Those sales
   * were earned before this system and are not revenue in either statement;
   * shown as a note so the collections are not silently left out.
   */
  collectedOnOpeningReceivables: number
  /** Collected on orders with no sale in the ledger to match — shown as a note, not revenue. */
  collectedUnmatched: number
  /**
   * Net sales entered by MANUAL journal entry in the period (e.g. the monthly
   * bookings carried over from the old system). They carry no collection data,
   * so they stay as booked; noted so the two statements agreeing on them is
   * not mistaken for this one not working.
   */
  salesFromManualEntries: number
}

/**
 * The same statement, one column per month, for comparing periods side by side.
 *
 * Each month is a REAL `gl_income_statement` call rather than a second
 * implementation of the statement maths — a column that disagreed with what the
 * single-period view shows for the same month is the first thing an accountant
 * would catch, and re-deriving it in JS is how that happens.
 *
 * `total` is one more call over the whole range, NOT the sum of the columns:
 * summing them would hide a gap if a month were ever missed.
 */
export type MonthlyIncomeStatement = {
  from: string
  to: string
  /** 'YYYY-MM', ascending. */
  months: string[]
  perMonth: IncomeStatement[]
  total: IncomeStatement
}

export type MonthlyCollectionIncomeStatement = {
  from: string
  to: string
  months: string[]
  perMonth: CollectionIncomeStatement[]
  total: CollectionIncomeStatement
}

/** Most months a business will report on at once. A date range spanning years
 *  would otherwise mint a column (and a query) per month without limit. */
export const maxStatementColumns = 24

export type BalanceSheetSection = { class: string; subsection: string; accounts: StatementAccountRow[]; subtotal: number }
export type BalanceSheet = {
  asOf: string
  sections: BalanceSheetSection[]
  currentYearEarnings: number
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  tiesOut: boolean
}
