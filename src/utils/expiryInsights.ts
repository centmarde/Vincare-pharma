import type { ExpiryItem, ExpiryMonthReport } from '@/stores/expiryReportData'
import { formatCurrency } from '@/utils/helpers'

/**
 * EXPIRY REPORT FINDINGS — deterministic rules, not generated prose.
 *
 * Every finding below is computed from the month's own figures. A rule that
 * does not apply produces nothing, so the report never pads itself with
 * filler that happens not to be true this month.
 *
 * Deliberately pure and Vue-free: the same functions feed the on-screen panel
 * and the printed report, so the two can never disagree about what the data
 * says. Numbers are formatted here from the report's own values — no figure in
 * a finding is ever typed by hand.
 */

export type FindingSeverity = 'critical' | 'warning' | 'info'

export type Finding = {
  id: string
  severity: FindingSeverity
  title: string
  body: string
}

export type Recommendation = {
  id: string
  /** Peso value the action addresses; null for advice with no figure attached. */
  value: number | null
  text: string
}

/**
 * Items whose share of total value crosses this get their own concentration
 * finding. 0.75 rather than a looser 0.6 on purpose: at 0.6 the October set
 * stops at two lines (65%) and the finding reads thinner than the data
 * warrants, where 0.75 reaches the natural three-line grouping (78%).
 */
export const concentrationThreshold = 0.75
/** How many top items the concentration finding counts toward that threshold. */
export const concentrationMaxItems = 5
/** A tail this cheap, in total, is called out as not worth management time. */
export const tailValueCeiling = 5000
/** At or above this share of one expiry date, dates look bulk-applied rather than per batch. */
export const uniformDateThreshold = 0.9

/**
 * Dosage forms that cannot be injectables. Used only to flag a likely
 * mis-filed `category`; it never reclassifies the item, because the report
 * states what the system holds and lets a human correct the master.
 */
const nonInjectableForms = [
  'SUPP',
  'DROPS',
  'TAB',
  'CAP',
  'SYR',
  'SYRUP',
  'OINT',
  'CREAM',
  'LOZENGE',
  'SACHET',
  'NEB',
]

const injectableCategory = 'injectibles'

export type CategoryRow = {
  category: string
  items: number
  value: number
  share: number
}

/** Value by `products.category` — the catalogue's own classification, not a derived one. */
export function categoryBreakdown(items: ExpiryItem[]): CategoryRow[] {
  const totals = new Map<string, { items: number; value: number }>()
  for (const item of items) {
    const key = item.category || '(uncategorised)'
    const row = totals.get(key) ?? { items: 0, value: 0 }
    row.items += 1
    row.value += item.value
    totals.set(key, row)
  }
  const grandTotal = items.reduce((sum, i) => sum + i.value, 0)
  return [...totals.entries()]
    .map(([category, row]) => ({
      category,
      items: row.items,
      value: row.value,
      share: grandTotal > 0 ? row.value / grandTotal : 0,
    }))
    .sort((a, b) => b.value - a.value)
}

/** Items whose name says one dosage form while `category` says injectable. */
export function miscategorisedItems(items: ExpiryItem[]): ExpiryItem[] {
  return items.filter((item) => {
    if ((item.category || '').toLowerCase() !== injectableCategory) return false
    const name = item.product_name.toUpperCase()
    return nonInjectableForms.some((form) => name.includes(form))
  })
}

export function sutureItems(items: ExpiryItem[]): ExpiryItem[] {
  return items.filter((item) => item.product_name.toUpperCase().includes('SUTURE'))
}

function sumValue(items: ExpiryItem[]): number {
  return items.reduce((sum, i) => sum + i.value, 0)
}

/**
 * The smallest set of top items that together clear `concentrationThreshold`,
 * capped at `concentrationMaxItems`. Returns null when value is spread evenly
 * enough that no such set exists — in which case there is no concentration to
 * report and the rule stays silent.
 */
function topConcentration(
  items: ExpiryItem[],
  totalValue: number,
): { count: number; value: number; share: number } | null {
  if (!items.length || totalValue <= 0) return null
  let running = 0
  for (let i = 0; i < Math.min(items.length, concentrationMaxItems); i++) {
    running += items[i].value
    const share = running / totalValue
    if (share >= concentrationThreshold) {
      return { count: i + 1, value: running, share }
    }
  }
  return null
}

