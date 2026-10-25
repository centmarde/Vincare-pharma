import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useARStatementDataStore } from '@/stores/arStatementData'
import type { SOARegisterRow } from '@/stores/arStatementData'
import { useCustomersDataStore } from '@/stores/customersData'
import { formatCurrency, formatDateOnly, formatDateShort } from '@/utils/helpers'
import type { ARAgingTerm } from '@/stores/financeData'

// Column order mirrors the accountant's Excel sheet left-to-right, so a printed
// or exported register can sit next to the old workbook and be read the same way.
export const SOA_HEADERS = [
  { title: 'Customer Name', key: 'customer_name', width: 200 },
  { title: 'Area', key: 'area', width: 120 },
  { title: 'DR Date', key: 'dr_date', width: 110 },
  { title: 'DR No.', key: 'dr_no', width: 140 },
  { title: 'SO No.', key: 'so_no', width: 140 },
  // The government's PR when the order has one (In-House), else our company PO.
  { title: 'PR / PO No.', key: 'po_no', width: 140 },
  { title: 'PR Amount', key: 'po_amount', align: 'end' as const, width: 130 },
  { title: 'DR Amount', key: 'dr_amount', align: 'end' as const, width: 130 },
  { title: 'OR Date', key: 'or_date', width: 110 },
  { title: 'OR No.', key: 'or_no', width: 140 },
  { title: 'OR Amount', key: 'or_amount', align: 'end' as const, width: 130 },
  { title: 'Discount', key: 'discount', align: 'end' as const, width: 120 },
  { title: 'Credit', key: 'credit', align: 'end' as const, width: 120 },
  { title: 'Accounts Receivable', key: 'accounts_receivable', align: 'end' as const, width: 160 },
  { title: 'PDC', key: 'pdc_amount', align: 'end' as const, width: 120 },
  { title: 'Days Outstanding', key: 'days_outstanding', align: 'end' as const, width: 130 },
  { title: 'Due Date', key: 'due_date', width: 110 },
  { title: 'Amount Unpaid', key: 'amount_unpaid', align: 'end' as const, width: 140 },
  { title: 'Aging', key: 'term', width: 130 },
  { title: '1-30', key: 'bucket_1_30', align: 'end' as const, width: 120 },
  { title: '31-60', key: 'bucket_31_60', align: 'end' as const, width: 120 },
  { title: '61-90', key: 'bucket_61_90', align: 'end' as const, width: 120 },
  { title: '91-180', key: 'bucket_91_180', align: 'end' as const, width: 120 },
  { title: 'Over 6 Months', key: 'bucket_180_plus', align: 'end' as const, width: 130 },
]

/**
 * The on-screen default: what a reader needs per receipt, fitting without a
 * sideways scroll. Related figures share a cell (OR number and date under the
 * amount collected), the five bucket columns become one aging chip with their
 * totals shown above the table, and Credit / PDC — placeholders with nothing
 * behind them — are left out. "Full sheet" and the CSV keep SOA_HEADERS.
 */
export const SOA_COMPACT_HEADERS = [
  { title: 'Customer', key: 'customer_name' },
  { title: 'DR', key: 'dr_no' },
  { title: 'Order', key: 'so_no' },
  { title: 'DR Amount', key: 'dr_amount', align: 'end' as const },
  { title: 'Discount', key: 'discount', align: 'end' as const },
  { title: 'Collected', key: 'or_amount', align: 'end' as const },
  { title: 'Credit memo', key: 'credit', align: 'end' as const },
  { title: 'Balance', key: 'accounts_receivable', align: 'end' as const },
  { title: 'Due', key: 'due_date' },
  { title: 'Aging', key: 'term' },
]

export const TERM_LABELS: Record<ARAgingTerm, string> = {
  current: 'Current',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '91-180': '91–180 days',
  '180+': 'Over 6 months',
  'no-term': 'No term',
}

// Explicit green for "current": the theme's 'success' is a shade of the brand
// red, so a receivable not yet due read exactly like an overdue one.
export const TERM_COLORS: Record<ARAgingTerm, string> = {
  current: 'green-darken-1',
  '1-30': 'warning',
  '31-60': 'warning',
  '61-90': 'error',
  '91-180': 'error',
  '180+': 'error',
  'no-term': 'grey',
}

/**
 * A row's aging label. A consignment row is aged by days since delivery, not
 * against a due date, so it says so: 'Consignment · 31–60 days'.
 */
export function termLabel(row: Pick<SOARegisterRow, 'term' | 'consignment'>): string {
  return row.consignment ? `Consignment · ${TERM_LABELS[row.term]}` : TERM_LABELS[row.term]
}

