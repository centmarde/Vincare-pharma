/**
 * Generative / document-number / date-formatting helpers.
 * Consolidated here so stores and other modules share a single source
 * of truth instead of duplicating logic inline.
 */

import { supabase } from '@/lib/supabase'

// ─── Document-number sequencing ──────────────────────────────────────────────
// Document numbers are `PREFIX-YYYY-NNN` (sequence at split('-')[2]). The next
// number is (numeric max of the existing sequences for that prefix) + 1.
//
// IMPORTANT: compute the max NUMERICALLY, never by sorting the strings. Lexical
// ordering of zero-padded numbers is only correct within one pad width — once a
// yearly series crosses it, sorting breaks (e.g. "SO-2026-1000" sorts BELOW
// "SO-2026-999" because '1' < '9'), which would stall generation on a duplicate
// forever.

/** Highest sequence number across a series' existing document numbers, or 0. */
export function maxDocSeq(existing: (string | null | undefined)[]): number {
  return existing.reduce<number>((max, ref) => {
    const seq = parseInt(ref?.split('-')[2] ?? '', 10)
    return Number.isFinite(seq) && seq > max ? seq : max
  }, 0)
}

/** Next `PREFIX-NNN` document number given the existing numbers for that prefix. */
export function nextDocNumber(
  existing: (string | null | undefined)[],
  prefix: string,
  pad = 3,
): string {
  return `${prefix}${String(maxDocSeq(existing) + 1).padStart(pad, '0')}`
}

type DocType = 'PR' | 'PO' | 'SI'

const DOC_CONFIG: Record<DocType, { column: 'requisition_no' | 'po_no' | 'reference_no' }> = {
  PR: { column: 'requisition_no' },
  PO: { column: 'po_no' },
  SI: { column: 'reference_no' },
}

export async function generateDocNumber(
  type: DocType,
  getLatest: (column: 'requisition_no' | 'po_no' | 'reference_no', prefix: string) => Promise<number>
): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `${type}-${year}-`
  const last   = await getLatest(DOC_CONFIG[type].column, prefix)
  return `${prefix}${String(last + 1).padStart(3, '0')}`
}

// ─── Generic Supabase-backed number generators ──────────────────────────────

/**
 * Fetches the latest reference number from the `transactions` table matching
 * the given column and prefix.
 */
export async function getLatestReferenceNo(
  column: 'requisition_no' | 'po_no' | 'reference_no',
  prefix: string,
): Promise<number> {
  const { data } = await supabase
    .from('transactions')
    .select(column)
    .ilike(column, `${prefix}%`)
    .order(column, { ascending: false })
    .limit(1)

  const row    = (data as Record<string, string>[] | null)?.[0]
  const latest = row ? row[column] : null
  return latest ? parseInt(latest.split('-')[2], 10) : 0
}

/** Generate a Purchase Requisition number (PR-YYYY-NNN). */
export async function generatePRNumber(): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `PR-${year}-`
  const last   = await getLatestReferenceNo('requisition_no', prefix)
  return `${prefix}${String(last + 1).padStart(3, '0')}`
}

/** Generate a Purchase Order number (PO-YYYY-NNN). */
export async function generatePONumber(): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `PO-${year}-`
  const last   = await getLatestReferenceNo('po_no', prefix)
  return `${prefix}${String(last + 1).padStart(3, '0')}`
}

/** Generate a Stock-In / SI number (SI-YYYY-NNN). */
export async function generateSINumber(): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `SI-${year}-`
  const last   = await getLatestReferenceNo('reference_no', prefix)
  return `${prefix}${String(last + 1).padStart(3, '0')}`
}

/** Generate an In-House Order number (IH-YYYY-NNN). */
export async function generateIHNumber(): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `IH-${year}-`
  const last   = await getLatestReferenceNo('reference_no', prefix)
  return `${prefix}${String(last + 1).padStart(3, '0')}`
}

/** Generate a Delivery Receipt number (DR-YYYY-NNN). */
export async function generateDRNumber(): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `DR-${year}-`
  const last   = await getLatestReferenceNo('reference_no', prefix)
  return `${prefix}${String(last + 1).padStart(3, '0')}`
}

// ─── Date formatters ─────────────────────────────────────────────────────────

export const formatDatePR_ISO = (dateString: string | null | undefined) => {
  if (!dateString) return ''
  const date = new Date(dateString)

  // This is for displaying in the PR list and PO list
  const datePart = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(date)

  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  }).format(date)

  return `${datePart} ${timePart}`
}

// This is for Exporting PDF PO
export const formatDatePO_Written = (dateString: string | null | undefined) => {
  if (!dateString) return ''
  const date = new Date(dateString)

  const datePart = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)

  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)

  return `${datePart} at ${timePart}`
}

// ─── Batch-expiry helpers ────────────────────────────────────────────────────
// Batch-expiry fields only need month/year (e.g. "04/2026") — no day.

// "MM/YYYY" -> Date (first of that month), or null if not a complete valid value.
export const parseMonthYear = (value: string): Date | null => {
  const m = value.trim().match(/^(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const month = Number(m[1])
  const year = Number(m[2])
  if (month < 1 || month > 12) return null
  return new Date(year, month - 1, 1)
}

// Date -> "MM/YYYY".
export const formatMonthYear = (date: Date): string =>
  `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`

// Live input mask: keep digits only, auto-insert the slash -> "MM/YYYY" (capped).
export const maskMonthYearInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 6)
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`
}
