// Finance appliers: expense and supplier payment — void, memo-only edit in
// place, or reverse + reissue for a ledger edit.

import { supabase } from '@/lib/supabase'
import { useFinanceDataStore } from '@/stores/financeData'
import type { ExpenseCategory, ExpenseDepartment } from '@/stores/financeData'
import type { ApplyResult, ChangeRequestType, Diff } from './types'
import {
  stripReservedKeys,
  toVal,
  firstStaleField,
  staleError,
  correctionDate,
  reissueReason,
  reissueRemarks,
} from './helpers'
import { reverseProjectedEntry } from './ledger'

const EXPENSE_LEDGER_KEYS = new Set(['amount', 'category', 'cash_account_id', 'paid_at'])
const EXPENSE_MEMO_TX_KEYS = new Set(['payment_method', 'remarks'])
const EXPENSE_MEMO_DETAIL_KEYS = new Set(['paid_to', 'department', 'or_si_no'])

// Reverse the expense's projected GL entry (if booked), then soft-void the
// document and restore the cash account. The row stays, flagged.
export async function voidExpense(
  targetId: number,
  userId: string,
  reason: string | null,
): Promise<{ success: boolean; error?: string }> {
  const financeStore = useFinanceDataStore()
  const rev = await reverseProjectedEntry('disbursement', targetId, userId)
  if (!rev.ok)
    return { success: false, error: rev.error || 'Failed to reverse the expense journal entry.' }
  const result = await financeStore.voidExpense(targetId, reason)
  return result.success
    ? { success: true }
    : {
        success: false,
        error: 'Failed to void the expense (GL already reversed — please retry).',
      }
}

export async function applyExpenseChange(
  request: ChangeRequestType,
  userId: string,
): Promise<ApplyResult> {
  if (request.request_type === 'void') {
    const v = await voidExpense(request.transaction_id, userId, request.reason)
    return v.success ? { success: true, resultRef: request.from_transaction_no ?? undefined } : v
  }

  // EDIT — read live state (for the stale-guard + the reissue base).
  const changes = stripReservedKeys(request.proposed_changes ?? {})
  const { data: cur } = await supabase
    .from('transactions')
    .select(
      'total_amount, cash_account_id, paid_at, payment_method, remarks, status, finance_details(category, paid_to, department, or_si_no)',
    )
    .eq('id', request.transaction_id)
    .eq('transaction_type', 'expense')
    .maybeSingle()
  if (!cur) return { success: false, error: 'Expense not found.' }
  if (cur.status === 'voided') return { success: false, error: 'This expense has already been voided.' }
  const fd = ((Array.isArray(cur.finance_details)
    ? cur.finance_details[0]
    : cur.finance_details) ?? {}) as Record<string, unknown>
  const current: Record<string, unknown> = {
    amount: cur.total_amount,
    cash_account_id: cur.cash_account_id,
    paid_at: (cur.paid_at ?? '').slice(0, 10),
    payment_method: cur.payment_method,
    remarks: cur.remarks,
    category: fd.category,
    paid_to: fd.paid_to,
    department: fd.department,
    or_si_no: fd.or_si_no,
  }
  const stale = firstStaleField(changes, current)
  if (stale) return staleError(stale)

  // Memo-only edit → update in place (same document).
  if (!Object.keys(changes).some((k) => EXPENSE_LEDGER_KEYS.has(k))) {
    const txUpdate: Record<string, unknown> = {},
      detailUpdate: Record<string, unknown> = {}
    for (const [key, diff] of Object.entries(changes)) {
      const to = (diff as Diff).to
      if (EXPENSE_MEMO_TX_KEYS.has(key)) txUpdate[key] = to
      else if (EXPENSE_MEMO_DETAIL_KEYS.has(key)) detailUpdate[key] = to
    }
    if (Object.keys(txUpdate).length) {
      const { error: e } = await supabase
        .from('transactions')
        .update(txUpdate)
        .eq('id', request.transaction_id)
      if (e) return { success: false, error: e.message }
    }
    if (Object.keys(detailUpdate).length) {
      const { error: e } = await supabase
        .from('finance_details')
        .update(detailUpdate)
        .eq('transaction_id', request.transaction_id)
      if (e) return { success: false, error: e.message }
    }
    return { success: true, resultRef: request.from_transaction_no ?? undefined }
  }

  // Ledger edit → reverse the old expense + reissue a corrected one.
  // The replacement is dated at the CORRECTION date, not the original value
  // date, so a correction never posts back into an already-reported period
  // (unless the edit is explicitly changing paid_at itself).
  const financeStore = useFinanceDataStore()
  const merged = {
    category: (toVal(changes, 'category') ?? fd.category) as ExpenseCategory,
    amount: Number(toVal(changes, 'amount') ?? cur.total_amount ?? 0),
    paidTo: ((toVal(changes, 'paid_to') ?? fd.paid_to) as string | undefined) || undefined,
    paymentMethod:
      ((toVal(changes, 'payment_method') ?? cur.payment_method) as string | undefined) ||
      undefined,
    valueDate:
      ((toVal(changes, 'paid_at') ?? correctionDate()) as string | undefined) || undefined,
    remarks: reissueRemarks(request, toVal(changes, 'remarks') ?? cur.remarks),
    department:
      ((toVal(changes, 'department') ?? fd.department) as ExpenseDepartment | undefined) ||
      undefined,
    orSiNo: ((toVal(changes, 'or_si_no') ?? fd.or_si_no) as string | undefined) || undefined,
    cashAccountId: Number(toVal(changes, 'cash_account_id') ?? cur.cash_account_id),
  }
  const v = await voidExpense(request.transaction_id, userId, reissueReason(request))
  if (!v.success) return v
  const res = await financeStore.recordExpense(merged)
  if (!res.success)
    return {
      success: false,
      error:
        'Old expense voided, but reissuing the corrected expense failed — please re-record it manually.',
    }
  return { success: true, resultId: res.expenseId, resultRef: res.expenseNo ?? undefined }
}

