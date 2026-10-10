// Expenses (transaction_type='expense'): the document list, recording a new
// expense against a cash account, and the soft void the change-request flow
// calls.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { generateNextNumber, insertWithDocRetry } from '@/utils/helpers'
import { legacyExpenseCategories, disbursementAccountClasses } from './types'
import type { DateRange, ExpenseCategory, ExpenseDepartment } from './types'
import { applyDateRange } from './helpers'
import { mapExpenseRow } from './mappers'
import { expenses, loading, handleError, clearError } from './state'
import { fetchCashAccounts } from './cashAccounts'

const toast = useToast()

// Resolved lazily rather than at import time: a store factory called while
// this module is first evaluated can run before Pinia is installed.
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())

export async function fetchExpenses(options: DateRange & { category?: ExpenseCategory } = {}) {
  loading.value = true
  clearError()
  try {
    // Category filter lives on the extension table, so filtering needs the
    // inner-join embed variant to drop non-matching parents. cash_account_id
    // is on the hub now (20260702000009), so its name join is top-level.
    // Voided expenses are deliberately INCLUDED here — this is the document
    // list, and the accountant wants reversed documents visible and flagged.
    // Every aggregate below (opex, liquidation, cash) excludes them instead.
    let q = supabase.from('transactions')
      .select(options.category
        ? '*, cash_account:cash_account_id(name), finance_details!inner(*)'
        : '*, cash_account:cash_account_id(name), finance_details(*)')
      .eq('transaction_type', 'expense')
    if (options.category) q = q.eq('finance_details.category', options.category)
    q = applyDateRange(q, 'paid_at', options)
    q = q.order('paid_at', { ascending: false })

    const { data, error: fetchError } = await q
    if (fetchError) throw fetchError
    expenses.value = (data || []).map(mapExpenseRow)
    return expenses.value
  } catch (err) {
    handleError(err, 'Failed to fetch expenses')
    return []
  } finally {
    loading.value = false
  }
}

// Header + finance_details + cash account debit (was record_expense).
// Best-effort, not atomic: a failure after the header insert can leave an
// expense with no cash deduction or vice versa (accepted trade-off,
// JS-over-RPC convention).
export async function recordExpense(payload: {
  category: ExpenseCategory
  amount: number
  paidTo?: string
  paymentMethod?: string
  valueDate?: string
  remarks?: string
  department?: ExpenseDepartment
  orSiNo?: string
  cashAccountId: number
}) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

  if (payload.amount <= 0) {
    toast.error('Expense amount must be positive.'); loading.value = false; return { success: false }
  }
  if (!payload.category) {
    toast.error('An expense account must be selected.'); loading.value = false; return { success: false }
  }
  // ExpenseCategory is `string` now, so "a value was chosen" is not enough:
  // a caller can pass a revenue code like 4010, or an unknown one, and it
  // lands in finance_details for the GL projector to mis-book. The picker
  // cannot protect this boundary — only the store can.
  //
  // Legacy slugs are accepted DELIBERATELY: the change-request reissue path
  // (financeChangeRequest / changeRequestsData) replays a historical expense
  // back through here, and rows written before categories became account
  // codes still carry 'utilities', 'supplies' and 'representation' on prod.
  // Rejecting those would make correcting an old expense impossible.
  if (!legacyExpenseCategories.some((c) => c.value === payload.category)) {
    // Read live rather than from glStore.accounts: that list is cached from
    // whenever a picker last loaded it, so an account deactivated since then
    // still passes. This is the write boundary — it asks the database what is
    // true now.
    const { data: account, error: accountLookupError } = await supabase
      .from('accounts')
      .select('code, class, subsection, is_active')
      .eq('code', payload.category)
      .maybeSingle()
    if (accountLookupError) {
      toast.error('Could not verify the expense account. The expense was not recorded.')
      loading.value = false
      return { success: false }
    }
    if (!account || !account.is_active) {
      toast.error(`${payload.category} is not an active account.`)
      loading.value = false
      return { success: false }
    }
    if (!(disbursementAccountClasses as readonly string[]).includes(account.class)) {
      // Revenue is the only class that lands here. Naming it beats a generic
      // rejection: the picker never offers it, so anything reaching this
      // point came from a replayed change request or a hand-built payload.
      toast.error(`${payload.category} is a revenue account — a disbursement cannot be charged to it.`)
      loading.value = false
      return { success: false }
    }
  }
  if (!payload.cashAccountId) {
    toast.error('A cash account must be selected.'); loading.value = false; return { success: false }
  }

  const { data: account, error: accountError } = await supabase
    .from('cash_accounts').select('balance').eq('id', payload.cashAccountId).maybeSingle()
  if (accountError || !account) {
    toast.error(`Cash account ${payload.cashAccountId} not found.`); loading.value = false; return { success: false }
  }
  if (payload.amount > account.balance + 0.005) {
    toast.error(`Insufficient balance in the selected account (available: ${account.balance}).`)
    loading.value = false; return { success: false }
  }

  const year = new Date().getFullYear().toString()
  const { data: created, docNo: expenseNo, error: insertError } = await insertWithDocRetry<{ id: number }>(
    () => generateNextNumber('expense_no', `EXP-${year}-`, ['reference_no']),
    async (docNo) => supabase
      .from('transactions')
      .insert({
        expense_no: docNo, transaction_type: 'expense', status: 'recorded',
        payment_method: payload.paymentMethod || null, subtotal: payload.amount, total_amount: payload.amount,
        paid_at: payload.valueDate || new Date().toISOString().slice(0, 10),
        remarks: payload.remarks || null, created_by: user.id, cash_account_id: payload.cashAccountId,
      })
      .select('id')
      .single(),
  )
  if (insertError || !created) {
    handleError(insertError, 'Failed to record expense.')
    toast.error(insertError?.message || 'Failed to record expense.')
    loading.value = false
    return { success: false }
  }

  const { error: detailsError } = await supabase.from('finance_details').insert({
    transaction_id: created.id, category: payload.category,
    paid_to: payload.paidTo || null, department: payload.department || null, or_si_no: payload.orSiNo || null,
  })
  if (detailsError) {
    handleError(detailsError, 'Failed to save expense details.')
    toast.error(detailsError.message || 'Failed to save expense details.')
    loading.value = false
    return { success: false }
  }

  const { error: balanceError } = await supabase
    .from('cash_accounts').update({ balance: account.balance - payload.amount }).eq('id', payload.cashAccountId)
  if (balanceError) console.warn('recordExpense: cash account balance update failed:', balanceError.message)

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'expense_record',
    description: `${expenseNo} | ${payload.category} | ${payload.amount}`, module: 'finance', transaction_id: created.id,
  })
  if (logError) console.warn('recordExpense: activity log insert failed:', logError.message)

  toast.success('Expense recorded.')
  await Promise.all([fetchExpenses(), fetchCashAccounts()])
  loading.value = false
  return { success: true, expenseId: created.id, expenseNo }
}

