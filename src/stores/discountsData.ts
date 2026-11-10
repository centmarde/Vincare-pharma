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

// ─── Editing a customer's terms ─────────────────────────────────────────────
// The customer profile edits THESE rows, so what staff enter is what an order
// prices from. Before this the profile's single discount/rebate/markup fields
// were only read when a customer had no rows here — and most do, from the
// import — so edits made on the profile were silently ignored at order time.
//
// Each person sharing a rebate (or an ads give) is their own row, the person's
// name in `description` — the column the import left empty. The agreed total is
// written as the sum of the parts, so a profile saved here always reconciles.

/** One person sharing a rebate or an ads give, and their share in % of sales. */
export type TermsRecipient = { name: string; rate: number | null }

/** An imported component the app cannot price (tie-up, cash advance, …). */
export type OtherTerm = { label: string | null; name: string | null; rate: number | null }

export type CustomerTerms = {
  markupPercent: number | null
  discountRate: number | null
  rebates: TermsRecipient[]
  ads: TermsRecipient[]
  /**
   * Kept exactly as imported unless staff remove them. While any remain the
   * profile does not reconcile, so orders do not price from it.
   */
  others: OtherTerm[]
}

export const emptyCustomerTerms = (): CustomerTerms =>
  ({ markupPercent: null, discountRate: null, rebates: [], ads: [], others: [] })

const round2 = (n: number) => Math.round(n * 100) / 100

/** The older single-value columns, used when a customer has no rows yet. */
export type LegacyTermsColumns = {
  markup_percent?: number | null
  discount_rate?: number | null
  rebate_rate?: number | null
}

/** A customer's rows (or, with none, their legacy columns) as editable terms. */
export function termsFromRows(rows: DiscountType[], legacy?: LegacyTermsColumns | null): CustomerTerms {
  const terms = emptyCustomerTerms()
  if (!rows.length) {
    terms.markupPercent = legacy?.markup_percent ?? null
    terms.discountRate = legacy?.discount_rate ?? null
    if (legacy?.rebate_rate) terms.rebates.push({ name: '', rate: legacy.rebate_rate })
    return terms
  }
  for (const row of rows) {
    const rate = row.discount_rate == null ? null : Number(row.discount_rate)
    const name = row.description?.trim() ?? ''
    switch (normalizeDiscountKind(row.discount_name)) {
      case 'markup': terms.markupPercent = round2((terms.markupPercent ?? 0) + (rate ?? 0)); break
      case 'discount': terms.discountRate = round2((terms.discountRate ?? 0) + (rate ?? 0)); break
      case 'rebate': terms.rebates.push({ name, rate }); break
      case 'ads': terms.ads.push({ name, rate }); break
      default: terms.others.push({ label: row.discount_name, name: row.description, rate }); break
    }
  }
  return terms
}

/** People with a share but no name — the profile cannot be saved until named. */
const unnamed = (list: TermsRecipient[]) => list.filter((r) => Number(r.rate) > 0 && !r.name.trim()).length

/** What a set of terms adds up to, for the editor and for saving. */
export function summarizeTerms(terms: CustomerTerms) {
  const sum = (list: TermsRecipient[]) => round2(list.reduce((s, r) => s + (Number(r.rate) || 0), 0))
  const rebateTotal = sum(terms.rebates)
  const adsTotal = sum(terms.ads)
  const discount = Number(terms.discountRate) || 0
  const giveaway = round2(discount + rebateTotal + adsTotal)
  const markup = terms.markupPercent == null || (terms.markupPercent as unknown) === '' ? null : Number(terms.markupPercent)
  // Allowed — a loss can be a deliberate marketing call — but said plainly.
  const exceedsMarkup = giveaway > 0 && (markup == null || giveaway > markup)
  const shares = (list: TermsRecipient[]) => list
    .filter((r) => Number(r.rate) > 0)
    .map((r) => `${r.name.trim() || 'Unnamed'} ${Number(r.rate)}%`)
  return {
    rebateTotal, adsTotal, discount, giveaway, markup, exceedsMarkup,
    missingNames: unnamed(terms.rebates) + unnamed(terms.ads),
    /** "Juan 5% / Maria 5%" — kept on customers.rebate_ratio_distribution for older readers. */
    distribution: shares(terms.rebates).join(' / ') || null,
  }
}

