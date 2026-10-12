// Types and constants for the financeData store, shared by its feature files.
// Re-exported from the barrel (../financeData.ts) so existing
// `@/stores/financeData` imports keep resolving.

/**
 * What an expense is charged to: a GL account CODE from the chart of accounts
 * ('7050'), not a fixed slug.
 *
 * It was a closed union of 13 slugs, which meant a hardcoded map in three
 * places that all had to agree — the dropdown here, the slug -> account `case`
 * in gl_project_events, and finance_details_category_check in the database.
 * Miss the third and the category is selectable, prints on the voucher, and
 * then fails only when the expense is recorded; that is exactly what
 * 20260826_finance_details_allow_meals.sql was written to repair. Reading the
 * chart of accounts instead means adding an account in Chart of Accounts is the
 * whole job.
 *
 * Widened to `string` rather than a generated union because the valid set now
 * lives in the database and changes without a rebuild.
 */
export type ExpenseCategory = string

/**
 * The 13 slugs categories used to be, kept ONLY to render rows written before
 * the switch. Nothing writes these any more — new expenses store an account
 * code — but historical finance_details and disbursement_voucher_items rows
 * still hold them, and a report over last quarter has to label them.
 *
 * gl_project_events keeps the matching slug -> account fallback for the same
 * reason. Do not add to this list; add an account to the chart instead.
 */
export const legacyExpenseCategories = [
  { value: 'rent', title: 'Rent' },
  { value: 'utilities', title: 'Utilities' },
  { value: 'supplies', title: 'Supplies' },
  { value: 'maintenance', title: 'Maintenance' },
  { value: 'transportation', title: 'Transportation' },
  { value: 'taxes_fees', title: 'Taxes & Fees' },
  { value: 'other', title: 'Other' },
  { value: 'representation', title: 'Representation' },
  { value: 'fuel_lubricants', title: 'Fuel & Lubricants' },
  { value: 'labor_services', title: 'Labor & Other Services' },
  { value: 'freight_handling', title: 'Freight & Handling' },
  { value: 'taxes_licenses', title: 'Taxes & Licenses' },
  { value: 'meals', title: 'Meals' },
] as const

// Which department a disbursement is charged to. Shared by the voucher form,
// Add Expense and the expense change-request editor, so a value added here
// appears in all three at once.
//
// Deliberately NOT read from the `departments` table: that table is empty (0
// rows), so a picker bound to it would offer nothing. If it is ever populated,
// this list is the thing to replace — the same move the expense categories made
// when they stopped being a hardcoded list and started reading the chart of
// accounts.
//
// Safe to extend: finance_details.department carries no CHECK constraint
// (verified by probe 2026-09-25), so a new value here needs no schema change —
// unlike finance_details.category, whose CHECK had to be dropped for exactly
// that reason.
/**
 * Account CLASSES a disbursement may be charged to.
 *
 * Lives here rather than in useExpenseAccounts because recordExpense has to
 * validate against the same rule — a store cannot import a composable, and two
 * copies would drift into "selectable but unrecordable", which is precisely
 * what the finance_details.category CHECK used to cause.
 *
 * Was an allow-list of four expense subsections, which meant a voucher could
 * not record a fixed-asset purchase, a loan repayment or a statutory
 * remittance at all — 37 of 78 accounts were unreachable. A disbursement
 * credits cash, so its debit can be anything that INCREASES with a debit: an
 * asset acquired, a liability settled, equity withdrawn, or an expense.
 *
 * REVENUE IS THE ONE EXCLUSION. Debiting 4010/4020/4030 while crediting cash
 * is never a real transaction — a sales return reverses a receivable, it does
 * not disburse. Offering them would only ever produce a miscode.
 *
 * Keyed on class rather than subsection so a NEW subsection added to the chart
 * (say a second asset grouping) is offered automatically, the same property
 * that made the category picker read the chart in the first place.
 */
export const disbursementAccountClasses = [
  'asset', 'liability', 'equity', 'cost', 'expense',
] as const

/**
 * Subsections pulled to the top of the picker, in this order.
 *
 * Everything else follows, ordered by its lowest account code (so Current
 * Assets precedes Liabilities precedes Equity). These four lead because they
 * are the bulk of what actually gets disbursed — burying them under the
 * balance sheet would make the common case the slowest to reach.
 */
export const disbursementPreferredSubsections = [
  'Administrative & Operating Expenses',
  'Selling Expenses',
  'Cost of Sales',
  'Finance Costs',
] as const

export const expenseDepartments = [
  { value: 'VP-Admin', title: 'VP-Admin' },
  { value: 'VP-Selling', title: 'VP-Selling' },
  { value: 'EPT/ADMIN', title: 'EPT/ADMIN' },
  { value: 'EPT/SELLING', title: 'EPT/SELLING' },
  { value: 'ETHICAL', title: 'ETHICAL' },
  { value: 'Van Selling', title: 'Van Selling' },
  { value: 'STORE - CDO', title: 'STORE - CDO' },
] as const