export function useStatementOfAccounts() {
  const store = useARStatementDataStore()
  const customersStore = useCustomersDataStore()
  const { register, totals, loading } = storeToRefs(store)

  const filterCustomerId = ref<number | null>(null)
  const filterArea = ref<string | null>(null)
  // The sheet this register reproduces is the In-House (government/LGU) one, so
  // that's the default view. Ethical is still selectable — the underlying build
  // is department-agnostic.
  const filterSource = ref<'inhouse_order' | 'ethical_order' | null>('inhouse_order')
  const filterDateFrom = ref<string | null>(null)
  const filterDateTo = ref<string | null>(null)
  const outstandingOnly = ref(true)
  /** Every column, in the Excel order, instead of the compact view. */
  const fullSheet = ref(false)

  const asOfLabel = computed(() =>
    new Date().toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
  )

  // Derived from the customer master, NOT from the register: the register is
  // already area-filtered, so sourcing the options from it collapsed the
  // dropdown to the single selected area and left no way to switch without
  // clearing first.
  const areaOptions = computed(() =>
    [...new Set(customersStore.customers.map((c) => c.area).filter(Boolean))].sort() as string[],
  )

  const customerOptions = computed(() =>
    customersStore.customers.map((c) => ({ title: c.name ?? `#${c.id}`, value: c.id })),
  )

  const outstandingTotal = computed(() => totals.value.accounts_receivable)

  // The compact view drops the Discount column when no receipt has one — it
  // would be a column of dashes.
  // ...and the Credit memo column when none was issued.
  const compactHeaders = computed(() => SOA_COMPACT_HEADERS.filter((h) =>
    (h.key !== 'discount' || totals.value.discount > 0.005) && (h.key !== 'credit' || totals.value.credit > 0.005)))

  /**
   * The aging buckets as one strip of totals above the table, standing in for
   * the five bucket columns. Every bucket shows (zero included) so the strip
   * always reads the same.
   */
  const agingSummary = computed(() => {
    const unpaid = (term: ARAgingTerm) =>
      register.value.filter((r) => r.term === term).reduce((sum, r) => sum + r.amount_unpaid, 0)
    return (['current', '1-30', '31-60', '61-90', '91-180', '180+', 'no-term'] as ARAgingTerm[])
      .map((term) => ({ term, label: TERM_LABELS[term], color: TERM_COLORS[term], amount: unpaid(term) }))
      .filter((b) => b.term !== 'no-term' || b.amount > 0)
  })

  // Past due: consignment rows sit in the buckets by days since delivery, but
  // they are never overdue (they pay as they sell), so they stay out of it —
  // the same rule as Accounts Receivable's term totals.
  const agedTotal = computed(() =>
    register.value
      .filter((r) => !r.consignment)
      .reduce((sum, r) => sum + r.bucket_1_30 + r.bucket_31_60 + r.bucket_61_90 + r.bucket_91_180 + r.bucket_180_plus, 0),
  )

  // A receipt with no due date cannot land in any bucket. In-House orders have
  // no due-date convention of their own, so this is entirely down to whether
  // the customer has payment terms set — surface it rather than letting the
  // aging columns quietly read zero.
  const unagedRows = computed(() => register.value.filter((r) => r.term === 'no-term'))
  const unagedTotal = computed(() =>
    unagedRows.value.reduce((sum, r) => sum + r.accounts_receivable, 0),
  )

  async function refresh() {
    await store.fetchSOARegister({
      customerId: filterCustomerId.value,
      area: filterArea.value,
      source: filterSource.value,
      dateFrom: filterDateFrom.value,
      dateTo: filterDateTo.value,
      outstandingOnly: outstandingOnly.value,
    })
  }

  function clearFilters() {
    filterCustomerId.value = null
    filterArea.value = null
    filterSource.value = null
    filterDateFrom.value = null
    filterDateTo.value = null
    outstandingOnly.value = true
    return refresh()
  }

  function cellValue(row: SOARegisterRow, key: string): string {
    switch (key) {
      case 'dr_date':
      case 'or_date':
      case 'due_date':
        // Date only: these are calendar dates, and the time formatDateShort
        // appends read as "08:00am" on every row and in the CSV.
        return formatDateOnly(row[key as 'dr_date' | 'or_date' | 'due_date'])
      case 'term':
        return termLabel(row)
      case 'po_amount':
        return row.po_amount == null ? '' : formatCurrency(row.po_amount)
      // Credit memos applied to this DR; blank when none.
      case 'credit':
        return row.credit > 0.005 ? formatCurrency(row.credit) : ''
      // Layout placeholder: no table backs post-dated cheques.
      case 'pdc_amount':
        return '—'
      case 'dr_amount':
      case 'or_amount':
      case 'discount':
      case 'accounts_receivable':
      case 'amount_unpaid':
      case 'bucket_1_30':
      case 'bucket_31_60':
      case 'bucket_61_90':
      case 'bucket_91_180':
      case 'bucket_180_plus':
        return formatCurrency(row[key as keyof SOARegisterRow] as number)
      default: {
        const v = row[key as keyof SOARegisterRow]
        return v == null ? '' : String(v)
      }
    }
  }

  // Straight CSV of what's on screen — the accountant still works this register
  // in Excel, so an export beats re-keying. Quotes are doubled per RFC 4180.
  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const lines = [
      SOA_HEADERS.map((h) => esc(h.title)).join(','),
      ...register.value.map((row) =>
        SOA_HEADERS.map((h) => esc(cellValue(row, h.key))).join(','),
      ),
    ]
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `statement-of-accounts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  onMounted(async () => {
    await Promise.all([refresh(), customersStore.fetchCustomers()])
  })

  return {
    register, totals, loading,
    filterCustomerId, filterArea, filterSource, filterDateFrom, filterDateTo, outstandingOnly, fullSheet,
    compactHeaders, agingSummary,
    areaOptions, customerOptions, asOfLabel, outstandingTotal, agedTotal,
    unagedRows, unagedTotal,
    SOA_HEADERS, TERM_LABELS, TERM_COLORS,
    refresh, clearFilters, cellValue, exportCsv,
    formatCurrency, formatDateShort,
  }
}
