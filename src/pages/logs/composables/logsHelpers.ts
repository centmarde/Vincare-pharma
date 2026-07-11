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
  if (lower.includes('purchase_order') || lower.includes('po') || lower.includes('order')) return 'indigo'
  if (lower.includes('stock_in') || lower.includes('stock in')) return 'teal'
  if (lower.includes('stock_out') || lower.includes('stock out')) return 'orange'
  if (lower.includes('sale') && !lower.includes('sales_return') && !lower.includes('return')) return 'green'
  if (lower.includes('transfer')) return 'blue'
  if (lower.includes('expense')) return 'red'
  if (lower.includes('purchase_return')) return 'purple'
  if (lower.includes('sales_return') || lower.includes('return')) return 'pink'
  return 'grey'
}