// Was delete_expense. Reverses the cash deduction record_expense made
// (expenses recorded before cash accounts existed have no cash_account_id —
// nothing to restore for those). finance_details row cascades on delete.
// Soft void — was deleteExpense, which hard-DELETEd the transactions row. Per
// the accountant a reversed document must stay on the books, flagged, so the
// number is never lost from the series and the reversing journal entry still
// has a source document to point at. The GL reversal is done by the caller
// (changeRequestsData.voidExpense); this handles the document + the cash.
export async function voidExpense(id: number, reason: string | null = null) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

  const { data: expense, error: fetchError } = await supabase
    .from('transactions')
    .select('expense_no, total_amount, cash_account_id, paid_at, status')
    .eq('id', id).eq('transaction_type', 'expense')
    .maybeSingle()
  if (fetchError || !expense) {
    toast.error(`Expense ${id} not found.`); loading.value = false; return { success: false }
  }
  if (expense.status === 'voided') {
    toast.warning('This expense is already voided.'); loading.value = false; return { success: false }
  }

  // Stamp the void first, guarded on status — it is what removes the
  // expense from every financial aggregate, so it must land before the
  // compensating cash restore. Doing the restore first (as the old delete
  // path once did) credited money back for an expense still on the books.
  // (transactions.voided_at/voided_by/void_reason were dropped from the
  // schema — status='voided' is the only signal now; the who/when/why now
  // lives on the linked change_requests row instead.)
  const { data: voided, error: voidError } = await supabase.from('transactions')
    .update({ status: 'voided' })
    .eq('id', id).eq('transaction_type', 'expense').neq('status', 'voided')
    .select('id')
  if (voidError) {
    handleError(voidError, 'Failed to void expense.')
    toast.error(voidError.message || 'Failed to void expense.')
    loading.value = false
    return { success: false }
  }
  if (!voided?.length) {
    toast.warning('This expense is already voided.'); loading.value = false; return { success: false }
  }

  if (expense.cash_account_id && (expense.total_amount ?? 0) > 0) {
    const { data: account } = await supabase
      .from('cash_accounts').select('balance').eq('id', expense.cash_account_id).maybeSingle()
    if (account) {
      const { error: balanceError } = await supabase
        .from('cash_accounts').update({ balance: account.balance + (expense.total_amount ?? 0) }).eq('id', expense.cash_account_id)
      if (balanceError) console.warn('voidExpense: cash account balance restore failed:', balanceError.message)
    }
  }

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'expense_void',
    description: `${expense.expense_no ?? id} voided${reason ? `: ${reason}` : ''}`,
    module: 'finance', transaction_id: id,
  })
  if (logError) console.warn('voidExpense: activity log insert failed:', logError.message)

  // No P&L cache to refresh: the dashboards read the General Ledger now, and
  // the void's reversing entry is picked up by the ledger projection.

  toast.success('Expense voided.')
  await Promise.all([fetchExpenses(), fetchCashAccounts()])
  loading.value = false
  return { success: true }
}
