import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDisposalsDataStore, type DisposalRequest } from '@/stores/disposalsData'

export type DisposalMonthOption = {
  title: string
  value: string
}

// The register reads APPROVED disposal transactions, not products.is_disposed —
// the flag only says a batch is fully gone, while these rows carry who asked,
// who approved, how many and why, which is what an audit actually needs.
export function useDisposalRegister() {
  const store = useDisposalsDataStore()
  const { disposalRegister, registerLoading, error } = storeToRefs(store)

  const search = ref('')
  const selectedMonthKey = ref('all')
  const page = ref(1)
  const itemsPerPage = ref(10)

  const headers = [
    { title: 'DS No.', key: 'reference_no', sortable: true },
    { title: 'Product', key: 'product_name', value: (d: DisposalRequest) => d.product?.product_name ?? '', sortable: true },
    { title: 'Batch', key: 'batch_no', value: (d: DisposalRequest) => d.product?.batch_no ?? '', sortable: false },
    { title: 'Expiry', key: 'expiry_date', value: (d: DisposalRequest) => d.product?.expiry_date ?? '', sortable: true },
    { title: 'Qty', key: 'qty', align: 'end' as const, sortable: true },
    { title: 'Value at cost', key: 'total_cost', align: 'end' as const, sortable: true },
    { title: 'Reason', key: 'reason', sortable: false },
    { title: 'Requested by', key: 'requester_name', sortable: true },
    { title: 'Approved by', key: 'approver_name', sortable: true },
    { title: 'Disposed on', key: 'updated_at', sortable: true },
  ]

  function disposalMonthKey(disposal: DisposalRequest): string {
    const stamp = disposal.updated_at ?? disposal.created_at
    return stamp ? stamp.slice(0, 7) : ''
  }

  function monthLabel(key: string): string {
    const [year, month] = key.split('-')
    const date = new Date(Number(year), Number(month) - 1, 1)
    return date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
  }

  const monthOptions = computed<DisposalMonthOption[]>(() => {
    const keys = new Set<string>()
    for (const disposal of disposalRegister.value) {
      const key = disposalMonthKey(disposal)
      if (key) keys.add(key)
    }

    const sorted = [...keys].sort().reverse()
    const options: DisposalMonthOption[] = [{ title: 'All months', value: 'all' }]
    for (const key of sorted) {
      options.push({ title: monthLabel(key), value: key })
    }
    return options
  })

  function matchesSearch(disposal: DisposalRequest, term: string): boolean {
    const haystack = [
      disposal.reference_no,
      disposal.product?.product_name,
      disposal.product?.sku,
      disposal.product?.batch_no,
      disposal.reason,
      disposal.requester_name,
      disposal.approver_name,
    ]
    return haystack.some((value) => (value ?? '').toLowerCase().includes(term))
  }

  const filteredDisposals = computed(() => {
    let rows = disposalRegister.value

    if (selectedMonthKey.value !== 'all') {
      rows = rows.filter((d) => disposalMonthKey(d) === selectedMonthKey.value)
    }

    const term = search.value.trim().toLowerCase()
    if (term) {
      rows = rows.filter((d) => matchesSearch(d, term))
    }

    return rows
  })

  const totalUnits = computed(() => {
    let total = 0
    for (const disposal of filteredDisposals.value) total += disposal.qty
    return total
  })

  const totalValue = computed(() => {
    let total = 0
    for (const disposal of filteredDisposals.value) total += disposal.total_cost
    return total
  })

  const disposalCount = computed(() => filteredDisposals.value.length)
  const hasData = computed(() => filteredDisposals.value.length > 0)

  function clearFilters() {
    search.value = ''
    selectedMonthKey.value = 'all'
    page.value = 1
  }

  async function init() {
    await store.fetchDisposalRegister()
  }

  return {
    disposalRegister,
    loading: registerLoading,
    error,
    search,
    selectedMonthKey,
    page,
    itemsPerPage,
    headers,
    monthOptions,
    filteredDisposals,
    totalUnits,
    totalValue,
    disposalCount,
    hasData,
    clearFilters,
    init,
  }
}
