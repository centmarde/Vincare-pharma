/**
 * Date formatting utilities consolidated from generativeHelpers.ts and helpers.ts.
 * All date-related formatters live here so stores and components share a single
 * source of truth.
 */

// ─── General date formatter ─────────────────────────────────────────────────

/**
 * Formats a date string into a human-readable format
 * @param dateString - The date string to format
 * @returns A formatted date string or 'N/A' if no date provided
 */
export function formatDate(dateString: string | undefined): string {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Short date formatter (e.g. "May-01-2023/04:42pm") ─────────────────────

/**
 * Formats a date into a short format: "Mon-DD-YYYY/hh:mma" (e.g. "May-01-2023/04:42pm").
 * Uses Asia/Manila timezone.
 * pwede nimo ni gamiton as date formatter sa ubang parts sa system. piro and main formatter is ang
 * formatDatePR_ISO nga function piro, ang formatDatePR_ISO na ang ginagamit sa system app.
 */
export const formatDateShort = (dateString: string | null | undefined): string => {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''

  const datePart = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(date)

  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  }).format(date)

  // Intl returns "AM"/"PM" — lowercase it and remove the space before the period
  const [time, ampm] = timePart.split(' ')
  return `${datePart.replace(/,/g, '')}/${time}${ampm.toLowerCase()}`
}

// ─── PR/PO list date formatters ─────────────────────────────────────────────

/**
 * Formats a date for PR/PO list display.
 * Delegates to formatDateShort for the "May-01-2023/04:42pm" format.
 * ge re-use and formatDateShort para dile nata mag rewire sa obang date formatters na ge gamit na sa system.
 */
export const formatDatePR_ISO = (dateString: string | null | undefined): string => {
  return formatDateShort(dateString)
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

export function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// new Date('2026-09-01') reads as UTC midnight and lands a day early west of Greenwich.
export function fromLocalISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null
  return date}

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

// Date -> "Month, YYYY" (e.g. "March, 2024").
export const formatMonthYear = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value)

  if (isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/**
 * Returns the last calendar day of a month as a local ISO date string (YYYY-MM-DD)
 * Last calendar day of a month as a local "YYYY-MM-DD".
 * Built from local Y/M/D parts on purpose: toISOString() converts to UTC first,
 * which at UTC+8 rolls the date back a day (Jan 31 -> "2026-01-30") and at
 * negative offsets rolls it into the next month.
 * @param year - The year
 * @param monthIndex - The month index (0-11, where 0 is January)
 * @returns ISO date string for the last day of the month
 */
export const endOfMonthISODate = (year: number, monthIndex: number): string => {
  const lastDay = new Date(year, monthIndex + 1, 0)
  const month = String(lastDay.getMonth() + 1).padStart(2, '0')
  const day = String(lastDay.getDate()).padStart(2, '0')
  return `${lastDay.getFullYear()}-${month}-${day}`
}

// Live input mask: keep digits only, auto-insert the slash -> "MM/YYYY" (capped).
export const maskMonthYearInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 6)
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`
}
