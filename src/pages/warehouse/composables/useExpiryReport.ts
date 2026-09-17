import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useExpiryReportDataStore } from '@/stores/expiryReportData'
import type { ExpiryItem } from '@/stores/expiryReportData'
import {
  buildFindings,
  buildRecommendations,
  categoryBreakdown,
  daysUntil,
} from '@/utils/expiryInsights'
import type { FindingSeverity } from '@/utils/expiryInsights'
import { formatCurrency } from '@/utils/helpers'

/**
 * Drives the Expiring Inventory page and the report it prints.
 *
 * The screen and the PDF read the SAME computed values here — totals,
 * breakdown, findings, recommendations — so the two can never disagree in
 * front of the accountant. Nothing is recomputed inside the print dialog.
 */

export type ExpiryUrgency = 'expired' | 'critical' | 'soon' | 'later'

/** Past due. */
const urgencyExpired = 0
/** Within this many days — the red-hot band. */
const urgencyCriticalDays = 30
/** Within this many days — the watch band. */
const urgencySoonDays = 60

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const reportFormats = [
  { value: 'executive', title: 'Executive summary', subtitle: 'One page — headline, top items, findings' },
  { value: 'full', title: 'Full report', subtitle: 'Every item, category breakdown, data-quality notes' },
] as const

export type ReportFormat = (typeof reportFormats)[number]['value']

/** How many lines the executive one-pager lists before it stops. */
export const executiveTopItems = 5

export const expiryHeaders = [
  { title: '#', key: 'rank', sortable: false, align: 'start' as const, width: 56 },
  { title: 'PRODUCT', key: 'product_name', sortable: true, align: 'start' as const },
  { title: 'SKU', key: 'sku', sortable: false, align: 'start' as const },
  { title: 'CATEGORY', key: 'category', sortable: true, align: 'start' as const },
  { title: 'QTY', key: 'quantity', sortable: true, align: 'end' as const },
  { title: 'UNIT COST', key: 'cost_price', sortable: true, align: 'end' as const },
  { title: 'VALUE AT COST', key: 'value', sortable: true, align: 'end' as const },
  { title: 'EXPIRES', key: 'expiry_date', sortable: true, align: 'center' as const },
]

