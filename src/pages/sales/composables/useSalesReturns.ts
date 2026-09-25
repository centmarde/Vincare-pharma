import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSalesReturnsDataStore } from '@/stores/salesReturnsData'
import type { SalesReturnType, ReturnCondition } from '@/stores/salesReturnsData'
import { formatCurrency, formatDate } from '@/utils/helpers'

// The returns register. Read-only apart from opening the accept form — a
// recorded return is not edited: its stock movement has already happened, so a
// correction is a new document, the same rule the ledger follows.

const conditionLabels: Record<ReturnCondition, string> = {
  good: 'Good',
  expired: 'Expired',
  broken: 'Broken',
}

export function useSalesReturns() {
  const returnsStore = useSalesReturnsDataStore()
  const { returns, loading } = storeToRefs(returnsStore)

  const search = ref('')
  const showAcceptDialog = ref(false)

  const headers = [
    { title: 'Return No.', key: 'return_no', sortable: true },
    { title: 'Date', key: 'created_at', sortable: true },
    { title: 'Customer', key: 'customer_name', sortable: true },
    { title: 'Items', key: 'lines', sortable: false },
    { title: 'Settlement', key: 'settlement', sortable: true },
    { title: 'Credit', key: 'total_amount', sortable: true, align: 'end' as const },
  ]

  const filtered = computed(() => {
    const term = search.value.trim().toLowerCase()
    if (!term) return returns.value
    return returns.value.filter((r) =>
      (r.return_no ?? '').toLowerCase().includes(term)
      || (r.customer_name ?? '').toLowerCase().includes(term)
      || r.lines.some((l) => (l.product_name ?? '').toLowerCase().includes(term)),
    )
  })

  const totalCredited = computed(() =>
    returns.value.reduce((sum, r) => sum + r.total_amount, 0),
  )

  /**
   * How much of a return never came back as sellable stock.
   *
   * Worth surfacing per row rather than only in totals: a return that is mostly
   * write-off is a supplier or handling problem, not a customer preference, and
   * it reads very differently from one that went straight back on the shelf.
   */
  function writeOffValue(row: SalesReturnType): number {
    return row.lines
      .filter((l) => l.condition !== 'good')
      .reduce((sum, l) => sum + l.line_total, 0)
  }

  function conditionSummary(row: SalesReturnType): string {
    const counts = new Map<string, number>()
    for (const line of row.lines) {
      const label = line.condition ? conditionLabels[line.condition] : 'Unspecified'
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()].map(([label, n]) => `${n} ${label}`).join(' · ')
  }

  function settlementLabel(row: SalesReturnType): string {
    if (row.settlement === 'credited') return 'On account'
    if (row.settlement === 'swapped') return 'Swapped'
    return row.status ?? '—'
  }

  function settlementColor(row: SalesReturnType): string {
    return row.settlement === 'credited' ? 'info' : 'success'
  }

  async function refresh() {
    await returnsStore.fetchReturns()
  }

  function openAcceptDialog() {
    showAcceptDialog.value = true
  }

  async function onReturnCreated() {
    await refresh()
  }

  onMounted(refresh)

  return {
    returns, filtered, loading, search, headers,
    totalCredited, writeOffValue, conditionSummary,
    settlementLabel, settlementColor,
    showAcceptDialog, openAcceptDialog, onReturnCreated,
    refresh,
    formatCurrency, formatDate,
  }
}
