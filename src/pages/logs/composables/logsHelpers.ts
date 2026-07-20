import type { LogType } from '@/stores/logsData'

/**
 * Returns the appropriate document number for a log entry based on its module.
 * - purchase_requisition → requisition_no (fallback to reference_no)
 * - purchase_order → po_no (fallback to reference_no)
 * - Everything else → reference_no
 */
export function getReferenceLabel(log: LogType): string | null {
  const module = (log.module ?? '').toLowerCase().trim()
  // For purchase_requisition, prefer requisition_no over reference_no
  if (module === 'purchase_requisition') {
    return log.requisition_no ?? log.reference_no ?? null
  }
  // For purchase_order, prefer po_no over reference_no
  if (module === 'purchase_order') {
    return log.po_no ?? log.reference_no ?? null
  }
  // Default: use reference_no
  return log.reference_no ?? null
}

/**
 * Returns a Vuetify color for a log action.
 */
export function getActionColor(action: string | null): string {
  if (!action) return 'grey'
  const lower = action.toLowerCase()
  // Change requests + voids read before the generic rules below, which would
  // otherwise miss them ('change_requested' has no keyword match at all).
  if (lower === 'change_requested') return 'orange'
  if (lower.includes('void')) return 'error'
  if (lower.includes('submit') || lower.includes('create')) return 'success'
  if (lower.includes('update') || lower.includes('edit')) return 'info'
  if (lower.includes('delete') || lower.includes('remove')) return 'error'
  if (lower.includes('approve')) return 'primary'
  if (lower.includes('reject')) return 'warning'
  return 'grey'
}

/**
 * Returns a Vuetify color for a log module.
 */
export function getModuleColor(module: string | null): string {
  if (!module) return 'grey'
  const lower = module.toLowerCase()
  if (lower.includes('purchase_requisition') || lower.includes('requisition')) return 'purple'
  if (lower.includes('purchase_order') || lower.includes('po')) return 'red'
  if (lower.includes('stock_in') || lower.includes('stock in')) return 'teal'
  if (lower.includes('stock_out') || lower.includes('stock out')) return 'orange'
  if (lower.includes('sale') && !lower.includes('sales_return') && !lower.includes('return') && !lower.includes('pos')) return 'green'
  if (lower.includes('transfer')) return 'blue'
  if (lower.includes('reorder')) return 'yellow'
  if (lower.includes('expense')) return 'deep-orange'
  if (lower.includes('purchase_return')) return 'purple'
  if (lower.includes('sales_return') || lower.includes('return')) return 'pink'
  if (lower.includes('warehouse')) return 'brown'
  if (lower.includes('ethical')) return 'teal'
  if (lower.includes('pos')) return 'cyan'
  return 'grey'
}

/**
 * Returns a Material Design icon name for a timeline dot based on the action.
 */
export function getTimelineIcon(action: string | null): string {
  if (!action) return 'mdi-circle-small'
  const lower = action.toLowerCase()
  if (lower === 'change_requested') return 'mdi-file-document-edit-outline'
  if (lower.includes('void')) return 'mdi-cancel'
  if (lower.includes('submit') || lower.includes('create')) return 'mdi-plus-circle-outline'
  if (lower.includes('update') || lower.includes('edit')) return 'mdi-pencil-circle-outline'
  if (lower.includes('delete') || lower.includes('remove')) return 'mdi-delete-circle-outline'
  if (lower.includes('approve')) return 'mdi-check-circle-outline'
  if (lower.includes('reject')) return 'mdi-close-circle-outline'
  if (lower.includes('cancel')) return 'mdi-cancel'
  if (lower.includes('send') || lower.includes('issue')) return 'mdi-send-circle-outline'
  if (lower.includes('print')) return 'mdi-printer-outline'
  if (lower.includes('view') || lower.includes('read')) return 'mdi-eye-circle-outline'
  if (lower.includes('procurement_requested') || lower.includes('procurement')) return 'mdi-clipboard-text-clock-outline'
  if (lower.includes('agree')) return 'mdi-handshake-outline'
  if (lower.includes('reorder_request') || lower.includes('reorder')) return 'mdi-cart-outline'
  return 'mdi-circle-small'
}

/**
 * Returns the most relevant text description for the timeline opposite slot (date/time).
 */
export function getTimelineDate(log: LogType): string {
  if (!log.created_at) return ''
  const date = new Date(log.created_at)
  // Return a short date for the opposite side
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Returns the time portion for the timeline opposite slot.
 */
export function getTimelineTime(log: LogType): string {
  if (!log.created_at) return ''
  const date = new Date(log.created_at)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
