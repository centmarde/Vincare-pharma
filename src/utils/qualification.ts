import type { SupplierOfferType } from '@/stores/supplierOffersData'
import { toLocalISODate } from '@/utils/dateFormats'

export type QualifiedOffer = SupplierOfferType & { months_to_expiry: number }
export const QUALIFICATION_MONTHS = 18

/**
 * Adds a number of months to a given date
 * @param date - The starting date
 * @param months - Number of months to add
 * @returns New date with months added
 */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

/**
 * Calculates the minimum expiry date for a supplier offer to qualify
 * @param requiredByDate - The required-by date for the order
 * @returns Minimum expiry date (required-by + 18 months)
 */
export function minQualifyingExpiry(requiredByDate: string): Date {
  return addMonths(new Date(requiredByDate), QUALIFICATION_MONTHS)
}

/**
 * Qualifies supplier offers based on expiry date requirements and recommends the cheapest
 * supplier expiry >= required-by + 18mo; recommendation = cheapest qualifying.
 * @param offers - Array of supplier offers to evaluate
 * @param requiredByDate - The required-by date for the order
 * @returns Object with qualified, disqualified, and recommended offers
 */
export function qualifyOffers(offers: SupplierOfferType[], requiredByDate: string) {
  const minExpiry = minQualifyingExpiry(requiredByDate)
  const qualified: QualifiedOffer[] = []
  const disqualified: QualifiedOffer[] = []
  for (const o of offers) {
    const monthsToExpiry = o.expiry_date
      ? Math.round((new Date(o.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44))
      : 0
    const entry = { ...o, months_to_expiry: monthsToExpiry }
    if (o.expiry_date && new Date(o.expiry_date) >= minExpiry) qualified.push(entry)
    else disqualified.push(entry)
  }
  qualified.sort((a, b) => a.cost_price_per_unit - b.cost_price_per_unit)
  return { qualified, disqualified, recommended: qualified[0] ?? null }
}

export type ShelfLifeCheck =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'short_dated' }

/**
 * Whether a batch may be delivered to a GOVERNMENT client.
 *
 * Government contracts reject stock carrying less than QUALIFICATION_MONTHS of
 * shelf life on the day it is delivered. That is the same 18 months Purchasing
 * buys to above, and not by coincidence: we buy at 18 months BECAUSE we have to
 * deliver at 18. Keeping both in this file is the point — one number, both ends
 * of the pipe, no second copy to drift.
 *
 * Applied to In-House, which IS the government channel by construction. It is
 * deliberately NOT keyed off customers.agency_type: that column is populated on
 * 4 of 5,278 rows, so keying off it would silently exempt nearly every customer.
 *
 * A product with NO expiry date PASSES. Many catalogue rows carry none, and
 * plenty legitimately have no expiry (scissors, trays); blocking them would stop
 * real deliveries. That is a known hole, tracked separately, not an oversight.
 *
 * @param expiryDate batch expiry as a date-only string
 * @param asOf       the delivery date to test against; defaults to today
 */
export function govtShelfLife(
  expiryDate: string | null | undefined,
  asOf = new Date(),
): ShelfLifeCheck {
  if (!expiryDate) return { ok: true }
  // Both sides of each comparison are parsed from a date-only string, so they
  // land on the same midnight and the result cannot drift with the timezone.
  const todayIso = toLocalISODate(asOf)
  const expiry = new Date(expiryDate)
  if (expiry < new Date(todayIso)) return { ok: false, reason: 'expired' }
  if (expiry < minQualifyingExpiry(todayIso)) return { ok: false, reason: 'short_dated' }
  return { ok: true }
}
