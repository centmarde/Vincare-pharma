import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useHistoryDataStore } from '../stores/historyData'

export type RequestHistoryItem = {
  id: number
  source: 'change_request' | 'log'
  created_at: string
  transaction_id: number
  request_type: 'edit' | 'void' | 'undo_pr' | 'pr_approval'
  summary: string | null
  reason: string | null
  status: 'approved' | 'rejected'
  created_by: string | null
  created_by_email?: string | null
  resolved_by: string | null
  resolved_by_email?: string | null
  resolved_at: string | null
  resolution_note: string | null
  from_transaction_no: string | null
  to_transaction_no: string | null
  requisition_no?: string | null
  transaction_type?: string | null
}

export function useRequestHistory() {
  const store = useHistoryDataStore()
  const { requests, loading, error } = storeToRefs(store)

  const page = ref(1)
  const perPage = ref(5)

  const totalItems = computed(() => requests.value.length)
  const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / perPage.value)))

  const paginatedRequests = computed(() => {
    const start = (page.value - 1) * perPage.value
    return requests.value.slice(start, start + perPage.value)
  })

  async function fetchHistory() {
    await store.fetchHistory()
  }

  onMounted(fetchHistory)

  return {
    requests,
    loading,
    error,
    page,
    perPage,
    totalItems,
    totalPages,
    paginatedRequests,
    fetchHistory,
  }
}