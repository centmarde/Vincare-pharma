import type { ReferenceType } from '@/stores/glData'
import { isCashGLAccount } from '@/utils/cashAccountTypes'

// Transaction templates for the Books entry screen.
//
// WHY THESE EXIST
// In a paper set of books the accountant never writes "DR"/"CR" — a special
// journal's COLUMNS supply one side, and the entry is balanced by the shape of
// the book. The General Journal dialog made him construct both sides by hand
// for transactions that are always the same two accounts, which is why he
// called it impractical. Each template below is that column structure: he
// fills in amounts, the debits and credits are structural, and an unbalanced
// entry is not expressible.
//
// SCOPE — deliberately only what has NO operational screen.
// gl_project_events already books sale, ethical_order, inhouse_order,
// collection, stock_in, supplier_payment, expense and petty_cash_replenishment
// from the operational modules. Adding templates for those would double-count
// them: once from the module, once from here. Everything below is a
// reference_type with rails and no feature behind it, plus owner's equity
// movements that only 'manual' covered.
//
// The account codes are verified against the live chart of accounts. Adding a
// template means checking its codes exist — a missing code fails at post time
// in postJournalEntry's account-active check, not here.

/** Which kind of input a template field renders. */
export type BookFieldKind = 'amount' | 'cashAccount' | 'account'

export type BookField = {
  key: string
  label: string
  kind: BookFieldKind
  /** Amount fields only: a blank/zero value is allowed and drops its line. */
  optional?: boolean
  hint?: string
  /**
   * `account` fields only: restricts the chart to a code range, so an
   * "expense to accrue" picker can't offer a liability.
   */
  accountFilter?: { from: string; to: string }
  /** `account` fields only: the code selected by default. */
  defaultCode?: string
  /** `account` fields only: codes the picker must not offer, whatever the range. */
  excludeCode?: (code: string) => boolean
  /** `account` fields only: the usual choices, offered as one-click picks —
   *  named by the reason (`label`), since staff know why the money came in
   *  before they know which account that is. */
  suggestions?: { code: string; label: string; hint: string }[]
}

/** Values collected from the form: amounts by key, plus resolved GL codes. */
export type BookFieldValues = {
  amounts: Record<string, number>
  /** For `cashAccount` and `account` fields — the GL code chosen. */
  codes: Record<string, string>
}

export type BookLine = { account_code: string; debit: number; credit: number }

export type BookTemplate = {
  id: string
  group: string
  title: string
  /** One line telling the accountant what this does, in his language. */
  summary: string
  referenceType: ReferenceType
  /** Default journal-entry description; the form lets him override it. */
  description: string
  fields: BookField[]
  /** Builds the balanced lines. Must return sum(debit) === sum(credit). */
  build: (v: BookFieldValues) => BookLine[]
}

const dr = (account_code: string, debit: number): BookLine => ({ account_code, debit, credit: 0 })
const cr = (account_code: string, credit: number): BookLine => ({ account_code, debit: 0, credit })

/**
 * Drops zero lines so an optional field left blank adds nothing.
 *
 * Tests `!== 0`, deliberately not `> 0`: a NEGATIVE line has to survive so the
 * caller can catch it. Filtering negatives out instead silently rebalances the
 * entry into something wrong — payroll with deductions exceeding gross dropped
 * its net-pay line entirely and reported the template as miscoded rather than
 * the figures as impossible.
 */
const nonZero = (lines: BookLine[]) => lines.filter((l) => l.debit !== 0 || l.credit !== 0)

const amount = (key: string, label: string, extra: Partial<BookField> = {}): BookField =>
  ({ key, label, kind: 'amount', ...extra })

const cashField = (label = 'Paid from / received into'): BookField =>
  ({ key: 'cash', label, kind: 'cashAccount' })

/**
 * What "Money received" may NOT be credited to, because each has its own
 * screen that keeps a sub-ledger tied to it, and why — the reason is shown to
 * whoever searches for one, rather than the account just not being there:
 *   - cash accounts: money between two of our own accounts is a transfer
 *     (Account Transfers / Bank Deposits), not money coming in;
 *   - 1030 Accounts Receivable, 1035 PDC Receivable, 2065 Customer Credits:
 *     a customer paying is a collection, recorded on the order, or the
 *     customer's statement would never show the payment;
 *   - 2010 Accounts Payable: the supplier aging is built from receipts and
 *     payments, so a credit here would move the ledger and not the aging;
 *   - 3030 Current Year Earnings: derived from the income statement, never
 *     posted to.
 */
