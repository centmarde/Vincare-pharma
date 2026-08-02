import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useARStatementDataStore } from '@/stores/arStatementData'
import type { SOARegisterRow } from '@/stores/arStatementData'
import { useCustomersDataStore } from '@/stores/customersData'
import { formatCurrency, formatDateShort } from '@/utils/helpers'
import type { ARAgingTerm } from '@/stores/financeData'

// Column order mirrors the accountant's Excel sheet left-to-right, so a printed
// or exported register can sit next to the old workbook and be read the same way.
export const SOA_HEADERS = [
  { title: 'Customer Name', key: 'customer_name', width: 200 },
  { title: 'Area', key: 'area', width: 120 },
  { title: 'DR Date', key: 'dr_date', width: 110 },
  { title: 'DR No.', key: 'dr_no', width: 140 },
  { title: 'SO No.', key: 'so_no', width: 140 },
  { title: 'PO No.', key: 'po_no', width: 140 },
  { title: 'PO Amount', key: 'po_amount', align: 'end' as const, width: 130 },
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

export const TERM_LABELS: Record<ARAgingTerm, string> = {
  current: 'Current',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '91-180': '91–180 days',
  '180+': 'Over 6 months',
  'no-term': 'No term',
}

export const TERM_COLORS: Record<ARAgingTerm, string> = {
  current: 'success',
  '1-30': 'warning',
  '31-60': 'warning',
  '61-90': 'error',
  '91-180': 'error',
  '180+': 'error',
  'no-term': 'grey',
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

  const agedTotal = computed(() =>
    totals.value.bucket_1_30 + totals.value.bucket_31_60 + totals.value.bucket_61_90 +
    totals.value.bucket_91_180 + totals.value.bucket_180_plus,
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
        return formatDateShort(row[key as 'dr_date' | 'or_date' | 'due_date'])
      case 'term':
        return TERM_LABELS[row.term]
      case 'po_amount':
        return row.po_amount == null ? '' : formatCurrency(row.po_amount)
      // Layout placeholders: no table backs credit memos or post-dated cheques,
      // so these stay blank rather than showing a fabricated ₱0.00.
      case 'credit':
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
    filterCustomerId, filterArea, filterSource, filterDateFrom, filterDateTo, outstandingOnly,
    areaOptions, customerOptions, asOfLabel, outstandingTotal, agedTotal,
    unagedRows, unagedTotal,
    SOA_HEADERS, TERM_LABELS, TERM_COLORS,
    refresh, clearFilters, cellValue, exportCsv,
    formatCurrency, formatDateShort,
  }
}