export type ExpenseDepartment = typeof expenseDepartments[number]['value']

export const expensePaymentMethods = [
  { value: 'cash', title: 'Cash' },
  { value: 'petty_cash', title: 'Petty Cash' },
  { value: 'cheque', title: 'Cheque' },
  { value: 'bank_transfer', title: 'Bank Transfer' },
  { value: 'gcash', title: 'GCash' },
  { value: 'credit_card', title: 'Credit Card' },
  { value: 'debit_card', title: 'Debit Card' },
  { value: 'other', title: 'Other' },
] as const

export type ExpensePaymentMethod = typeof expensePaymentMethods[number]['value']

export type CashClassification = 'CASA' | 'TIME_INVESTMENT' | 'PETTY_CASH'

export type CashAccountType = {
  id: number
  created_at: string
  name: string
  // account_type is the legacy split kept for the replenishment RPCs/composables;
  // classification is the accountant-facing refinement (bank → CASA or TIME_INVESTMENT).
  // Both are written on insert and must agree: PETTY_CASH ↔ 'petty_cash'.
  account_type: 'petty_cash' | 'bank'
  classification: CashClassification
  opening_balance: number
  float_amount: number | null
  balance: number
  is_active: boolean
  /**
   * The chart-of-accounts asset account this cash account posts to. Recorded
   * rather than inferred from `classification` — three classifications cannot
   * address the chart's eight cash-ish asset accounts (a revolving fund belongs
   * in 1050, which no classification maps to). Optional because rows created
   * before the column existed have none; `glAccountCodeFor` falls back.
   */
  gl_account_code?: string | null
}

export type LiquidationReportItem = {
  reference_no: string | null
  category: ExpenseCategory | null
  paid_to: string | null
  or_si_no: string | null
  amount: number
  paid_at: string | null
}

export type PettyCashReplenishmentType = {
  id: number
  created_at: string
  reference_no: string | null
  cash_account_id: number | null
  cash_account_name: string | null
  funding_account_id: number | null
  funding_account_name: string | null
  amount: number
  status: string | null
  approved_at: string | null
  remarks: string | null
  created_by: string | null
  liquidation_report: LiquidationReportItem[]
}

export type ExpenseType = {
  id: number
  created_at: string
  reference_no: string | null
  category: ExpenseCategory | null
  department: ExpenseDepartment | null
  or_si_no: string | null
  paid_to: string | null
  payment_method: string | null
  amount: number | null
  paid_at: string | null
  remarks: string | null
  created_by: string | null
  cash_account_id: number | null
  cash_account_name: string | null
  // Soft void: status='voided' = reversed. The row stays in document lists,
  // flagged, but is excluded from every financial aggregate. (transactions.
  // voided_at/voided_by/void_reason were dropped from the schema — status is
  // now the only signal; collections/pos_sale_details still have those columns.)
  status: string
}

export type SupplierPaymentType = {
  id: number
  created_at: string
  reference_no: string | null
  supplier_id: number | null
  supplier_name: string | null
  payment_method: string | null
  amount: number | null
  paid_at: string | null
  remarks: string | null
  created_by: string | null
  status: string
}

/**
 * Age of an unpaid supplier invoice, in DAYS SINCE THE INVOICE DATE.
 *
 * Deliberately not the AR buckets: those measure days OVERDUE against a due
 * date, and `suppliers` carries no term_days, so there is no due date to be
 * late against. Calling a 60-day-old bill "overdue" would be an invention.
 * Add suppliers.term_days later and this can become a true overdue scale.
 */
export type APAgeBucket = '0-30' | '31-60' | '61-90' | '91-180' | '180+'

export const apAgeBuckets: APAgeBucket[] = ['0-30', '31-60', '61-90', '91-180', '180+']

/** One received-but-not-fully-paid supplier invoice. */
export type APAgingRow = {
  transaction_id: number
  reference_no: string | null
  supplier_id: number
  supplier_name: string | null
  invoice_date: string
  total_amount: number
  /** Derived by the oldest-first convention — NOT a recorded allocation. */
  paid: number
  balance: number
  days_outstanding: number
  bucket: APAgeBucket
}

export type SupplierAPRow = {
  supplier_id: number
  supplier_name: string | null
  total_received: number
  total_paid: number
  outstanding: number
  cached_balance: number | null
  has_drift: boolean
}

export type PnLByOutletRow = {
  // 'OTHER' catches GL revenue whose source document isn't one of the three
  // known channels. Kept visible on purpose: dropping it would let the split
  // silently stop summing to the statement's netSales.
  outlet: 'EXELMED' | 'ETHICAL' | 'INHOUSE' | 'OTHER'
  revenue: number
}