/** Whether two sets of terms differ in anything that would be saved. */
export function termsDiffer(a: CustomerTerms, b: CustomerTerms): boolean {
  const norm = (t: CustomerTerms) => JSON.stringify({
    m: t.markupPercent ?? null,
    d: Number(t.discountRate) || 0,
    r: t.rebates.filter((x) => Number(x.rate) > 0).map((x) => [x.name.trim(), Number(x.rate)]),
    a: t.ads.filter((x) => Number(x.rate) > 0).map((x) => [x.name.trim(), Number(x.rate)]),
    o: t.others.map((x) => [x.label, x.name, x.rate]),
  })
  return norm(a) !== norm(b)
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

  /**
   * Every customer's profile, keyed by customer_id — for LIST views that need a
   * rate against each row.
   *
   * Loads the whole table (~1.9k rows, two paged requests) once per session
   * rather than issuing a request per row or stuffing 1000 ids into an
   * `in.(…)` filter, which would blow the URL length. Cached: repeat calls are
   * a no-op unless `force` is set.
   */
  const profilesByCustomer: Ref<Map<number, DiscountProfile>> = ref(new Map())
  const profilesLoaded = ref(false)

  async function ensureProfilesLoaded(force = false) {
    if (profilesLoaded.value && !force) return profilesByCustomer.value
    loading.value = true
    error.value = ''
    try {
      const rows: DiscountType[] = []
      // PostgREST caps a response at 1000 rows; page until short.
      for (let from = 0; ; from += 1000) {
        const { data, error: fetchError } = await supabase
          .from('discounts')
          .select('id, created_at, name, description, customer_id, discount_rate, discount_name, total_rebate_offered')
          .order('id', { ascending: true })
          .range(from, from + 999)
        if (fetchError) throw fetchError
        const page = (data || []) as DiscountType[]
        rows.push(...page)
        if (page.length < 1000) break
      }

      const byCustomer = new Map<number, DiscountType[]>()
      for (const r of rows) {
        if (r.customer_id == null) continue
        const list = byCustomer.get(r.customer_id) ?? []
        list.push(r)
        byCustomer.set(r.customer_id, list)
      }
      const built = new Map<number, DiscountProfile>()
      for (const [cid, list] of byCustomer) built.set(cid, buildDiscountProfile(list))
      profilesByCustomer.value = built
      profilesLoaded.value = true
      return built
    } catch (err) {
      error.value = getErrorMessage(err)
      console.error('ensureProfilesLoaded (discounts) failed:', err)
      return profilesByCustomer.value
    } finally {
      loading.value = false
    }
  }

  function profileFor(customerId: number | null | undefined): DiscountProfile | null {
    if (customerId == null) return null
    return profilesByCustomer.value.get(customerId) ?? null
  }

  /**
   * Replace a customer's terms with what the profile editor holds.
   *
   * The new rows are written FIRST and the old ones removed after, so a
   * failure part-way never leaves the customer with no terms: at worst the
   * insert fails and the old terms stand. If removing the old rows fails, the
   * new ones are taken back out — two sets at once would double every rate.
   * Not atomic (JS-over-RPC convention), and said so here.
   */
  async function saveCustomerTerms(customerId: number, customerName: string | null, terms: CustomerTerms) {
    error.value = ''
    const summary = summarizeTerms(terms)
    if (summary.missingNames) {
      return { success: false as const, error: 'Enter the name of every person getting a rebate or ads share.' }
    }
    // The agreed total is the sum of what is priced, so the profile reconciles.
    const totalOffered = summary.giveaway > 0 ? `${summary.giveaway}%` : null
    const base = { customer_id: customerId, name: customerName, total_rebate_offered: totalOffered }
    const rows: Record<string, unknown>[] = []
    if (summary.markup != null) rows.push({ ...base, discount_name: 'markup', description: null, discount_rate: summary.markup })
    if (summary.discount > 0) rows.push({ ...base, discount_name: 'discount', description: null, discount_rate: summary.discount })
    for (const r of terms.rebates) {
      if (Number(r.rate) > 0) rows.push({ ...base, discount_name: 'rebate', description: r.name.trim(), discount_rate: Number(r.rate) })
    }
    for (const r of terms.ads) {
      if (Number(r.rate) > 0) rows.push({ ...base, discount_name: 'ads', description: r.name.trim(), discount_rate: Number(r.rate) })
    }
    for (const o of terms.others) {
      rows.push({ ...base, discount_name: o.label, description: o.name, discount_rate: o.rate })
    }

    try {
      const { data: before, error: readError } = await supabase
        .from('discounts').select('id').eq('customer_id', customerId)
      if (readError) throw readError
      const oldIds = (before ?? []).map((r: { id: number }) => r.id)

      let newIds: number[] = []
      if (rows.length) {
        const { data: inserted, error: insertError } = await supabase.from('discounts').insert(rows).select('id')
        if (insertError) throw insertError
        newIds = (inserted ?? []).map((r: { id: number }) => r.id)
      }
      if (oldIds.length) {
        const { error: deleteError } = await supabase.from('discounts').delete().in('id', oldIds)
        if (deleteError) {
          if (newIds.length) await supabase.from('discounts').delete().in('id', newIds)
          throw deleteError
        }
      }

      // Refresh this customer's cached profile so lists and orders see it now.
      const fresh = await fetchForCustomer(customerId)
      const next = new Map(profilesByCustomer.value)
      next.set(customerId, buildDiscountProfile(fresh))
      profilesByCustomer.value = next
      return { success: true as const }
    } catch (err) {
      error.value = getErrorMessage(err)
      console.error('saveCustomerTerms failed:', err)
      return { success: false as const, error: error.value || 'Could not save the terms.' }
    }
  }

  return {
    loading, error,
    fetchForCustomer, fetchProfile,
    profilesByCustomer, ensureProfilesLoaded, profileFor,
    saveCustomerTerms,
  }
})
