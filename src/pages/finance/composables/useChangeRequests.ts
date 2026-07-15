import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useChangeRequestsDataStore } from '@/stores/changeRequestsData'
import { useConfirmDialog } from '@/composables/useConfirmDialog'

const { confirmDialog } = useConfirmDialog()

export function useChangeRequests() {
  const store = useChangeRequestsDataStore()
  const { requests, loading } = storeToRefs(store)

  async function init() {
    await store.fetchRequests({ status: 'pending' })
  }

  async function approve(id: number) {
    const req = requests.value.find((r) => r.id === id)
    if (!req) return
    const summary = req.summary ?? `${req.request_type} ${req.target_ref ?? '#' + req.target_id}`
    const ok = await confirmDialog(
      `${req.request_type === 'void' ? 'Undo / Void' : 'Edit'} — ${req.target_ref ?? '#' + req.target_id}\n\n${summary}\n\nReason: ${req.reason ?? '—'}`,
      { title: 'Approve & Apply Change', confirmText: 'Approve & Apply' },
    )
    if (!ok) return
    await store.approveRequest(id)
  }

  async function reject(id: number) {
    const req = requests.value.find((r) => r.id === id)
    if (!req) return
    const ok = await confirmDialog(
      `Reject the ${req.request_type} request for ${req.target_ref ?? '#' + req.target_id}? The document will be left unchanged.`,
      { title: 'Reject Change Request', confirmText: 'Reject' },
    )
    if (!ok) return
    await store.rejectRequest(id, 'Rejected by approver.')
  }

  onMounted(init)

  return { requests, loading, init, approve, reject }
}
