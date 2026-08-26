import type { SupplierOfferType } from '@/stores/supplierOffersData'

export type QualifiedOffer = SupplierOfferType & { months_to_expiry: number }
export const QUALIFICATION_MONTHS = 18

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function minQualifyingExpiry(requiredByDate: string): Date {
  return addMonths(new Date(requiredByDate), QUALIFICATION_MONTHS)
}

// supplier expiry >= required-by + 18mo; recommendation = cheapest qualifying.
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