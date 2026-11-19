import { chequeFor, chequeLabel, chequeProblem, collectionMethodLabel, isCreditSettlement, paymentDiscount } from '@/utils/paymentMethods'
import type { ChequeDetails } from '@/utils/paymentMethods'
import { paymentDateProblem } from '@/stores/shared/collectionSettlement'
import { formatCurrency, formatDateOnly, toLocalISODate } from '@/utils/helpers'

// One way to take a payment on a receivable — Ethical, In-House and POS
// charges all collect through CollectionPaymentFields, so the checks, the
// confirmation text and the order things are recorded in live here once.
//
// A payment can come with a DISCOUNT (settling the bill for less than its
// balance). That is recorded as a second line with method 'payment_discount':
// no cash, no commission, booked DR 4040 / CR 1030 by the store.

export type SettlementInput = {
  amount: number
  discount: number
  /** YYYY-MM-DD; blank means today. */
  paidOn: string
  method: string
  reference: string
  remarks: string
  cashAccountId: number | null
  cheque: ChequeDetails
}

/** What a store's payment writer takes (Ethical, In-House and POS charges all match). */
export type SettlementRecordPayload = {
  amount: number
  method: string
  reference?: string
  remarks?: string
  cashAccountId: number | null
  cheque: ChequeDetails | null
  paidOn: string | null
}

export const todayISO = () => toLocalISODate(new Date())

/** Why this payment cannot be recorded yet, or null. */
export function settlementProblem(input: SettlementInput, balance: number): string | null {
  const amount = Number(input.amount) || 0
  const discount = Number(input.discount) || 0
  if (amount < 0 || discount < 0) return 'Amounts cannot be negative.'
  if (amount + discount <= 0) return 'Enter the amount received or a discount.'
  if (amount + discount > balance + 0.005) return 'Amount + discount is more than what is owed.'
  const dateProblem = paymentDateProblem(input.paidOn)
  if (dateProblem) return dateProblem
  if (amount > 0) {
    if (input.cashAccountId == null) return 'Choose which cash account received this payment.'
    const missing = chequeProblem(input.method, input.cheque)
    if (missing) return `Enter ${missing} for this cheque.`
  }
  return null
}

/**
 * What voiding one payment line does, for the change-request dialog. A
 * discount, return credit or credit memo never touched a cash account, so its
 * void must not say it does.
 */
export function collectionVoidSummary(amount: number, method: string | null, docNo: string | null, noun = 'payment'): string {
  const on = docNo ?? 'the order'
  if (isCreditSettlement(method)) {
    const what = method === paymentDiscount ? 'discount' : collectionMethodLabel(method).toLowerCase()
    return `Void this ${formatCurrency(amount)} ${what} on ${on} — reverses its ledger entry and puts ${formatCurrency(amount)} back on what the customer owes. No cash account is touched.`
  }
  return `Void this ${formatCurrency(amount)} ${noun} on ${on} — reverses it in the ledger (DR AR / CR cash), takes it back off the cash account, and rolls the order's paid amount + status back.`
}

/** The toast when a payment went in but its discount did not. */
export function discountFailedMessage(amount: number): string {
  return amount > 0
    ? 'The payment was recorded, but the discount was not. Enter the discount again on its own.'
    : 'The discount was not recorded. Try again.'
}

/** The confirmation dialog's lines. */
export function settlementSummary(input: SettlementInput, balance: number, cashAccountName: string): string {
  const amount = Number(input.amount) || 0
  const discount = Number(input.discount) || 0
  const cheque = amount > 0 ? chequeFor(input.method, input.cheque) : null
  const after = Math.max(0, balance - amount - discount)
  return [
    `Payment date: ${formatDateOnly(input.paidOn || todayISO())}`,
    amount > 0 ? `Amount received: ${formatCurrency(amount)}` : '',
    amount > 0 ? `Method: ${collectionMethodLabel(input.method)}` : '',
    cheque ? `Cheque: ${chequeLabel({ cheque_bank: cheque.bank, cheque_no: cheque.number, cheque_date: cheque.date })}` : '',
    amount > 0 ? `Deposited to: ${cashAccountName}` : '',
    discount > 0 ? `Discount given: ${formatCurrency(discount)} (taken off the bill, no cash)` : '',
    `Reference / OR #: ${input.reference || '—'}`,
    `Note: ${input.remarks || '—'}`,
    `Remaining balance after this: ${formatCurrency(after)}`,
    after <= 0.005 ? 'This will mark it as PAID IN FULL.' : '',
  ].filter(Boolean).join('\n')
}

/**
 * Record the payment, then the discount. The money first: if the discount
 * then fails, the payment still stands and staff only re-enter the discount.
 */
export async function recordSettlement(
  input: SettlementInput,
  record: (payload: SettlementRecordPayload) => Promise<{ success: boolean; stuck?: boolean }>,
): Promise<{ success: boolean; discountFailed?: boolean; discountStuck?: boolean }> {
  const amount = Number(input.amount) || 0
  const discount = Number(input.discount) || 0
  const paidOn = input.paidOn || null
  if (amount > 0) {
    const paid = await record({
      amount,
      method: input.method,
      reference: input.reference || undefined,
      remarks: input.remarks || undefined,
      cashAccountId: input.cashAccountId,
      cheque: chequeFor(input.method, input.cheque),
      paidOn,
    })
    if (!paid.success) return { success: false }
  }
  if (discount > 0) {
    const discounted = await record({
      amount: discount,
      method: paymentDiscount,
      reference: input.reference || undefined,
      remarks: input.remarks ? `Discount — ${input.remarks}` : 'Discount given at payment',
      cashAccountId: null,
      cheque: null,
      paidOn,
    })
    // stuck: the discount row could be neither booked nor removed — Finance
    // fixes it; entering it again would give the discount twice.
    if (!discounted.success) return { success: amount > 0, discountFailed: true, discountStuck: !!discounted.stuck }
  }
  return { success: true }
}