const customerPayment = 'A customer paying is recorded as a collection on the order, so it reaches their statement.'
const subLedgerReasons: Record<string, string> = {
  '1030': customerPayment,
  '1035': customerPayment,
  '2065': customerPayment,
  '2010': 'Supplier money goes through Supplier Payments, so the supplier aging moves with it.',
  '3030': 'Current Year Earnings is worked out from the income statement and is never posted to.',
}

/** Why an account cannot be credited with money received, or null if it can. */
export function moneyReceivedBlockReason(code: string): string | null {
  if (isCashGLAccount(code)) return 'Money moving between our own accounts is a transfer — use Account Transfers or Bank Deposits.'
  return subLedgerReasons[code] ?? null
}

const notForMoneyReceived = (code: string) => moneyReceivedBlockReason(code) !== null

export const bookTemplates: BookTemplate[] = [
  // ─── Bank ────────────────────────────────────────────────────────────────
  {
    id: 'bank_charge',
    group: 'Bank',
    title: 'Bank service charge',
    summary: 'A fee the bank deducted from the account.',
    referenceType: 'bank_recon',
    description: 'Bank service charge',
    fields: [cashField('Account charged'), amount('amount', 'Charge')],
    build: (v) => [dr('8030', v.amounts.amount), cr(v.codes.cash, v.amounts.amount)],
  },
  {
    id: 'bank_interest',
    group: 'Bank',
    title: 'Bank interest earned',
    summary: 'Interest the bank credited to the account.',
    referenceType: 'bank_recon',
    description: 'Bank interest earned',
    fields: [cashField('Account credited'), amount('amount', 'Interest')],
    build: (v) => [dr(v.codes.cash, v.amounts.amount), cr('4030', v.amounts.amount)],
  },

  // ─── Loans ───────────────────────────────────────────────────────────────
  {
    id: 'loan_drawdown',
    group: 'Loans',
    title: 'Loan received',
    summary: 'Loan proceeds landed in the account.',
    referenceType: 'loan',
    description: 'Loan drawdown',
    fields: [cashField('Received into'), amount('amount', 'Principal received')],
    build: (v) => [dr(v.codes.cash, v.amounts.amount), cr('2500', v.amounts.amount)],
  },
  {
    id: 'loan_payment',
    group: 'Loans',
    title: 'Loan repayment',
    summary: 'A repayment split into principal and interest — enter both and it posts as one entry.',
    referenceType: 'loan',
    description: 'Loan repayment',
    fields: [
      cashField('Paid from'),
      amount('principal', 'Principal', { optional: true }),
      amount('interest', 'Interest', { optional: true }),
      {
        key: 'interestAccount', label: 'Interest account', kind: 'account',
        accountFilter: { from: '8000', to: '8999' }, defaultCode: '8010',
        hint: 'Cash loan or credit line',
      },
    ],
    build: (v) => nonZero([
      dr('2500', v.amounts.principal ?? 0),
      dr(v.codes.interestAccount, v.amounts.interest ?? 0),
      cr(v.codes.cash, (v.amounts.principal ?? 0) + (v.amounts.interest ?? 0)),
    ]),
  },

  // ─── Period-end ──────────────────────────────────────────────────────────
  {
    id: 'depreciation',
    group: 'Period-end',
    title: 'Depreciation',
    summary: 'Periodic depreciation charge. Accumulated depreciation is a contra-asset, so it is credited.',
    referenceType: 'depreciation',
    description: 'Depreciation',
    fields: [amount('amount', 'Depreciation for the period')],
    build: (v) => [dr('7280', v.amounts.amount), cr('1590', v.amounts.amount)],
  },
  {
    id: 'accrue_expense',
    group: 'Period-end',
    title: 'Accrue an expense',
    summary: 'An expense incurred but not yet paid at period end.',
    referenceType: 'accrual',
    description: 'Accrued expense',
    fields: [
      {
        key: 'expenseAccount', label: 'Expense account', kind: 'account',
        accountFilter: { from: '5000', to: '8999' },
      },
      amount('amount', 'Amount incurred'),
    ],
    build: (v) => [dr(v.codes.expenseAccount, v.amounts.amount), cr('2020', v.amounts.amount)],
  },
  {
    id: 'pay_accrued',
    group: 'Period-end',
    title: 'Pay an accrued expense',
    summary: 'Settling something previously accrued — hits the liability, not the expense again.',
    referenceType: 'accrual',
    description: 'Accrued expense paid',
    fields: [cashField('Paid from'), amount('amount', 'Amount paid')],
    build: (v) => [dr('2020', v.amounts.amount), cr(v.codes.cash, v.amounts.amount)],
  },

  // ─── Payroll ─────────────────────────────────────────────────────────────
  {
    id: 'payroll',
    group: 'Payroll',
    title: 'Payroll run',
    summary: 'Gross pay, the statutory amounts withheld from it, and the net actually paid out. '
      + 'Net is whatever is left after the deductions, so it is not typed.',
    referenceType: 'payroll',
    description: 'Payroll',
    fields: [
      cashField('Net pay from'),
      amount('gross', 'Gross pay'),
      amount('sss', 'SSS withheld (employee)', { optional: true }),
      amount('phic', 'PhilHealth withheld (employee)', { optional: true }),
      amount('pagibig', 'Pag-IBIG withheld (employee)', { optional: true }),
      amount('tax', 'Withholding tax', { optional: true }),
    ],
    build: (v) => {
      const gross = v.amounts.gross ?? 0
      const sss = v.amounts.sss ?? 0
      const phic = v.amounts.phic ?? 0
      const pagibig = v.amounts.pagibig ?? 0
      const tax = v.amounts.tax ?? 0
      const net = gross - sss - phic - pagibig - tax
      return nonZero([
        dr('7200', gross),
        cr('2030', sss), cr('2040', phic), cr('2050', pagibig), cr('2070', tax),
        cr(v.codes.cash, net),
      ])
    },
  },
  {
    id: 'payroll_employer',
    group: 'Payroll',
    title: 'Employer contributions',
    summary: "The employer's own share — an expense on top of gross pay, not a deduction from it.",
    referenceType: 'payroll',
    description: 'Employer statutory contributions',
    fields: [
      amount('sss', 'SSS (employer)', { optional: true }),
      amount('phic', 'PhilHealth (employer)', { optional: true }),
      amount('pagibig', 'Pag-IBIG (employer)', { optional: true }),
    ],
    build: (v) => {
      const sss = v.amounts.sss ?? 0
      const phic = v.amounts.phic ?? 0
      const pagibig = v.amounts.pagibig ?? 0
      return nonZero([
        dr('7230', sss + phic + pagibig),
        cr('2030', sss), cr('2040', phic), cr('2050', pagibig),
      ])
    },
  },
  {
    id: 'payroll_remit',
    group: 'Payroll',
    title: 'Remit to SSS / PhilHealth / Pag-IBIG',
    summary: 'Paying the agencies what was withheld and accrued. Clears the payable, no new expense.',
    referenceType: 'payroll',
    description: 'Statutory remittance',
    fields: [
      cashField('Paid from'),
      amount('sss', 'SSS', { optional: true }),
      amount('phic', 'PhilHealth', { optional: true }),
      amount('pagibig', 'Pag-IBIG', { optional: true }),
      amount('tax', 'Withholding tax', { optional: true }),
    ],
    build: (v) => {
      const sss = v.amounts.sss ?? 0
      const phic = v.amounts.phic ?? 0
      const pagibig = v.amounts.pagibig ?? 0
      const tax = v.amounts.tax ?? 0
      return nonZero([
        dr('2030', sss), dr('2040', phic), dr('2050', pagibig), dr('2070', tax),
        cr(v.codes.cash, sss + phic + pagibig + tax),
      ])
    },
  },

  // ─── Post-dated cheques ──────────────────────────────────────────────────
  {
    id: 'pdc_in_received',
    group: 'Post-dated cheques',
    title: 'Customer PDC received',
    summary: "A customer's post-dated cheque. Moves the receivable out of AR until it clears — it is not cash yet.",
    referenceType: 'pdc',
    description: 'Customer PDC received',
    fields: [amount('amount', 'Cheque amount')],
    build: (v) => [dr('1035', v.amounts.amount), cr('1030', v.amounts.amount)],
  },
  {
    id: 'pdc_in_cleared',
    group: 'Post-dated cheques',
    title: 'Customer PDC cleared',
    summary: 'The bank honoured it — now it is cash.',
    referenceType: 'pdc',
    description: 'Customer PDC cleared',
    fields: [cashField('Cleared into'), amount('amount', 'Cheque amount')],
    build: (v) => [dr(v.codes.cash, v.amounts.amount), cr('1035', v.amounts.amount)],
  },
  {
    id: 'pdc_in_bounced',
    group: 'Post-dated cheques',
    title: 'Customer PDC bounced',
    summary: 'The cheque was dishonoured — the receivable goes back to AR.',
    referenceType: 'pdc',
    description: 'Customer PDC bounced',
    fields: [amount('amount', 'Cheque amount')],
    build: (v) => [dr('1030', v.amounts.amount), cr('1035', v.amounts.amount)],
  },
  {
    id: 'pdc_out_issued',
    group: 'Post-dated cheques',
    title: 'Cheque issued to supplier (post-dated)',
    summary: 'Moves the payable to PDC Payable. Cash is untouched until the cheque clears.',
    referenceType: 'pdc',
    description: 'Post-dated cheque issued',
    fields: [amount('amount', 'Cheque amount')],
    build: (v) => [dr('2010', v.amounts.amount), cr('2015', v.amounts.amount)],
  },
  {
    id: 'pdc_out_cleared',
    group: 'Post-dated cheques',
    title: 'Supplier cheque cleared',
    summary: 'The cheque was presented — cash leaves now.',
    referenceType: 'pdc',
    description: 'Post-dated cheque cleared',
    fields: [cashField('Paid from'), amount('amount', 'Cheque amount')],
    build: (v) => [dr('2015', v.amounts.amount), cr(v.codes.cash, v.amounts.amount)],
  },

  // ─── Cash received ───────────────────────────────────────────────────────
  {
    id: 'money_received',
    group: 'Cash received',
    title: 'Money received (not from a customer)',
    summary: 'Money credited to us by someone who is not paying an invoice — SSS or Pag-IBIG paying back, a refund, a grant. The cash account is debited; pick the account to credit.',
    // Posted like the other templates here, with no document behind it (the
    // reference id stays null): the entry is the whole record, and its
    // description carries who paid and their reference.
    referenceType: 'manual',
    description: 'Money received',
    fields: [
      cashField('Received into'),
      {
        key: 'creditAccount', label: 'Credit to', kind: 'account',
        excludeCode: notForMoneyReceived,
        hint: 'What the money is for. Customer payments are not entered here — record them as a collection on the order.',
        // The accountant's call each time — what an agency pays back depends
        // on how the original amount was booked. These are the usual ones.
        suggestions: [
          { code: '1080', label: 'Employee benefit paid back', hint: 'Paying back a benefit the company advanced to an employee and charged to Cash Advances – Employee (e.g. SSS sickness or maternity).' },
          { code: '2030', label: 'SSS over-remittance', hint: 'SSS returning contributions remitted in excess, still on SSS Payable.' },
          { code: '2050', label: 'Pag-IBIG over-remittance', hint: 'Pag-IBIG returning contributions remitted in excess, still on Pag-IBIG Payable.' },
          { code: '7230', label: 'Employer-share refund', hint: 'A refund of employer-share contributions already booked as an expense.' },
          { code: '4030', label: 'Other income', hint: 'Income with nothing owed back: a refund of a fee, a grant, a dividend.' },
        ],
      },
      amount('amount', 'Amount received'),
    ],
    build: (v) => [dr(v.codes.cash, v.amounts.amount), cr(v.codes.creditAccount, v.amounts.amount)],
  },

  // ─── Owner ───────────────────────────────────────────────────────────────
  {
    id: 'owner_drawing',
    group: 'Owner',
    title: "Owner's withdrawal",
    summary: 'Money taken out by the owner. A contra-equity account, not an expense.',
    referenceType: 'manual',
    description: "Owner's withdrawal",
    fields: [cashField('Taken from'), amount('amount', 'Amount')],
    build: (v) => [dr('3040', v.amounts.amount), cr(v.codes.cash, v.amounts.amount)],
  },
  {
    id: 'owner_capital',
    group: 'Owner',
    title: 'Owner capital injection',
    summary: 'Money put in by the owner.',
    referenceType: 'manual',
    description: 'Owner capital injection',
    fields: [cashField('Received into'), amount('amount', 'Amount')],
    build: (v) => [dr(v.codes.cash, v.amounts.amount), cr('3010', v.amounts.amount)],
  },
]

export const bookTemplateById = (id: string) => bookTemplates.find((t) => t.id === id) ?? null

/** Templates grouped for the picker, preserving the order declared above. */
export const bookTemplateGroups = () => {
  const groups: { group: string; templates: BookTemplate[] }[] = []
  for (const template of bookTemplates) {
    const last = groups[groups.length - 1]
    if (last && last.group === template.group) last.templates.push(template)
    else groups.push({ group: template.group, templates: [template] })
  }
  return groups
}
