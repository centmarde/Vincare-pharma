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
