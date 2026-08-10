import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/utils/helpers'

// ─────────────────────────────────────────────────────────────────────────────
// `discounts` — the commercial terms agreed with a customer, ONE ROW PER
// COMPONENT of the deal. It is the machine-readable decomposition of the
// narrative kept in `customers.receipt_details`:
//
//   "NILDA TOMPONG | 25% + 5% ADDS"  ->  discount 25%  +  adds 5%   (total 30%)
//
// This table is the SOURCE OF TRUTH for rates. The numeric columns on
// `customers` (discount_rate / rebate_rate / markup_percent) are the older
// single-value model, are empty across the whole live file, and are only used
// as a fallback when a customer has no rows here — see buildDiscountProfile.
//
// ⚠️ IT IS NOT UNIFORMLY TRUSTWORTHY. 126 of the 1,142 customers with rows do
// not reconcile (~1 in 9). In absolute terms most are drugstores (97), but
// government accounts fail at roughly three times the rate — 20 of 81 — because
// their deals are multi-party and the parse kept only part of the split:
//
//   MADRID DISTRICT HOSPITAL
//     narrative : 5 recipients — 5 + 3 + 2 + 10 + 5 = 25%
//     discounts : ONE row, 5%            <- four recipients dropped
//   BISLIG DISTRICT HOSPITAL
//     narrative : 5 + 3 + 5 + 10 + 5 = 28%
//     discounts : 28% and 5%             <- the TOTAL stored as a component
//
// Pricing off those would misstate government invoices in both directions, so
// `reconciles` gates every consumer: when it is false the caller must NOT
// compute money from the profile, and should show the narrative instead so
// staff enter the figure deliberately.
//
// Recipient names are NOT captured here (`description` is empty on every row,
// `name` holds the customer). If a rebate ever has to be paid to a named
// person, that only exists in the narrative text.
// ─────────────────────────────────────────────────────────────────────────────

export type DiscountType = {
  id: number
  created_at: string
  name: string | null
  description: string | null
  customer_id: number | null
  discount_rate: number | null
  discount_name: string | null
  total_rebate_offered: string | null
}

/**
 * What a component actually is, once the free text is normalised.
 *
 * `discount_name` is hand-entered and carries 15 spellings for ~6 concepts
 * ('ads'/'adds'/'ads promo', 'discount'/'dicount', 'rebate'/'rebates', …), so
 * nothing may switch on the raw string.
 */
export type DiscountKind = 'discount' | 'ads' | 'rebate' | 'markup' | 'other'

const KIND_BY_NAME: Record<string, DiscountKind> = {
  'discount': 'discount',
  'dicount': 'discount',       // observed misspelling
  'ads': 'ads',
  'adds': 'ads',               // observed misspelling
  'ads promo': 'ads',
  'rebate': 'rebate',
  'rebates': 'rebate',
  'mark up': 'markup',
  'markup': 'markup',
  'plus': 'markup',
}

/**
 * Values deliberately NOT mapped, and therefore treated as 'other' — which
 * blocks the profile from reconciling so the customer is flagged rather than
 * silently mispriced:
 *   'dicount and ads'  two components crammed into one row, unsplittable
 *   'tie up' / 'cash advance' / 'ca' / 'up to' / 'others'
 *      arrangements that are not a straight percentage off the invoice
 */
export function normalizeDiscountKind(name: string | null | undefined): DiscountKind {
  if (!name) return 'other'
  return KIND_BY_NAME[name.trim().toLowerCase()] ?? 'other'
}

export type DiscountProfile = {
  discountRate: number          // reduces what the customer owes
  adsRate: number               // in-kind marketing give — posts to 6010, not 6030
  rebateRate: number            // cash rebate — accrued separately, posts to 6030
  markupPercent: number | null
  /** The headline figure the business states for the deal, when there is one. */
  totalOffered: number | null
  /** Sum of the priced components (discount + ads + rebate). */
  componentsSum: number
  /** True when the parts add up and every component is a recognised kind. */
  reconciles: boolean
  /** Why it doesn't reconcile, for display. Null when it does. */
  mismatchReason: string | null
  rows: DiscountType[]
}

export const EMPTY_DISCOUNT_PROFILE: DiscountProfile = {
  discountRate: 0, adsRate: 0, rebateRate: 0, markupPercent: null,
  totalOffered: null, componentsSum: 0, reconciles: true, mismatchReason: null, rows: [],
}

function parsePercent(value: string | null): number | null {
  if (!value) return null
  const n = parseFloat(String(value).replace('%', '').trim())
  return Number.isFinite(n) ? n : null
}

/**
 * Fold a customer's component rows into the rates an order prices from.
 *
 * A profile that does not reconcile still returns its rates (so they can be
 * DISPLAYED alongside the mismatch) — callers must check `reconciles` before
 * using them for money.
 */
export function buildDiscountProfile(rows: DiscountType[]): DiscountProfile {
  if (!rows.length) return { ...EMPTY_DISCOUNT_PROFILE }

  let discountRate = 0, adsRate = 0, rebateRate = 0
  let markupPercent: number | null = null
  let unknownCount = 0

  for (const r of rows) {
    const rate = Number(r.discount_rate ?? 0)
    switch (normalizeDiscountKind(r.discount_name)) {
      case 'discount': discountRate += rate; break
      case 'ads':      adsRate += rate; break
      case 'rebate':   rebateRate += rate; break
      case 'markup':   markupPercent = (markupPercent ?? 0) + rate; break
      default:         unknownCount++; break
    }
  }

  const componentsSum = discountRate + adsRate + rebateRate
  const totalOffered = parsePercent(rows[0]?.total_rebate_offered ?? null)

  let mismatchReason: string | null = null
  if (unknownCount > 0) {
    mismatchReason = `${unknownCount} component${unknownCount === 1 ? '' : 's'} of an unrecognised type`
  } else if (totalOffered != null && Math.abs(componentsSum - totalOffered) > 0.01) {
    mismatchReason = `components total ${componentsSum}% but the agreed total is ${totalOffered}%`
  }

  return {
    discountRate, adsRate, rebateRate, markupPercent,
    totalOffered, componentsSum,
    reconciles: mismatchReason === null,
    mismatchReason,
    rows,
  }
}

export const useDiscountsDataStore = defineStore('discountsData', () => {
  const loading = ref(false)
  const error: Ref<string> = ref('')

  async function fetchForCustomer(customerId: number): Promise<DiscountType[]> {
    loading.value = true
    error.value = ''
    try {
      const { data, error: fetchError } = await supabase
        .from('discounts')
        .select('id, created_at, name, description, customer_id, discount_rate, discount_name, total_rebate_offered')
        .eq('customer_id', customerId)
        .order('id', { ascending: true })
      if (fetchError) throw fetchError
      return (data || []) as DiscountType[]
    } catch (err) {
      error.value = getErrorMessage(err)
      console.error('fetchForCustomer (discounts) failed:', err)
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchProfile(customerId: number): Promise<DiscountProfile> {
    return buildDiscountProfile(await fetchForCustomer(customerId))
  }

  return { loading, error, fetchForCustomer, fetchProfile }
})
