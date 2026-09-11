<script setup lang="ts">
import type { StatementRow } from '../composables/useIncomeStatement'
import type { CashBasisStatement, MonthlyCashBasisStatement, MonthlyIncomeStatement } from '@/stores/glData'
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
defineProps<{
  title: string
  periodLine: string
  basisLine: string
  isCash: boolean
  isMonthly: boolean
  periodRows: StatementRow[]
  monthlyRows: StatementRow[]
  monthly: MonthlyIncomeStatement | null
  cashStatement: CashBasisStatement | null
  monthlyCash: MonthlyCashBasisStatement | null
  monthLabel: (month: string) => string
  letterhead?: CompanyProfile | null
  /**
   * Typeset for paper rather than a screen: tighter metrics, and NO horizontal
   * scroll container. html2canvas clips at a scrolling element, so a wide month
   * table would be captured only as far as the visible box.
   */
  print?: boolean
}>()

function amountText(row: { negate: boolean }, amount: number) {
  return row.negate ? `(${formatCurrency(amount)})` : formatCurrency(amount)
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

      <!-- A cash statement that travels on paper needs the caveat ON the
           document, not only in the app chrome around it. -->
      <div v-if="isCash" class="cash-caveat mb-6">
        Recognised when money moved — revenue on collection, costs on payment.
        This is not a Statement of Income and will not agree with one.
      </div>

      <!-- ── Period, accrual ─────────────────────────────────── -->
      <table v-if="!isMonthly && !isCash && periodRows.length" class="stmt" style="max-width: 720px; margin: 0 auto">
        <tbody>
          <tr v-for="(row, i) in periodRows" :key="i" :class="rowClass(row)">
            <th scope="row" class="stmt-label">{{ row.label }}</th>
            <td class="stmt-amount">
              <template v-if="row.kind !== 'section'">{{ amountText(row, row.total) }}</template>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- ── Monthly, accrual ────────────────────────────────── -->
      <div v-else-if="isMonthly && !isCash && monthly" :class="print ? '' : 'stmt-scroll'">
        <table class="stmt stmt-wide">
          <thead>
            <tr>
              <th class="stmt-label"></th>
              <th v-for="m in monthly.months" :key="m" class="stmt-amount stmt-col-head">
                {{ monthLabel(m) }}
              </th>
              <th class="stmt-amount stmt-col-head is-total-col">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in monthlyRows" :key="i" :class="rowClass(row)">
              <th scope="row" class="stmt-label">{{ row.label }}</th>
              <template v-if="row.kind === 'section'">
                <td v-for="(m, j) in monthly.months" :key="j" />
                <td class="is-total-col" />
              </template>
              <template v-else>
                <td v-for="(amt, j) in row.amounts" :key="j" class="stmt-amount">
                  {{ amountText(row, amt) }}
                </td>
                <td class="stmt-amount is-total-col">{{ amountText(row, row.total) }}</td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── Period, cash ────────────────────────────────────── -->
      <table v-else-if="!isMonthly && isCash && cashStatement" class="stmt" style="max-width: 720px; margin: 0 auto">
        <tbody>
          <tr class="is-row is-account">
            <th scope="row" class="stmt-label">Collected from customers</th>
            <td class="stmt-amount">{{ formatCurrency(cashStatement.collected) }}</td>
          </tr>
          <tr class="is-row is-account">
            <th scope="row" class="stmt-label">Paid to suppliers</th>
            <td class="stmt-amount">({{ formatCurrency(cashStatement.paidToSuppliers) }})</td>
          </tr>
          <tr v-for="e in cashStatement.paidExpenses" :key="e.code" class="is-row is-account">
            <th scope="row" class="stmt-label">{{ e.name }}</th>
            <td class="stmt-amount">({{ formatCurrency(e.amount) }})</td>
          </tr>
          <tr class="is-row is-result is-final">
            <th scope="row" class="stmt-label">NET CASH FROM TRADING</th>
            <td class="stmt-amount">{{ formatCurrency(cashStatement.netCash) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- ── Monthly, cash ───────────────────────────────────── -->
      <div v-else-if="isMonthly && isCash && monthlyCash" :class="print ? '' : 'stmt-scroll'">
        <table class="stmt stmt-wide">
          <thead>
            <tr>
              <th class="stmt-label"></th>
              <th v-for="m in monthlyCash.months" :key="m" class="stmt-amount stmt-col-head">
                {{ monthLabel(m) }}
              </th>
              <th class="stmt-amount stmt-col-head is-total-col">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr class="is-row is-account">
              <th scope="row" class="stmt-label">Collected from customers</th>
              <td v-for="(p, i) in monthlyCash.perMonth" :key="i" class="stmt-amount">
                {{ formatCurrency(p.collected) }}
              </td>
              <td class="stmt-amount is-total-col">{{ formatCurrency(monthlyCash.total.collected) }}</td>
            </tr>
            <tr class="is-row is-account">
              <th scope="row" class="stmt-label">Paid to suppliers</th>
              <td v-for="(p, i) in monthlyCash.perMonth" :key="i" class="stmt-amount">
                ({{ formatCurrency(p.paidToSuppliers) }})
              </td>
              <td class="stmt-amount is-total-col">({{ formatCurrency(monthlyCash.total.paidToSuppliers) }})</td>
            </tr>
            <tr class="is-row is-account">
              <th scope="row" class="stmt-label">Paid expenses</th>
              <td v-for="(p, i) in monthlyCash.perMonth" :key="i" class="stmt-amount">
                ({{ formatCurrency(p.paidExpensesTotal) }})
              </td>
              <td class="stmt-amount is-total-col">({{ formatCurrency(monthlyCash.total.paidExpensesTotal) }})</td>
            </tr>
            <tr class="is-row is-result is-final">
              <th scope="row" class="stmt-label">NET CASH FROM TRADING</th>
              <td v-for="(p, i) in monthlyCash.perMonth" :key="i" class="stmt-amount">
                {{ formatCurrency(p.netCash) }}
              </td>
              <td class="stmt-amount is-total-col">{{ formatCurrency(monthlyCash.total.netCash) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="text-center text-body-2 text-medium-emphasis py-10">
        Nothing posted to the ledger in this period.
      </div>

      <!-- Non-trading cash is listed rather than dropped, so the figure can
           still be reconciled against the bank. -->
      <template v-if="isCash && !isMonthly && cashStatement?.excluded.length">
        <div class="excluded-head mt-8 mb-2">Cash movements excluded as non-trading</div>
        <table class="stmt" style="max-width: 720px; margin: 0 auto">
          <tbody>
            <tr v-for="x in cashStatement.excluded" :key="x.code" class="is-row is-account">
              <th scope="row" class="stmt-label">{{ x.name }}</th>
              <td class="stmt-amount">{{ formatCurrency(x.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </template>
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
.cash-caveat {
  font-size: 0.78rem;
  line-height: 1.5;
  text-align: center;
  max-width: 620px;
  margin-inline: auto;
  padding: 0.6rem 0.9rem;
  border: 1px solid rgb(var(--v-theme-warning));
  border-radius: 6px;
  opacity: 0.9;
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

.excluded-head {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  opacity: 0.65;
  text-align: center;
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
.is-print .statement-title {
  font-size: 1rem;
}
</style>
