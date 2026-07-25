import type { RequestHistoryItem } from '../composables/useRequestHistory'

export function getStatusColor(status: string): string {
  return status === 'approved' ? 'green' : 'red'
}

export function getStatusIcon(status: string): string {
  return status === 'approved' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline'
}

export function getStatusLabel(status: string): string {
  return status === 'approved' ? 'Approved' : 'Rejected'
}

export function getRequestTypeLabel(type: string): string {
  switch (type) {
    case 'undo_pr':
      return 'Undo PR'
    case 'pr_approval':
      return 'PR Approval'
    case 'void':
      return 'Void'
    case 'edit':
      return 'Edit'
    default:
      return type
  }
}

export function getRequisitionRef(req: RequestHistoryItem): string {
  const ref = req.requisition_no
  if (ref) return ref
  const from = req.from_transaction_no
  if (from) return from
  return `#${req.transaction_id}`
}
