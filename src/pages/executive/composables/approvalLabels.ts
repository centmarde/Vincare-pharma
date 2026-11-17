// What an approval IS, in the approver's words — shared by the Action Required
// list and both approval dialogs (desktop and mobile), so every surface names
// a request the same way.
//
// The operations admins could not tell buying from selling: a purchase
// requisition (we buy) and an In-House "lock terms" (we sell) sat side by
// side, and the In-House one shows a PO number from the SAME PO-2026-###
// series Purchasing uses. Every item now carries a direction.

export type ApprovalKind = 'undo' | 'pr_approval' | 'disposal' | 'short_dated' | 'terms' | 'credit_memo'
export type ApprovalDirection = 'buying' | 'selling' | 'correction' | 'stock'

export const directionMeta: Record<ApprovalDirection, { label: string; color: string; icon: string; hint: string }> = {
  buying: { label: 'BUYING', color: 'orange-darken-2', icon: 'mdi-cart-arrow-down', hint: 'Money goes out to a supplier' },
  selling: { label: 'SELLING', color: 'green-darken-1', icon: 'mdi-cash-plus', hint: 'Money comes in from a customer' },
  correction: { label: 'CORRECTION', color: 'blue-darken-1', icon: 'mdi-file-edit-outline', hint: 'A change to a document already recorded' },
  stock: { label: 'STOCK', color: 'brown', icon: 'mdi-package-variant-closed', hint: 'About warehouse stock itself — disposing of it, or releasing short-dated stock' },
}

export const directionFilters: { value: ApprovalDirection | 'all'; title: string }[] = [
  { value: 'all', title: 'All' },
  { value: 'buying', title: 'Buying' },
  { value: 'selling', title: 'Selling' },
  { value: 'correction', title: 'Corrections' },
  { value: 'stock', title: 'Stock' },
]

export function directionOf(kind: ApprovalKind): ApprovalDirection {
  if (kind === 'pr_approval') return 'buying'
  // A credit memo takes an amount off a CUSTOMER's bill — the selling side.
  if (kind === 'terms' || kind === 'credit_memo') return 'selling'
  if (kind === 'disposal' || kind === 'short_dated') return 'stock'
  return 'correction'
}

/** A document type the way staff say it. */
export const documentTypeLabel: Record<string, string> = {
  expense: 'expense',
  supplier_payment: 'supplier payment',
  sale: 'sale',
  remittance: 'remittance',
  inhouse_order: 'In-House order',
  ethical_order: 'Ethical order',
  purchase_requisition: 'purchase requisition',
  purchase_order: 'purchase order',
  stock_in: 'stock receipt',
}

/** Which side of the business a corrected document sits on. */
export function documentSide(transactionType: string | null | undefined): 'buying' | 'selling' | null {
  if (!transactionType) return null
  if (['expense', 'supplier_payment', 'purchase_requisition', 'purchase_order', 'stock_in'].includes(transactionType)) return 'buying'
  if (['sale', 'remittance', 'inhouse_order', 'ethical_order'].includes(transactionType)) return 'selling'
  return null
}

/**
 * The action a change request asks for — "Edit expense", "Void supplier
 * payment", "Correct payment", "Unapprove PR" — instead of the old blanket
 * "Undo" every request used to show.
 */
export function changeActionLabel(
  requestType: string | null | undefined,
  transactionType: string | null | undefined,
  proposedChanges: Record<string, unknown> | null | undefined,
): string {
  if (requestType === 'undo_pr') return 'Unapprove PR'
  const changes = proposedChanges ?? {}
  const isVoid = requestType === 'void'
  const verb = isVoid ? 'Void' : 'Edit'
  if ('__collection_id' in changes) return isVoid ? 'Void customer payment' : 'Correct customer payment'
  if ('__opening_receivable' in changes) return isVoid ? 'Void opening receivable' : 'Correct opening receivable'
  if (transactionType === 'remittance') return 'Correct remittance'
  const doc = transactionType ? documentTypeLabel[transactionType] : null
  return doc ? `${verb} ${doc}` : isVoid ? 'Void' : 'Edit'
}

/** Field names in proposed_changes, as staff read them. */
const fieldLabels: Record<string, string> = {
  amount: 'Amount',
  category: 'Expense account',
  paid_at: 'Date',
  cash_account_id: 'Paid from',
  department: 'Department',
  payment_method: 'Payment method',
  paid_to: 'Paid to',
  or_si_no: 'OR/SI no.',
  remarks: 'Description',
  actual_amount: 'Cash counted',
  reference_no: 'Reference / OR no.',
  cheque_bank: 'Cheque bank',
  cheque_no: 'Cheque no.',
  cheque_date: 'Cheque date',
  invoice_date: 'Invoice date',
  original_amount: 'Original invoice amount',
  original_no: 'Their invoice number',
  paid_before_cutover: 'Collected before cutover',
  credit_memo_amount: 'Credit memo before cutover',
  credit_memo_no: 'Their credit memo number',
  credit_memo_date: 'Credit memo date',
  term_days: 'Credit term (days)',
  term_label: 'Term as they word it',
  notes: 'Notes',
}

export function changeFieldLabel(key: string): string {
  if (fieldLabels[key]) return fieldLabels[key]
  const words = key.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Money-valued fields, shown in pesos. */
export const moneyFields = new Set(['amount', 'actual_amount', 'original_amount', 'paid_before_cutover', 'credit_memo_amount'])
/** Date-valued fields. */
export const dateFields = new Set(['paid_at', 'invoice_date', 'credit_memo_date', 'cheque_date'])

/** The suppliers on a purchase requisition, named once each. */
export function prSuppliers(raw: any): string {
  const names = [...new Set(((raw?.items ?? []) as { supplier_name?: string | null }[])
    .map((item) => item.supplier_name?.trim())
    // The PR mapper fills a missing supplier with '—'.
    .filter((name) => name && name !== '—'))] as string[]
  if (!names.length) return 'supplier not set'
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2} more` : names.join(', ')
}

/** A purchase requisition's total, from its lines (the stored total can be stale). */
export function prTotal(raw: any): number {
  return ((raw?.items ?? []) as { qty?: number; cost_per_unit?: number }[])
    .reduce((sum, item) => sum + (item.qty ?? 0) * (item.cost_per_unit ?? 0), 0)
}

/**
 * One line at the top of a non-change-request approval: which way the money
 * goes, and with whom. Change requests carry their own (ChangeRequestDecisionPanel).
 */
export function bannerFor(kind: ApprovalKind, raw: any): { direction: ApprovalDirection; text: string } {
  const direction = directionOf(kind)
  switch (kind) {
    case 'pr_approval':
      return { direction, text: `Buying stock from ${prSuppliers(raw)} — money goes out to the supplier.` }
    case 'terms':
      return {
        direction,
        text: raw?.request_type === 'unlock_terms'
          ? `Undoing the agreed terms of a sale to ${raw?.customer_name ?? 'a customer'}.`
          : `Selling to ${raw?.customer_name ?? 'a customer'} (${raw?.order_type === 'ethical_order' ? 'Ethical' : 'In-House'}) — money comes in from the customer.`,
      }
    case 'credit_memo':
      return { direction, text: `A credit to ${raw?.customer_name ?? 'a customer'} — takes an amount off what they owe us for a sale.` }
    case 'disposal':
      return { direction, text: 'Writing off warehouse stock — no sale and no purchase.' }
    case 'short_dated':
      return { direction, text: `Releasing short-dated stock for a sale to ${raw?.customer_name ?? 'a customer'}.` }
    default:
      return { direction, text: 'A change to a document already recorded.' }
  }
}
