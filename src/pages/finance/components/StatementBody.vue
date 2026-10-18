<script setup lang="ts">
import { computed } from 'vue'
import type { StatementRow } from '../composables/useIncomeStatement'
import type { MonthlyIncomeStatement } from '@/stores/glData'
import type { CompanyProfile } from '@/utils/companyProfiles'
import { formatCurrency } from '@/utils/helpers'

/**
 * The statement body, rendered identically on screen and on paper.
 *
 * Extracted so the printed copy cannot drift from the screen. The original
 * layout kept its section totals and its summary block in two places and they
 * diverged into printing every figure twice — a print copy maintained
 * separately would reintroduce exactly that.
 *
 * `letterhead` is supplied only when printing: the on-screen view does not
 * carry a company header, but the page that leaves the building must say who
 * issued it.
 */
const props = defineProps<{
  title: string
  periodLine: string
  basisLine: string
  isMonthly: boolean
  periodRows: StatementRow[]
  monthlyRows: StatementRow[]
  monthly: MonthlyIncomeStatement | null
  monthLabel: (month: string) => string
  /** By collections: what the statement could not apply collections to. */
  collectionNote?: { manualSales: number; opening: number; unmatched: number } | null
  letterhead?: CompanyProfile | null
  /**
   * Typeset for paper rather than a screen: tighter metrics, and NO horizontal
   * scroll container. html2canvas clips at a scrolling element, so a wide month
   * table would be captured only as far as the visible box.
   */
  print?: boolean
}>()

/** By collections: what the statement could not apply collections to, in plain sentences. */
const collectionNoteText = computed(() => {
  const note = props.collectionNote
  if (!note) return ''
  const sentences: string[] = []
  if (note.manualSales) {
    sentences.push(`${formatCurrency(note.manualSales)} of sales were entered by manual journal entry `
      + '(such as the bookings carried over from the old system). The ledger has no collection data for them, so they are shown as booked.')
  }
  const parts: string[] = []
  if (note.opening) parts.push(`${formatCurrency(note.opening)} on receivables from before the system (sold and counted in the old books)`)
  if (note.unmatched) parts.push(`${formatCurrency(note.unmatched)} on orders with no sale in the ledger to match`)
  if (parts.length) sentences.push(`Also collected in this period but not counted as sales: ${parts.join('; ')}.`)
  return sentences.join(' ')
})

function amountText(row: { negate: boolean }, amount: number) {
  return row.negate ? `(${formatCurrency(amount)})` : formatCurrency(amount)
}
/** "62.3%"; a loss gets a minus, as its amount does; a dash when there are no sales. */
function ratioText(ratio: number | null | undefined) {
  if (ratio == null) return '—'
  // Rounded first, so a figure that rounds to zero never prints as "-0.0%".
  const rounded = Math.round(ratio * 10) / 10
  return `${rounded < 0 ? '-' : ''}${Math.abs(rounded).toFixed(1)}%`
}
function rowClass(row: StatementRow) {
  return `is-row is-${row.kind}${row.final ? ' is-final' : ''}`
}
</script>

<template>
  <div :class="print ? 'is-print' : ''">
    <!-- Only on the printed copy. -->
    <div v-if="letterhead" class="text-center mb-5">
      <div class="letterhead-name">{{ letterhead.name }}</div>
      <div class="letterhead-line">{{ letterhead.line1 }}</div>
      <div class="letterhead-line">{{ letterhead.line2 }}</div>
      <div v-if="letterhead.license" class="letterhead-line">{{ letterhead.license }}</div>
    </div>

      <header class="text-center mb-6">
        <div class="statement-title">{{ title }}</div>
        <div class="statement-sub">{{ periodLine }}</div>
        <div class="statement-sub">{{ basisLine }}</div>
      </header>

      <!-- ── Period ──────────────────────────────────────────── -->
      <table v-if="!isMonthly && periodRows.length" class="stmt" style="max-width: 820px; margin: 0 auto">
        <thead>
          <tr>
            <th class="stmt-label"></th>
            <th class="stmt-amount stmt-col-head">AMOUNT</th>
            <th class="stmt-amount stmt-col-head stmt-pct">% OF SALES</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in periodRows" :key="i" :class="rowClass(row)">
            <th scope="row" class="stmt-label">{{ row.label }}</th>
            <td class="stmt-amount">
              <template v-if="row.kind !== 'section'">{{ amountText(row, row.total) }}</template>
            </td>
            <td class="stmt-amount stmt-pct">
              <template v-if="row.kind !== 'section'">{{ ratioText(row.totalRatio) }}</template>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- ── Monthly ─────────────────────────────────────────── -->
      <div v-else-if="isMonthly && monthly" :class="print ? '' : 'stmt-scroll'">
        <table class="stmt stmt-wide">
          <thead>
            <tr>
              <th class="stmt-label"></th>
              <!-- Each month carries its own % of sales beside it, so a month
                   can be compared with the next: COGS 62% in Aug, 58% in Sep. -->
              <template v-for="m in monthly.months" :key="m">
                <th class="stmt-amount stmt-col-head">{{ monthLabel(m) }}</th>
                <th class="stmt-amount stmt-col-head stmt-pct">%</th>
              </template>
              <th class="stmt-amount stmt-col-head is-total-col">TOTAL</th>
              <th class="stmt-amount stmt-col-head stmt-pct is-total-pct">%</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in monthlyRows" :key="i" :class="rowClass(row)">
              <th scope="row" class="stmt-label">{{ row.label }}</th>
              <template v-if="row.kind === 'section'">
                <template v-for="(m, j) in monthly.months" :key="j">
                  <td />
                  <td />
                </template>
                <td class="is-total-col" />
                <td />
              </template>
              <template v-else>
                <template v-for="(amt, j) in row.amounts" :key="j">
                  <td class="stmt-amount">{{ amountText(row, amt) }}</td>
                  <td class="stmt-amount stmt-pct">{{ ratioText(row.ratios?.[j]) }}</td>
                </template>
                <td class="stmt-amount is-total-col">{{ amountText(row, row.total) }}</td>
                <td class="stmt-amount stmt-pct is-total-pct">{{ ratioText(row.totalRatio) }}</td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="text-center text-body-2 text-medium-emphasis py-10">
        Nothing posted to the ledger in this period.
      </div>

      <!-- On the document itself, so a printed copy says what it leaves out. -->
      <div v-if="collectionNoteText" class="collection-note mt-6">{{ collectionNoteText }}</div>
  </div>
