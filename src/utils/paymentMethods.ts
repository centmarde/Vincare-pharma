/**
 * How money changed hands. One vocabulary for the whole app — POS checkout,
 * Ethical rebate payouts and the customer trade profile were each keeping
 * their own copy of this list, which is how the values drift apart and a
 * report ends up unable to group them.
 *
 * ⚠️ These values are NOT cosmetic: `gl_project_events` books a POS sale to a
 * GL account by reading `payment_method` —
 *
 *     cash | petty_cash  ->  1010 Cash on Hand
 *     on_account (POS)   ->  1030 Accounts Receivable (see chargeToAccount)
 *     anything else      ->  1020 Cash in Bank
 *
 * so adding a value here decides where its money lands in the ledger. See the
 * note on `cheque` below before adding more.
 */
export type PaymentMethod = 'cash' | 'gcash' | 'bank' | 'cheque'

export type PaymentMethodMeta = {
  value: PaymentMethod
  title: string
  icon: string
  /** Cash is the only one that takes an amount tendered and returns change. */
  takesTendered: boolean
  /**
   * Everything that isn't cash leaves a trace worth recording — a GCash
   * reference, a cheque number, a bank transfer reference. Labelled per method
   * because "Reference" alone tells a cashier nothing about what to type.
   */
  referenceLabel: string | null
}

export const paymentMethods: PaymentMethodMeta[] = [
  { value: 'cash', title: 'Cash', icon: 'mdi-cash', takesTendered: true, referenceLabel: null },
  { value: 'gcash', title: 'GCash', icon: 'mdi-cellphone', takesTendered: false, referenceLabel: 'GCash reference no.' },
  { value: 'bank', title: 'Bank Transfer', icon: 'mdi-bank', takesTendered: false, referenceLabel: 'Transfer reference no.' },
  // ⚠️ A cheque currently books to 1020 Cash in Bank like any non-cash method,
  // i.e. as though it had already cleared. Strictly an uncleared cheque is
  // 1035 PDC Receivable until it does. Correcting that means teaching
  // gl_project_events about it, so it is flagged rather than silently wrong.
  { value: 'cheque', title: 'Cheque', icon: 'mdi-checkbook', takesTendered: false, referenceLabel: 'Cheque no.' },
]

export const paymentMethodOptions = paymentMethods.map((m) => ({ title: m.title, value: m.value }))

export function paymentMethodMeta(value: PaymentMethod | string | null): PaymentMethodMeta {
  return paymentMethods.find((m) => m.value === value) ?? paymentMethods[0]
}

/**
 * POS only: the sale is charged to a customer account and paid later. No money
 * changes hands at the till, so it is NOT in `paymentMethods` (which rebate
 * payouts and the trade profile offer). gl_project_events books it to 1030
 * Accounts Receivable; the payments go through `collections` like In-House
 * and Ethical ones.
 */
export const chargeToAccount = 'on_account'
export type PosPaymentMethod = PaymentMethod | typeof chargeToAccount
export type PosPaymentMethodMeta = Omit<PaymentMethodMeta, 'value'> & { value: PosPaymentMethod }

export const posPaymentMethods: PosPaymentMethodMeta[] = [
  ...paymentMethods,
  { value: chargeToAccount, title: 'Charge to account', icon: 'mdi-account-clock-outline', takesTendered: false, referenceLabel: null },
]

/**
 * How a customer pays a receivable at the office — the AR collection forms
 * (Ethical, In-House, POS charges) offer exactly these two, as the staff who
 * collect asked. Values are the shared ones above, so the GL reads them the
 * same way.
 */
export const collectionPaymentMethods: PaymentMethodMeta[] = paymentMethods.filter(
  (m) => m.value === 'cash' || m.value === 'cheque',
)
export const collectionPaymentMethodOptions = collectionPaymentMethods.map((m) => ({ title: m.title, value: m.value }))

/** A cheque as received: the issuing bank, its number, and the date written on it. */
export type ChequeDetails = { bank: string; number: string; date: string }

/**
 * What a cheque payment is still missing, as a phrase for "Needs …", or null
 * when complete (or the payment is not a cheque).
 */
export function chequeProblem(method: string | null | undefined, cheque: ChequeDetails): string | null {
  if (method !== 'cheque') return null
  const missing = [
    !cheque.bank.trim() && 'the bank',
    !cheque.number.trim() && 'the cheque no.',
    !cheque.date && 'the cheque date',
  ].filter(Boolean)
  return missing.length ? missing.join(', ') : null
}

/** The cheque details to save, or null when the payment is not a cheque. */
export function chequeFor(method: string | null | undefined, cheque: ChequeDetails): ChequeDetails | null {
  if (method !== 'cheque') return null
  return { bank: cheque.bank.trim(), number: cheque.number.trim(), date: cheque.date }
}

/** "BDO · No. 004512 · dated 2026-10-30" for a payment's cheque, or '' if none. */
export function chequeLabel(c: { cheque_bank?: string | null; cheque_no?: string | null; cheque_date?: string | null }): string {
  return [c.cheque_bank, c.cheque_no && `No. ${c.cheque_no}`, c.cheque_date && `dated ${c.cheque_date}`]
    .filter(Boolean).join(' · ')
}

/**
 * A `collections` row settled by returned goods, not money: the credit a
 * customer return created (2065 Customer Credits) taken off what the customer
 * owes. No cash account is involved, and gl_project_events books it DR 2065 /
 * CR 1030 instead of debiting cash. Its reference_no is the return's SR number.
 * Not in `paymentMethods` — nobody chooses it as a way to pay.
 */
export const returnCredit = 'return_credit'

/**
 * A `collections` row recording an issued CREDIT MEMO for an allowance (price
 * correction, short or damaged delivery, agreed allowance) — not money and not
 * returned goods. gl_project_events books it DR 4020 Sales Returns & Allowances
 * / CR 1030. Its reference_no is the CM number. A credit memo for RETURNED
 * goods uses returnCredit instead, since the return already booked 4020.
 */
export const creditMemo = 'credit_memo'

/** Settled by a credit, not money: no cash account, no commission. */
export function isCreditSettlement(method: string | null | undefined): boolean {
  return method === returnCredit || method === creditMemo
}

/** How a payment on a receivable reads: 'Bank Transfer', 'Returned goods', ... */
export function collectionMethodLabel(value: string | null | undefined): string {
  if (!value) return '—'
  if (value === returnCredit) return 'Returned goods'
  if (value === creditMemo) return 'Credit memo'
  return paymentMethods.find((m) => m.value === value)?.title ?? value
}

/** Like paymentMethodMeta, but knows a charge — so a charge sale never reads as "Cash". */
export function posPaymentMethodMeta(value: PosPaymentMethod | string | null): PosPaymentMethodMeta {
  return posPaymentMethods.find((m) => m.value === value) ?? paymentMethods[0]
}
