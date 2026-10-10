// Pure helpers for the glData store: account-code allocation, statement month
// boundaries and the journal-entry row mapper. No Supabase and no state.

import { maxStatementColumns } from './types'
import type { AccountCategory, GLAccount, JournalEntry } from './types'

// Numeric max within the category's range, +10 — never lexical (same bug class
// documented elsewhere in this file's doc-number helpers: codes are zero-width
// strings, so string sort would break once a range needs a 5th digit).
export function nextAccountCode(category: AccountCategory, existing: GLAccount[]): number {
  const codesInRange = existing
    .map((a) => parseInt(a.code, 10))
    .filter((n) => !isNaN(n) && n >= category.floor && n <= category.ceiling)
  const max = codesInRange.length ? Math.max(...codesInRange) : category.floor
  return codesInRange.length ? max + 10 : category.floor + 10
}

/**
 * Month boundaries as STRINGS, never JS Date month arithmetic — `new Date()`
 * parses an ISO date as UTC and renders it local, so in Asia/Manila a
 * month-start can come back as the previous month. Same reason the GL's other
 * period helpers are string-based.
 */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))]
  const endY = Number(to.slice(0, 4))
  const endM = Number(to.slice(5, 7))
  while ((y < endY || (y === endY && m <= endM)) && out.length < maxStatementColumns) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

/** First and last day of a 'YYYY-MM', clamped to the requested range so the
 *  first and last columns cover only the days actually asked for. */
export function monthBounds(month: string, from: string, to: string): { start: string; end: string } {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const start = `${month}-01`
  const end = `${month}-${String(lastDay).padStart(2, '0')}`
  return { start: start < from ? from : start, end: end > to ? to : end }
}

export function mapEntryRow(row: any): JournalEntry {
  return {
    id: row.id,
    entry_no: row.entry_no,
    entry_date: row.entry_date,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    description: row.description,
    status: row.status,
    reverses_entry: row.reverses_entry,
    posted_at: row.posted_at,
    posted_by: row.posted_by,
    created_by: row.created_by,
    created_at: row.created_at,
    lines: (row.journal_entry_lines ?? []).map((l: any) => ({
      id: l.id,
      account_code: l.account_code,
      account_name: l.account?.name ?? null,
      debit: l.debit,
      credit: l.credit,
      line_memo: l.line_memo,
    })),
  }
}
