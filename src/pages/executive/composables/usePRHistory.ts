// src/pages/executive/composables/usePRHistory.ts
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import { useTransactionsDataStore } from '@/stores/transactionsData'
import { useTransactionsData } from '@/composables/useTransactionsData'
import { useAuthUserStore } from '@/stores/authUser'
import type { PR } from '@/stores/purchaseRequisitionData'
import { ref, watch } from 'vue'

// No STATUS column (always "Complete" here) and no approve/reject actions —
// this table is read-only, just a "View" button.
export const historyHeaders = [
  { title: 'PR #',         key: 'requisition_no',  sortable: true,  align: 'center' as const },
  { title: 'ITEMS',        key: 'items',          sortable: false, align: 'center' as const },
  { title: 'TOTAL QTY',    key: 'total_qty',      sortable: false, align: 'center' as const },
  { title: 'TOTAL COST',   key: 'total_amount',   sortable: true,  align: 'center' as const },
  { title: 'REQUESTED BY', key: 'requester_name', sortable: true,  align: 'center' as const },
  { title: 'DATE',         key: 'created_at',     sortable: true,  align: 'center' as const },
  { title: 'REVIEWED BY',  key: 'reviewer_name',  sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',      key: 'actions',        sortable: false, align: 'center' as const },
]

export function usePRHistory() {
  const txStore   = useTransactionsDataStore()
  const prStore   = usePurchaseRequisitionStore()
  const authStore = useAuthUserStore()
  const { totalQty, totalCost, itemSummary, itemNames } = useTransactionsData()

  const loading      = ref(false)
  const search        = ref('')
  const searchInput   = ref('')
  const showModal     = ref(false)
  const selectedPR    = ref<PR | null>(null)
  const serverItems   = ref<PR[]>([])
  const totalItems    = ref(0)
  const page          = ref(1)
  const itemsPerPage  = ref(10)

  // Same RPC as the full PR list, but 'status' is locked to 'complete' —
  // no filter menu, this view only ever shows finished PRs.
  async function loadItems({ page: p, itemsPerPage: ipp, sortBy }: {
    page: number
    itemsPerPage: number
    sortBy: { key: string; order: 'asc' | 'desc' }[]
  }) {
    loading.value = true
    const sort = sortBy[0]

    if (!authStore.users.length) await authStore.getAllUsers()

    const { rows, totalCount } = await txStore.fetchPurchaseRequisitionsRPC({
      search:    search.value.trim() || undefined,
      status:    'complete',
      orderBy:   (sort?.key as any) ?? 'created_at',
      ascending: sort ? sort.order === 'asc' : false,
      limit:     ipp,
      offset:    (p - 1) * ipp,
    })

    // Reuses the exact same mappers the main PR store already exposes —
    // no duplicate mapping logic.
    serverItems.value = rows.map(row => {
      const names = prStore.resolveUserNames(row.created_by, row.approved_by)
      return prStore.mapRPCRowToPR(row, names)
    })
    totalItems.value = totalCount
    page.value = p
    loading.value = false
  }

  function openDetail(pr: PR) {
    selectedPR.value = pr
    showModal.value  = true
  }

  function commitSearch() { search.value = searchInput.value }
  function clearSearch()  { searchInput.value = ''; search.value = '' }

  watch(search, () => loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] }))

  return {
    loading, searchInput, commitSearch, clearSearch,
    page, itemsPerPage, serverItems, totalItems,
    selectedPR, showModal, openDetail,
    totalQty, totalCost, itemSummary, itemNames,
    loadItems,
  }
}