/** How many days from `today` until the month's stock expires (negative = already past). */
export function daysUntil(dateStr: string, today: Date): number {
  const target = new Date(`${dateStr}T00:00:00`)
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target.getTime() - base.getTime()) / 86400000)
}

/**
 * Findings for one month's report.
 * @param report the month's figures
 * @param today  injected rather than read from the clock, so a report renders
 *               identically on screen and in the PDF produced moments later,
 *               and so the rules are testable at a fixed date
 * @param missingExpiryCount catalogue rows carrying no expiry date at all
 */
export function buildFindings(
  report: ExpiryMonthReport,
  today: Date,
  missingExpiryCount: number,
): Finding[] {
  const findings: Finding[] = []
  const { items, totalValue } = report
  if (!items.length) return findings

  // ── Concentration ────────────────────────────────────────────────
  const concentration = topConcentration(items, totalValue)
  if (concentration) {
    const names = items
      .slice(0, concentration.count)
      .map((i) => i.product_name)
      .join(', ')
    findings.push({
      id: 'concentration',
      severity: 'info',
      title: `${concentration.count} item${concentration.count === 1 ? '' : 's'} carry ${(concentration.share * 100).toFixed(0)}% of the value`,
      body:
        `${formatCurrency(concentration.value)} of the ${formatCurrency(totalValue)} total sits in ` +
        `${concentration.count === 1 ? 'a single line' : `${concentration.count} lines`} — ${names}. ` +
        `Recovery effort concentrated there addresses most of the exposure.`,
    })
  }

  // ── Uniform expiry dates — the data-quality flag ─────────────────
  const dateCounts = new Map<string, number>()
  for (const item of items) {
    dateCounts.set(item.expiry_date, (dateCounts.get(item.expiry_date) ?? 0) + 1)
  }
  const [topDate, topDateCount] = [...dateCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (items.length > 1 && topDateCount / items.length >= uniformDateThreshold) {
    const allSame = topDateCount === items.length
    findings.push({
      id: 'uniform-expiry-dates',
      severity: 'warning',
      title: 'Expiry dates look bulk-applied, not captured per batch',
      body:
        `${allSame ? 'All' : `${topDateCount} of ${items.length}`} item${topDateCount === 1 ? '' : 's'} ` +
        `carry an identical expiry date of ${topDate}, with no spread across the month. ` +
        `That pattern suggests the dates were set during a data import rather than read off the cartons. ` +
        `Verify physical batch dates before any write-off or disposal decision — if the dates are wrong, ` +
        `the true exposure could be materially higher or lower than ${formatCurrency(totalValue)}.`,
    })
  }

  // ── Mis-filed category ───────────────────────────────────────────
  const miscategorised = miscategorisedItems(items)
  if (miscategorised.length) {
    findings.push({
      id: 'miscategorised',
      severity: 'warning',
      title: `${miscategorised.length} item${miscategorised.length === 1 ? '' : 's'} filed under the wrong category`,
      body:
        `${miscategorised.map((i) => i.product_name).join(', ')} ` +
        `${miscategorised.length === 1 ? 'is' : 'are'} recorded as "${injectableCategory}" in the product master, ` +
        `but the product name gives a dosage form that cannot be injected. ` +
        `The category breakdown below reports the master as it stands, so those values sit under ` +
        `"${injectableCategory}". Worth correcting at source.`,
    })
  }

  // ── Coverage caveat ──────────────────────────────────────────────
  if (missingExpiryCount > 0) {
    findings.push({
      id: 'missing-expiry-dates',
      severity: 'info',
      title: `${missingExpiryCount} catalogue item${missingExpiryCount === 1 ? '' : 's'} carry no expiry date`,
      body:
        `These cannot appear in any month's exposure because the system does not know when they expire. ` +
        `The totals here cover only products with a recorded expiry date.`,
    })
  }

  // ── Branch position ──────────────────────────────────────────────
  if (report.branchHoldings == null) {
    findings.push({
      id: 'branch-unknown',
      severity: 'warning',
      title: 'Branch stock position could not be read',
      body:
        `Figures cover main warehouse stock only. The branch holding for these products is unknown — ` +
        `the read failed rather than returning nothing, so do not treat branches as clear.`,
    })
  } else if (report.branchHoldings.length === 0) {
    findings.push({
      id: 'branch-clear',
      severity: 'info',
      title: 'No branch holds any of this stock',
      body: `Branch inventory was checked and holds none of these products. The exposure is entirely at the main warehouse.`,
    })
  } else {
    const detail = report.branchHoldings
      .map((b) => `${b.locationName} (${b.units.toLocaleString()} units)`)
      .join(', ')
    findings.push({
      id: 'branch-holding',
      severity: 'warning',
      title: 'Branches also hold this stock',
      body: `${detail} hold units of these products, on top of the main warehouse figures above.`,
    })
  }

  // ── Already past ─────────────────────────────────────────────────
  const days = daysUntil(topDate, today)
  if (days < 0) {
    findings.push({
      id: 'already-expired',
      severity: 'critical',
      title: 'This stock has already expired',
      body:
        `The expiry date passed ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago. ` +
        `There is no disposal or write-off flow in the system today, so ${formatCurrency(totalValue)} ` +
        `remains on the books at full value and remains sellable in every channel.`,
    })
  }

  return findings
}

/**
 * Actions for one month, ranked by the value each addresses so the largest
 * exposure reads first. Same rule as the findings: an action only appears when
 * the data supports it.
 */
export function buildRecommendations(report: ExpiryMonthReport, today: Date): Recommendation[] {
  const recommendations: Recommendation[] = []
  const { items, totalValue } = report
  if (!items.length) return recommendations

  const concentration = topConcentration(items, totalValue)
  const days = items.length ? daysUntil(items[0].expiry_date, today) : 0

  // Verify the dates first — every other action depends on them being right.
  if (concentration) {
    recommendations.push({
      id: 'verify-batches',
      value: concentration.value,
      text:
        `Verify physical batch dates on the top ${concentration.count} SKU${concentration.count === 1 ? '' : 's'} first — ` +
        `${formatCurrency(concentration.value)} of the total. An afternoon in the warehouse settles whether this is a ` +
        `real ${formatCurrency(totalValue)} problem or a data artefact.`,
    })
  }

  // Fast-moving hospital lines are worth an active recovery push.
  const injectables = items.filter(
    (i) => (i.category || '').toLowerCase() === injectableCategory && !miscategorisedItems([i]).length,
  )
  if (injectables.length) {
    const value = sumValue(injectables)
    recommendations.push({
      id: 'hospital-accounts',
      value,
      text:
        `Approach hospital accounts on the injectables — ${injectables.length} line${injectables.length === 1 ? '' : 's'} ` +
        `worth ${formatCurrency(value)}. These are fast-moving lines, so a short-dated discount offer may recover most of it` +
        `${days > 0 ? ` within the ${days} day${days === 1 ? '' : 's'} remaining` : ''}.`,
    })
  }

  // Surgical consumables commonly carry return or replacement terms.
  const sutures = sutureItems(items)
  if (sutures.length) {
    const value = sumValue(sutures)
    recommendations.push({
      id: 'supplier-returns',
      value,
      text:
        `Check supplier return terms on the sutures — ${sutures.length} line${sutures.length === 1 ? '' : 's'} ` +
        `worth ${formatCurrency(value)}. Surgical consumables often carry return or replacement provisions on short-dated stock.`,
    })
  }

  // The tail, so attention goes where the money is.
  const tail: ExpiryItem[] = []
  for (let i = items.length - 1; i >= 0; i--) {
    const candidate = [...tail, items[i]]
    if (sumValue(candidate) > tailValueCeiling) break
    tail.unshift(items[i])
  }
  if (tail.length > 1) {
    recommendations.push({
      id: 'deprioritise-tail',
      value: sumValue(tail),
      text:
        `Deprioritise the tail — the bottom ${tail.length} SKUs total ${formatCurrency(sumValue(tail))} ` +
        `between them. Not worth management time relative to the lines above.`,
    })
  }

  recommendations.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

  // Fixed closing item: process advice, not a finding from this month's data.
  recommendations.push({
    id: 'standing-review',
    value: null,
    text:
      `Establish a standing 90-day expiry review so stock surfaces with a quarter's notice ` +
      `rather than weeks before the date.`,
  })

  return recommendations
}
