// Applying an approved request: dispatch by the document's transaction_type to
// the module-specific applier.

import { supabase } from '@/lib/supabase'
import type { ApplyResult, ChangeRequestType } from './types'
import { applyExpenseChange, applySupplierPaymentChange } from './finance'
import { applySaleChange, applyRemittanceChange } from './sales'
import { applyCollectionChange } from './collections'
import { applyPRChange } from './purchasing'

// ─── Apply dispatch ─────────────────────────────────────────────────────────
// Reuses each module's existing undo/reversal where possible. Dispatching is
// resolved at runtime by looking up the transaction_type from `transactions`,
// instead of storing it on the request row.
export async function applyChange(request: ChangeRequestType, userId: string): Promise<ApplyResult> {
  const txnType = await resolveTransactionType(request.transaction_id)
  if (!txnType) return { success: false, error: 'Transaction not found.' }

  switch (txnType) {
    case 'expense':
      return applyExpenseChange(request, userId)
    case 'supplier_payment':
      return applySupplierPaymentChange(request, userId)
    case 'sale':
      return applySaleChange(request)
    case 'remittance':
      return applyRemittanceChange(request)
    case 'inhouse_order':
      return applyCollectionChange(request, userId, 'inhouse')
    case 'ethical_order':
      return applyCollectionChange(request, userId, 'ethical')
    // NOTE: no 'journal_entry' case — that is not a transaction_type value.
    // A GL entry is a journal_entries row, so it can never satisfy
    // change_requests.transaction_id (FK → transactions.id); GL corrections
    // go through GeneralJournal.vue's direct reversal instead.
    case 'purchase_requisition':
    case 'purchase_order':
    case 'stock_in':
      return applyPRChange(request, userId)
    default:
      return {
        success: false,
        error: `Change requests for transaction type "${txnType}" are not enabled yet.`,
      }
  }
}

export async function resolveTransactionType(transactionId: number): Promise<string | null> {
  const { data } = await supabase
    .from('transactions')
    .select('transaction_type')
    .eq('id', transactionId)
    .maybeSingle()
  return data?.transaction_type ?? null
}
