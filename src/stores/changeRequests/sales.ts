// Sales appliers: POS sale (void only) and remittance (edit only).

import { supabase } from '@/lib/supabase'
import { useSalesDataStore } from '@/stores/salesData'
import type { ApplyResult, ChangeRequestType, Diff } from './types'
import { stripReservedKeys, firstStaleField, staleError } from './helpers'

// ── POS sale ──────────────────────────────────────────────────────────────
// Reuse voidSale (restores stock, marks voided; the projection then books a
// sales_return so the GL reverses). Sales aren't edited — void + re-ring.
export async function applySaleChange(request: ChangeRequestType): Promise<ApplyResult> {
  if (request.request_type === 'edit')
    return { success: false, error: 'A sale cannot be edited — void it and re-ring instead.' }
  const salesStore = useSalesDataStore()
  const result = await salesStore.voidSale(
    request.transaction_id,
    request.reason ?? 'Voided via change request',
  )
  return result.success
    ? { success: true, resultRef: request.from_transaction_no ?? undefined }
    : { success: false, error: 'Failed to void the sale (it may already be remitted).' }
}

// ── Remittance ────────────────────────────────────────────────────────────
// Remittances are GL-silent (a cash-reconciliation artifact), so correcting
// the counted amount / notes in place is safe. Edit only — no void.
export async function applyRemittanceChange(request: ChangeRequestType): Promise<ApplyResult> {
  if (request.request_type === 'void')
    return {
      success: false,
      error: 'A remittance is corrected by editing the counted amount, not voided.',
    }
  const changes = stripReservedKeys(request.proposed_changes ?? {})
  const { data: cur } = await supabase
    .from('transactions')
    .select('remarks, remittance_details(actual_amount)')
    .eq('id', request.transaction_id)
    .eq('transaction_type', 'remittance')
    .maybeSingle()
  if (!cur) return { success: false, error: 'Remittance not found.' }
  const rd = (
    Array.isArray(cur.remittance_details) ? cur.remittance_details[0] : cur.remittance_details
  ) as { actual_amount?: unknown } | null
  const current: Record<string, unknown> = {
    actual_amount: rd?.actual_amount,
    notes: cur.remarks,
  }
  const stale = firstStaleField(changes, current)
  if (stale) return staleError(stale)
  const detailUpdate: Record<string, unknown> = {}
  const txUpdate: Record<string, unknown> = {}
  for (const [key, diff] of Object.entries(changes)) {
    const to = (diff as Diff).to
    if (key === 'actual_amount') detailUpdate.actual_amount = to
    else if (key === 'notes') txUpdate.remarks = to
  }
  if (Object.keys(detailUpdate).length) {
    const { error: e } = await supabase
      .from('remittance_details')
      .update(detailUpdate)
      .eq('transaction_id', request.transaction_id)
    if (e) return { success: false, error: e.message }
  }
  if (Object.keys(txUpdate).length) {
    const { error: e } = await supabase
      .from('transactions')
      .update(txUpdate)
      .eq('id', request.transaction_id)
    if (e) return { success: false, error: e.message }
  }
  return { success: true, resultRef: request.from_transaction_no ?? undefined }
}