export function useExpiryReport() {
  const store = useExpiryReportDataStore()
  const { report, loading, error } = storeToRefs(store)

  /**
   * Fixed at load, not read from the clock on each render: "15 days from
   * today" must say the same thing in the on-screen panel and in a PDF
   * produced from it minutes later, and must not shift mid-session across
   * midnight.
   */
  const asOf = ref(new Date())

  const availableMonths = ref<{ year: number; month: number; itemCount: number }[]>([])
  const missingExpiryCount = ref(0)
  const catalogueCount = ref(0)

  const selectedYear = ref<number | null>(null)
  const selectedMonth = ref<number | null>(null)

  const search = ref('')
  const categoryFilter = ref<string | null>(null)

  const showPrintDialog = ref(false)
  const printFormat = ref<ReportFormat>('full')

  // ─── Derived figures ──────────────────────────────────────────────
  const items = computed<ExpiryItem[]>(() => report.value?.items ?? [])
  const totalValue = computed(() => report.value?.totalValue ?? 0)
  const totalUnits = computed(() => report.value?.totalUnits ?? 0)
  const itemCount = computed(() => items.value.length)
  const hasData = computed(() => itemCount.value > 0)

  const breakdown = computed(() => categoryBreakdown(items.value))

  const findings = computed(() =>
    report.value ? buildFindings(report.value, asOf.value, missingExpiryCount.value) : [],
  )

  const recommendations = computed(() =>
    report.value ? buildRecommendations(report.value, asOf.value) : [],
  )

  /** The month's own expiry date — the one the headline counts down to. */
  const headlineExpiry = computed(() => items.value[0]?.expiry_date ?? null)

  const daysToExpiry = computed(() =>
    headlineExpiry.value ? daysUntil(headlineExpiry.value, asOf.value) : null,
  )

  const monthLabel = computed(() => {
    if (!report.value) return ''
    return `${monthNames[report.value.month - 1]} ${report.value.year}`
  })

  const monthOptions = computed(() =>
    availableMonths.value.map((m) => ({
      title: `${monthNames[m.month - 1]} ${m.year}`,
      subtitle: `${m.itemCount} item${m.itemCount === 1 ? '' : 's'}`,
      value: `${m.year}-${String(m.month).padStart(2, '0')}`,
    })),
  )

  const selectedMonthKey = computed({
    get: () =>
      selectedYear.value && selectedMonth.value
        ? `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`
        : null,
    set: (key: string | null) => {
      if (!key) return
      selectedYear.value = Number(key.slice(0, 4))
      selectedMonth.value = Number(key.slice(5, 7))
      load()
    },
  })

  const categoryOptions = computed(() => breakdown.value.map((row) => row.category))

  /** Table rows: filtered, and ranked by value so "#1" means the biggest exposure. */
  const filteredItems = computed(() => {
    const term = search.value.trim().toLowerCase()
    return items.value
      .map((item, index) => ({ ...item, rank: index + 1 }))
      .filter((item) => {
        if (categoryFilter.value && (item.category || '(uncategorised)') !== categoryFilter.value) {
          return false
        }
        if (!term) return true
        return (
          item.product_name.toLowerCase().includes(term)
          || (item.sku?.toLowerCase().includes(term) ?? false)
          || (item.category?.toLowerCase().includes(term) ?? false)
        )
      })
  })

  const topItems = computed(() => items.value.slice(0, executiveTopItems))

  // ─── Display helpers ──────────────────────────────────────────────
  function urgencyFor(item: ExpiryItem): ExpiryUrgency {
    const days = daysUntil(item.expiry_date, asOf.value)
    if (days < urgencyExpired) return 'expired'
    if (days <= urgencyCriticalDays) return 'critical'
    if (days <= urgencySoonDays) return 'soon'
    return 'later'
  }

  function urgencyColor(item: ExpiryItem): string {
    const map: Record<ExpiryUrgency, string> = {
      expired: 'error',
      critical: 'orange',
      soon: 'warning',
      later: 'grey',
    }
    return map[urgencyFor(item)]
  }

  function shareLabel(share: number): string {
    return `${(share * 100).toFixed(1)}%`
  }

  function money(value: number): string {
    return formatCurrency(value)
  }

  /**
   * Returns the Vuetify alert type, already narrowed — `v-alert`'s `type` prop
   * only accepts these four, and a `string` would need an `as` cast at the
   * call site, which the template parser (plain JS, not TS) rejects outright.
   */
  function severityColor(severity: FindingSeverity): 'error' | 'warning' | 'info' | 'success' {
    const map: Record<FindingSeverity, 'error' | 'warning' | 'info'> = {
      critical: 'error',
      warning: 'warning',
      info: 'info',
    }
    return map[severity] ?? 'info'
  }

  // ─── Actions ──────────────────────────────────────────────────────
  async function load() {
    if (!selectedYear.value || !selectedMonth.value) return
    asOf.value = new Date()
    await store.fetchExpiryMonth(selectedYear.value, selectedMonth.value)
  }

  /**
   * Defaults to the nearest month that still has stock in it, so the page
   * opens on something actionable instead of an empty picker.
   */
  async function init() {
    const [months, missing, catalogue] = await Promise.all([
      store.fetchMonthsWithExpiries(),
      store.fetchMissingExpiryCount(),
      store.fetchCatalogueCount(),
    ])
    availableMonths.value = months
    missingExpiryCount.value = missing
    catalogueCount.value = catalogue

    if (!months.length) return
    const today = new Date()
    const currentKey = today.getFullYear() * 12 + today.getMonth() + 1
    const upcoming = [...months]
      .filter((m) => m.year * 12 + m.month >= currentKey)
      .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))
    const target = upcoming[0] ?? months[0]

    selectedYear.value = target.year
    selectedMonth.value = target.month
    await load()
  }

  function openPrintDialog(format: ReportFormat) {
    printFormat.value = format
    showPrintDialog.value = true
  }

  function clearFilters() {
    search.value = ''
    categoryFilter.value = null
  }

  return {
    // State
    loading,
    error,
    report,
    asOf,
    search,
    categoryFilter,
    showPrintDialog,
    printFormat,
    missingExpiryCount,
    catalogueCount,
    selectedMonthKey,

    // Computed
    items,
    filteredItems,
    topItems,
    totalValue,
    totalUnits,
    itemCount,
    hasData,
    breakdown,
    findings,
    recommendations,
    monthLabel,
    monthOptions,
    categoryOptions,
    headlineExpiry,
    daysToExpiry,

    // Helpers
    urgencyFor,
    urgencyColor,
    severityColor,
    shareLabel,
    money,

    // Constants
    expiryHeaders,
    reportFormats,

    // Actions
    init,
    load,
    openPrintDialog,
    clearFilters,
  }
}