export type PnLSummary = {
  revenuePos: number
  revenueEthical: number
  revenueInhouse: number
  revenueTotal: number
  cogs: number
  opex: number
  net: number
  byOutlet: PnLByOutletRow[]
}

export type RemittanceDiscrepancyRow = {
  id: number
  reference_no: string | null
  outlet: string | null
  created_at: string
  expected_amount: number
  actual_amount: number
  discrepancy: number
  notes: string | null
  resolution: 'paid_on_spot' | 'employee_receivable' | null
  receivable_status: 'outstanding' | 'paid' | null
}

// Buckets match the accountant's Statement of Accounts sheet: 1-30 / 31-60 /
// 61-90 / 91-180 / over 6 months. `current` (not yet due) and `no-term` (no due
// date convention exists — every in-house order today) are app-side additions
// the sheet has no column for; they are never overdue, so they never age.
export type ARAgingTerm = 'current' | '1-30' | '31-60' | '61-90' | '91-180' | '180+' | 'no-term'

export type ARAgingRow = {
  id: number
  source: 'ethical_order' | 'inhouse_order'
  reference_no: string | null
  customer_id: number | null
  customer_name: string | null
  total_amount: number
  amount_paid: number
  balance: number
  due_date: string | null
  days_overdue: number | null
  term: ARAgingTerm
}

// A single receivable, drilled down for the AR jacket detail dialog. Read-only:
// the transactions row (+ its ethical/inhouse extension), the billed line items,
// and the payment ledger. Both In-House and Ethical record payments into
// `collections`, so one query shape serves both sources.
export type ARReceivableLine = {
  product_name: string | null
  unit: string | null
  qty: number
  unit_price: number
  line_total: number
}

export type ARReceivablePayment = {
  id: number
  date: string
  amount: number
  payment_method: string | null
  reference_no: string | null
}

export type ARReceivableDetail = {
  id: number
  source: 'ethical_order' | 'inhouse_order'
  reference_no: string | null
  status: string | null
  customer_name: string | null
  invoice_date: string | null
  // trace-back / terms
  po_no: string | null          // In-House company PO
  govt_po_no: string | null     // In-House government PO
  terms_days: number | null     // Ethical credit terms
  due_date: string | null       // Ethical due date
  // money
  total_amount: number
  amount_paid: number
  balance: number
  lines: ARReceivableLine[]
  payments: ARReceivablePayment[]
}

// Statement of Account — per CUSTOMER, not per order (that's what ARReceivableDetail
// above is). Every order (charge) and every payment (from the shared `collections`
// ledger) across the customer's whole history, chronological, with a running
// balance — the actual document an accountant would send a customer, as opposed
// to the per-order drill-down.
export type SOAEntry = {
  date: string
  type: 'charge' | 'payment'
  reference_no: string | null
  description: string
  charge: number
  payment: number
  running_balance: number
}

export type StatementOfAccount = {
  customer_id: number
  customer_name: string | null
  customer_address: string | null
  customer_contact: string | null
  customer_tin: string | null
  source: 'ethical_order' | 'inhouse_order'
  entries: SOAEntry[]
  totalCharges: number
  totalPayments: number
  endingBalance: number
  generated_at: string
}

export type CommissionLiabilityRow = {
  agent_id: number | null
  agent_name: string | null
  unpaid_commission: number
  oldest_unpaid_days: number | null
  flagged: boolean
  paid_missing_timestamp: number
}

export type StockReconRow = {
  product_id: number
  product_name: string | null
  location: 'WAREHOUSE' | 'EXELMED' | 'ETHICAL'
  on_hand: number
  expected: number
  drift: number
}

export type GLAccountLine = { code: string; name: string; amount: number }

export type GLISSection = {
  subsection: string
  accounts: GLAccountLine[]
  subtotal: number
}

export type GLIncomeStatement = {
  from: string
  to: string
  sections: GLISSection[]
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

export type GLBSSection = {
  class: string
  subsection: string
  accounts: GLAccountLine[]
  subtotal: number
}

export type GLBalanceSheet = {
  asOf: string
  sections: GLBSSection[]
  currentYearEarnings: number
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  tiesOut: boolean
}

export type TrialBalanceLine = {
  account_code: string
  account_name: string
  class: string
  debit_balance: number
  credit_balance: number
}

export type DateRange = { dateFrom?: string; dateTo?: string }

/** Unpaid commission older than this many days is flagged on the liability report. */
export const commissionLiabilityFlagDays = 30

/** How long a stock reconciliation result is reused before the replay runs again. */
export const stockReconCacheMs = 5 * 60 * 1000