// ── Supplier payment ──────────────────────────────────────────────────────
// Projects as 'disbursement' (DR AP / CR cash). Void reverses that + restores
// suppliers.balance (which reissueSupplierPayment decremented) + deletes the
// row. Edit is memo-only; amount/supplier changes go through void + re-record.
// Reverse the payment's disbursement entry + restore suppliers.balance, then
// soft-void the document (it stays on the books, flagged).
export async function voidSupplierPayment(
  targetId: number,
  userId: string,
  reason: string | null,
): Promise<{ success: boolean; error?: string }> {
  const { data: pay } = await supabase
    .from('transactions')
    .select('supplier_id, total_amount, status, cash_account_id')
    .eq('id', targetId)
    .eq('transaction_type', 'supplier_payment')
    .maybeSingle()
  if (!pay) return { success: false, error: 'Supplier payment not found.' }
  if (pay.status === 'voided') return { success: false, error: 'This payment has already been voided.' }
  const voidedCashAccountId = pay.cash_account_id as number | null
  const voidedAmount = (pay.total_amount ?? 0) as number
  const rev = await reverseProjectedEntry('disbursement', targetId, userId)
  if (!rev.ok)
    return { success: false, error: rev.error || 'Failed to reverse the payment journal entry.' }

  // Void marker first: it is what excludes the payment from every AP read, so
  // it must land before the compensating balance restore (otherwise a failure
  // between the two would credit the supplier back for a payment still live).
  // (transactions.voided_at/voided_by/void_reason were dropped from the
  // schema — status='voided' is the only signal now.)
  const { error: voidErr } = await supabase
    .from('transactions')
    .update({ status: 'voided' })
    .eq('id', targetId)
    .eq('transaction_type', 'supplier_payment')
    .neq('status', 'voided')
  if (voidErr) return { success: false, error: voidErr.message }

  if (pay.supplier_id) {
    const { data: s } = await supabase
      .from('suppliers')
      .select('balance')
      .eq('id', pay.supplier_id)
      .maybeSingle()
    if (s) {
      const { error: e } = await supabase
        .from('suppliers')
        .update({ balance: (s.balance ?? 0) + (pay.total_amount ?? 0) })
        .eq('id', pay.supplier_id)
      if (e) console.warn('voidSupplierPayment: suppliers.balance restore failed:', e.message)
    }
  }

  // Put the cash back. Voucher-raised payments DEDUCT from a cash account, so
  // voiding one without restoring it leaves the account permanently short by
  // the voided amount. The old in-page payment dialog never touched cash at
  // all, which is why this restore did not exist before. Mirrors voidExpense.
  if (voidedCashAccountId && voidedAmount > 0) {
    const { data: account } = await supabase
      .from('cash_accounts').select('balance').eq('id', voidedCashAccountId).maybeSingle()
    if (account) {
      const { error: e } = await supabase
        .from('cash_accounts')
        .update({ balance: (account.balance ?? 0) + voidedAmount })
        .eq('id', voidedCashAccountId)
      if (e) console.warn('voidSupplierPayment: cash account balance restore failed:', e.message)
    }
  }
  return { success: true }
}

