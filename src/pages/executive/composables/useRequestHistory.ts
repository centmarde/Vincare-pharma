import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthUserStore } from '@/stores/authUser'

export type RequestHistoryItem = {
  id: number
  created_at: string
  transaction_id: number
  request_type: 'edit' | 'void' | 'undo_pr'
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
  // Joined from transactions
  requisition_no?: string | null
  transaction_type?: string | null
}

export function useRequestHistory() {
  const authStore = useAuthUserStore()

  const requests = ref<RequestHistoryItem[]>([])
  const loading = ref(false)
  const error = ref('')

  const page = ref(1)
  const perPage = ref(5)
  const totalItems = ref(0)

  const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / perPage.value)))

  const paginatedRequests = computed(() => {
    const start = (page.value - 1) * perPage.value
    return requests.value.slice(start, start + perPage.value)
  })

  async function fetchHistory() {
    loading.value = true
    error.value = ''
    try {
      // Fetch resolved (approved/rejected) change requests for purchase_requisition
      const { data, error: fetchError } = await supabase
        .from('change_requests')
        .select(
          `
          *,
          transactions!inner (
            requisition_no,
            transaction_type
          )
        `,
        )
        .in('status', ['approved', 'rejected'])
        .eq('transactions.transaction_type', 'purchase_requisition')
        .order('resolved_at', { ascending: false })

      if (fetchError) throw fetchError

      // Resolve user emails
      if (!authStore.users.length) await authStore.getAllUsers()

      requests.value = (data || []).map((row: any) => ({
        id: row.id,
        created_at: row.created_at,
        transaction_id: row.transaction_id,
        request_type: row.request_type,
        summary: row.summary ?? null,
        reason: row.reason ?? null,
        status: row.status as 'approved' | 'rejected',
        created_by: row.created_by ?? null,
        created_by_email:
          authStore.users.find((u: any) => u.id === row.created_by)?.email ?? null,
        resolved_by: row.resolved_by ?? null,
        resolved_by_email:
          authStore.users.find((u: any) => u.id === row.resolved_by)?.email ?? null,
        resolved_at: row.resolved_at ?? null,
        resolution_note: row.resolution_note ?? null,
        from_transaction_no: row.from_transaction_no ?? null,
        to_transaction_no: row.to_transaction_no ?? null,
        requisition_no: row.transactions?.requisition_no ?? null,
        transaction_type: row.transactions?.transaction_type ?? null,
      }))

      totalItems.value = requests.value.length
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch request history'
      requests.value = []
      totalItems.value = 0
    } finally {
      loading.value = false
    }
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