</template>

<style scoped>
.statement-sheet {
  background: rgb(var(--v-theme-surface));
}

.statement-title {
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 0.2em;
}
.statement-sub {
  font-size: 0.8rem;
  opacity: 0.75;
}
.collection-note {
  font-size: 0.78rem;
  line-height: 1.5;
  text-align: center;
  max-width: 620px;
  margin-inline: auto;
  opacity: 0.8;
}

/* ── The statement table ────────────────────────────────────── */
.stmt {
  width: 100%;
  border-collapse: collapse;
}
.stmt-scroll {
  overflow-x: auto;
}
.stmt-wide {
  min-width: 100%;
}

.stmt-label {
  text-align: left;
  font-weight: inherit;
  padding: 0.3rem 0.75rem 0.3rem 0;
  white-space: nowrap;
  /* The monthly view scrolls horizontally. Without this the label column
     scrolls away with everything else, leaving a grid of figures nobody can
     identify — a statement you cannot read the line names of is not a
     statement. Needs an opaque background or the scrolling figures show
     through underneath it. */
  position: sticky;
  left: 0;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
}
.stmt-amount {
  text-align: right;
  padding: 0.3rem 0 0.3rem 1.75rem;
  white-space: nowrap;
  /* The single most important rule here: figures line up digit-for-digit down
     the column instead of drifting with proportional glyph widths. */
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  min-width: 130px;
}
.stmt-col-head {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
  border-bottom: 1px solid currentColor;
  padding-bottom: 0.4rem;
}

/* ── Row kinds ──────────────────────────────────────────────── */
.is-section .stmt-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  opacity: 0.65;
  padding-top: 1.4rem;
}
.is-account .stmt-label {
  padding-left: 1.25rem;
  opacity: 0.9;
}
.is-subtotal .stmt-label,
.is-subtotal .stmt-amount {
  font-weight: 500;
}
/* A single rule above a subtotal, the accounting convention for "this adds up
   the lines directly above". */
.is-subtotal .stmt-amount {
  border-top: 1px solid currentColor;
}
.is-result .stmt-label,
.is-result .stmt-amount {
  font-weight: 700;
}
.is-result .stmt-label {
  letter-spacing: 0.06em;
}
.is-result .stmt-amount {
  border-top: 1px solid currentColor;
}
.is-result .stmt-label,
.is-result .stmt-amount,
.is-result td {
  padding-top: 0.5rem;
}
/* Double rule under the closing figure — the convention that says "this is the
   bottom line, nothing follows". */
.is-final .stmt-amount,
.is-final td {
  border-bottom: 3px double currentColor;
  padding-bottom: 0.5rem;
}

.is-total-col {
  border-left: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  padding-left: 1rem;
  font-weight: 600;
}

/* % of sales: a narrower, quieter column beside the amount it describes. */
.stmt-pct {
  min-width: 68px;
  padding-left: 0.75rem;
  font-size: 0.85em;
  opacity: 0.75;
}
.is-total-pct {
  font-weight: 600;
}

/* ── Paper ──────────────────────────────────────────────────
   A month-column statement is ~1940px at screen metrics against ~1047px of
   usable A4 landscape. Rather than let html2pdf shrink the whole page to fit
   (which makes the type unreadable), the table is compacted for print: the
   figures lose their fixed column width, the label column is allowed to wrap,
   and everything drops a couple of points. */
.is-print .stmt-amount {
  min-width: 0;
  padding-left: 0.6rem;
  font-size: 0.62rem;
}
.is-print .stmt-label {
  white-space: normal;
  padding-right: 0.4rem;
  font-size: 0.66rem;
  max-width: 190px;
  /* Print has no scroll container, so sticky buys nothing — and html2canvas
     renders sticky/!transparent backgrounds literally, which would stamp a
     theme-coloured block across the printed sheet. */
  position: static;
  background: transparent;
}
.is-print .stmt-col-head {
  font-size: 0.55rem;
  letter-spacing: 0.02em;
  padding-bottom: 0.25rem;
}
.is-print .is-section .stmt-label {
  font-size: 0.6rem;
  padding-top: 0.7rem;
}
.is-print .is-account .stmt-label {
  padding-left: 0.6rem;
}
.is-print .stmt-amount,
.is-print .stmt-label {
  padding-top: 0.16rem;
  padding-bottom: 0.16rem;
}
.is-print .is-total-col {
  padding-left: 0.5rem;
}
.is-print .stmt-pct {
  padding-left: 0.3rem;
}
.is-print .statement-title {
  font-size: 1rem;
}
</style>
