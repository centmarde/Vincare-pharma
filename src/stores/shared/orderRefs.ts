// The paper references an Ethical / In-House order is known by, for the order
// lists: its delivery receipts and, for an opening receivable, the customer's
// original invoice number. Pure (no Supabase), so mappers and stores share it.

/** How an opening receivable's remarks begin; the original invoice number follows. */
export const openingRemarksPrefix = 'Opening receivable — original invoice '

/**
 * The original invoice number an opening receivable was recorded with, or null.
 * Searched anywhere in the remarks, not just at the start: a voided one carries
 * "Voided: …" in front of it.
 */
export function originalInvoiceNo(remarks: string | null | undefined): string | null {
  const text = remarks ?? ''
  const at = text.indexOf(openingRemarksPrefix)
  if (at < 0) return null
  const no = text.slice(at + openingRemarksPrefix.length).split(' · ')[0].trim()
  return no && no !== '(unnumbered)' ? no : null
}

/** DR numbers from an embedded `delivery_receipts(dr_no)`, oldest first. */
export function drNumbersOf(embedded: unknown): string[] {
  return ((Array.isArray(embedded) ? embedded : []) as { dr_no?: string | null }[])
    .map((dr) => dr.dr_no ?? '')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** What the order lists show in their DR / Invoice # column. */
export function orderDocRefs(order: { dr_nos?: string[]; original_invoice_no?: string | null }): string {
  if (order.dr_nos?.length) return order.dr_nos.join(', ')
  return order.original_invoice_no ? `Inv. ${order.original_invoice_no}` : ''
}
