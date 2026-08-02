import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useAuthUserStore } from '@/stores/authUser'
import type { RequestHistoryItem } from '@/pages/executive/composables/useRequestHistory'

export const useHistoryDataStore = defineStore('historyData', () => {
  const authStore = useAuthUserStore()

  const requests = ref<RequestHistoryItem[]>([])
  const loading = ref(false)
  const error = ref('')

  async function fetchHistory() {
    loading.value = true
    error.value = ''
    try {
      if (!authStore.users.length) await authStore.getAllUsers()

      // ── Source 1: undo change-requests (unchanged from old useRequestHistory) ──
      const { data: crData, error: crError } = await supabase
        .from('change_requests')
        .select(`*, transactions!inner ( requisition_no, reference_no, transaction_type )`)
        .in('status', ['approved', 'rejected'])
        .eq('transactions.transaction_type', 'purchase_requisition')
        .order('resolved_at', { ascending: false })

      if (crError) throw crError

      const crRequests: RequestHistoryItem[] = (crData || []).map((row: any) => ({
        id: row.id,
        source: 'change_request',
        created_at: row.created_at,
        transaction_id: row.transaction_id,
        request_type: row.request_type,
        summary: row.summary ?? null,
        reason: row.reason ?? null,
        status: row.status as 'approved' | 'rejected',
        created_by: row.created_by ?? null,
        created_by_email: authStore.users.find((u: any) => u.id === row.created_by)?.email ?? null,
        resolved_by: row.resolved_by ?? null,
        resolved_by_email: authStore.users.find((u: any) => u.id === row.resolved_by)?.email ?? null,
        resolved_at: row.resolved_at ?? null,
        resolution_note: row.resolution_note ?? null,
        from_transaction_no: row.from_transaction_no ?? null,
        to_transaction_no: row.to_transaction_no ?? null,
        requisition_no: row.transactions?.requisition_no ?? null,
        transaction_type: row.transactions?.transaction_type ?? null,
      }))

      // ── Source 2: PR approvals/rejections, logged via executiveApproveData ──
      const { data: logData, error: logError } = await supabase
        .from('logs')
        .select(`*, transactions!inner ( requisition_no, reference_no, transaction_type )`)
        .eq('module', 'purchase_requisition')
        .in('action', ['pr_approved', 'pr_rejected'])
        .eq('transactions.transaction_type', 'purchase_requisition')
        .order('created_at', { ascending: false })

      if (logError) throw logError

      const logRequests: RequestHistoryItem[] = (logData || []).map((row: any) => {
        // requisition_no only gets populated once a PO is issued; before
        // that, reference_no ("PR-2026-036") is the PR's live identifier.
        const prRef = row.transactions?.requisition_no ?? row.transactions?.reference_no ?? null
        const isApproved = row.action === 'pr_approved'

        return {
          id: row.id,
          source: 'log',
          created_at: row.created_at,
          transaction_id: row.transaction_id,
          request_type: 'pr_approval',
          summary: prRef
            ? `Purchase Requisition ${isApproved ? 'Approved' : 'Rejected'} ${prRef}`
            : null,
          reason: null,
          status: isApproved ? 'approved' : 'rejected',
          created_by: row.created_by ?? null,
          created_by_email: authStore.users.find((u: any) => u.id === row.created_by)?.email ?? null,
          resolved_by: row.created_by ?? null,
          resolved_by_email: authStore.users.find((u: any) => u.id === row.created_by)?.email ?? null,
          resolved_at: row.created_at,
          resolution_note: row.description ?? null,
          from_transaction_no: null,
          to_transaction_no: null,
          requisition_no: prRef,
          transaction_type: row.transactions?.transaction_type ?? null,
        }
      })

      requests.value = [...crRequests, ...logRequests].sort((a, b) => {
        const aDate = a.resolved_at ?? a.created_at
        const bDate = b.resolved_at ?? b.created_at
        return new Date(bDate).getTime() - new Date(aDate).getTime()
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch request history'
      requests.value = []
    } finally {
      loading.value = false
    }
  }

  return { requests, loading, error, fetchHistory }
})