export async function applySupplierPaymentChange(
  request: ChangeRequestType,
  userId: string,
): Promise<ApplyResult> {
  if (request.request_type === 'void') {
    const v = await voidSupplierPayment(request.transaction_id, userId, request.reason)
    return v.success ? { success: true, resultRef: request.from_transaction_no ?? undefined } : v
  }

  const changes = stripReservedKeys(request.proposed_changes ?? {})
  const { data: cur } = await supabase
    .from('transactions')
    .select('supplier_id, total_amount, payment_method, paid_at, remarks, status, cash_account_id')
    .eq('id', request.transaction_id)
    .eq('transaction_type', 'supplier_payment')
    .maybeSingle()
  if (!cur) return { success: false, error: 'Supplier payment not found.' }
  if (cur.status === 'voided') return { success: false, error: 'This payment has already been voided.' }
  const current: Record<string, unknown> = {
    amount: cur.total_amount,
    payment_method: cur.payment_method,
    remarks: cur.remarks,
  }
  const stale = firstStaleField(changes, current)
  if (stale) return staleError(stale)

  // Memo-only (method/remarks) → in place.
  if (!('amount' in changes)) {
    const txUpdate: Record<string, unknown> = {}
    for (const [key, diff] of Object.entries(changes)) {
      if (key === 'payment_method' || key === 'remarks') txUpdate[key] = (diff as Diff).to
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

  // Amount edit → reverse + reissue, dated at the correction date.
  const financeStore = useFinanceDataStore()
  const merged = {
    supplierId: Number(cur.supplier_id),
    amount: Number(toVal(changes, 'amount') ?? cur.total_amount ?? 0),
    paymentMethod:
      ((toVal(changes, 'payment_method') ?? cur.payment_method) as string | undefined) ||
      undefined,
    valueDate: correctionDate(),
    // Carried forward or the replacement loses its cash account, and the GL
    // credits 1020 instead of whatever actually paid.
    cashAccountId: cur.cash_account_id ?? null,
    remarks: reissueRemarks(request, toVal(changes, 'remarks') ?? cur.remarks),
  }
  const v = await voidSupplierPayment(request.transaction_id, userId, reissueReason(request))
  if (!v.success) return v
  const res = await financeStore.reissueSupplierPayment(merged)
  if (!res.success)
    return {
      success: false,
      error:
        'Old payment voided, but reissuing the corrected payment failed — please re-record it manually.',
    }
  return { success: true, resultId: res.paymentId, resultRef: res.paymentNo ?? undefined }
}
