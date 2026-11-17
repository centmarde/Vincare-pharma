// The one search rule for the Finance lists (Vouchers, Expenses, Supplier
// Payments, AR, Opening Receivables, Credit Memos, Consignment, Chart of
// Accounts, General Journal), so a search box behaves the same on every page:
//
//  - Words match in any order and across columns: "liq aug" finds a row whose
//    remarks read "LIQ. AUG, 01-04". Every word must be somewhere in the row.
//  - Part of a number works: "406" finds DV-2026-406 and EXP-2026-406.
//  - An amount, typed with or without commas or ₱ ("3776", "3,776.50",
//    "₱3,776"), also matches the row's amounts: a whole number matches any
//    centavos (3776 finds ₱3,776.40), a decimal matches exactly. "100" no
//    longer finds ₱1,100.00 the way a plain text match on "1100.00" did.
//  - Words and an amount mix: "meralco 3,776" finds the Meralco row of
//    ₱3,776.40 — each word matches the text OR the row's amounts.
//  - Case and extra spaces are ignored; a cleared box (null) shows everything.
//
// Pages build each row's searchable text ONCE (searchText, in a computed over
// the rows), so typing only runs `includes` checks instead of re-reading and
// lower-casing every field on every keystroke.

export type AmountQuery = { amount: number; wholePeso: boolean }

export type SearchQuery = {
  /** Lower-cased words, each of which must appear in the row. */
  terms: string[]
  /** Each term read as an amount (null when it is not one), same order as `terms`. */
  termAmounts: (AmountQuery | null)[]
  /** Set when the whole query reads as an amount ("₱ 3,776" with a space). */
  amount: AmountQuery | null
}

/**
 * An amount typed into a search box: "3776", "3,776", "₱3,776.50". Null when
 * the text is not a plain amount, so it is searched as text only.
 */
export function parseAmountQuery(text: string): AmountQuery | null {
  const cleaned = text.trim().replace(/^php/i, '').replace(/[₱,\s]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  const amount = Number(cleaned)
  // "0" would match every unpaid document's ₱0.00 — search it as text only.
  if (!(amount > 0)) return null
  return { amount, wholePeso: !/\.\d/.test(cleaned) }
}

export function amountMatches(value: number | null | undefined, query: AmountQuery): boolean {
  if (value == null) return false
  // Compared in centavos: 0.1 + 0.2 style float error must not make ₱3,776.00 miss.
  const cents = Math.round(value * 100)
  const wanted = Math.round(query.amount * 100)
  return query.wholePeso ? cents >= wanted && cents < wanted + 100 : cents === wanted
}

/** What was typed, ready to match — or null for an empty / cleared box. */
export function parseSearch(raw: string | null | undefined): SearchQuery | null {
  const text = (raw ?? '').trim().toLowerCase()
  if (!text) return null
  // A lone "₱" (typed as "₱ 3,776") is not a word to find.
  const terms = text.split(/\s+/).filter((term) => term !== '₱')
  return { terms, termAmounts: terms.map(parseAmountQuery), amount: parseAmountQuery(text) }
}

/**
 * A row's searchable text: every field joined, lower-cased. Blank fields are
 * skipped. Numbers are included as typed digits (so an id or quantity can be
 * found), not formatted.
 */
export function searchText(fields: readonly unknown[]): string {
  let out = ''
  for (const field of fields) {
    if (field == null || field === '') continue
    out += `${String(field).toLowerCase()}\n`
  }
  return out
}

/** Whether a row (its searchText and its amounts) matches the query. */
export function matchesSearch(
  text: string,
  amounts: readonly (number | null | undefined)[],
  query: SearchQuery,
): boolean {
  if (query.amount && amounts.some((value) => amountMatches(value, query.amount as AmountQuery))) return true
  return query.terms.every((term, i) => {
    if (text.includes(term)) return true
    const amount = query.termAmounts[i]
    return !!amount && amounts.some((value) => amountMatches(value, amount))
  })
}
