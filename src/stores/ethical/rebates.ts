// Rebate payout workflow: the approval queue, approve / reject (reversing the
// accrual), and recording the payout against a cash account.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useGLDataStore } from '@/stores/glData'
import { glAccountCodeFor } from '@/stores/financeData'
import type { RebatePaymentMethod } from './types'
import { selectOrder, mapRow } from './mappers'
import { rebateQueue, loading, handleError, clearError } from './state'

const toast = useToast()

// Resolved lazily rather than at import time: a store factory called while
// this module is first evaluated can run before Pinia is installed.
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())
let glStore: ReturnType<typeof useGLDataStore> | null = null
const getGLStore = () => (glStore ??= useGLDataStore())

// ---- Rebate payout workflow ---------------------------------------------
// A rebate is earned per order, falls due only once that order is paid IN
// FULL, and always needs approval before cash goes out. It's paid to the
// client's purchaser (an individual), so it's a selling expense (6030), never
// a discount off the invoice.

// Orders whose rebate is live: fully paid, has a rebate, not yet settled or
// rejected. rebate_status is null for orders paid before this workflow
// existed, so treat null-on-a-paid-order as pending rather than stranding it.
export async function fetchRebateQueue() {
  loading.value = true
  clearError()
  try {
    const { data, error: fetchError } = await supabase
      .from('transactions')
      .select(selectOrder)
      .eq('transaction_type', 'ethical_order')
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
    if (fetchError) throw fetchError
    rebateQueue.value = (data ?? [])
      .map(mapRow)
      .filter(o => (o.rebate_amount ?? 0) > 0
        && o.rebate_status !== 'paid'
        && o.rebate_status !== 'rejected')
    return rebateQueue.value
  } catch (err) {
    handleError(err, 'Failed to fetch rebate queue.')
    toast.error('Failed to fetch rebate queue.')
    return []
  } finally {
    loading.value = false
  }
}

// Guarded on the current status so a stale/duplicate click can't re-approve or
// approve something already paid out.
export async function approveRebate(orderId: number) {
  loading.value = true
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

  const { data: updated, error: updateError } = await supabase
    .from('ethical_details')
    .update({ rebate_status: 'approved', rebate_approved_by: user.id, rebate_approved_at: new Date().toISOString() })
    .eq('transaction_id', orderId)
    .eq('rebate_status', 'pending_approval')
    .select('id')
  if (updateError) {
    handleError(updateError, 'Failed to approve rebate.')
    toast.error(updateError.message || 'Failed to approve rebate.')
    loading.value = false; return { success: false }
  }
  if (!updated?.length) {
    toast.warning('Rebate is no longer pending approval — refresh and try again.')
    loading.value = false; return { success: false }
  }

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'rebate_approved',
    description: 'Rebate approved for payout', module: 'ethical', transaction_id: orderId,
  })
  if (logError) console.warn('approveRebate: activity log insert failed:', logError.message)

  toast.success('Rebate approved.')
  await fetchRebateQueue()
  loading.value = false
  return { success: true }
}

// Rejecting reverses the accrual posted at full payment — otherwise 6030 keeps
// an expense for money that will never be paid.
export async function rejectRebate(orderId: number, reason: string) {
  loading.value = true
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

  const { data: order } = await supabase
    .from('transactions')
    .select('ethical_no, ethical_details(rebate_amount)')
    .eq('id', orderId)
    .maybeSingle()
  const rebateAmount = (order?.ethical_details as unknown as { rebate_amount: number | null } | null)?.rebate_amount ?? 0

  const { data: updated, error: updateError } = await supabase
    .from('ethical_details')
    .update({ rebate_status: 'rejected', rebate_rejected_reason: reason, rebate_approved_by: user.id, rebate_approved_at: new Date().toISOString() })
    .eq('transaction_id', orderId)
    .eq('rebate_status', 'pending_approval')
    .select('id')
  if (updateError) {
    handleError(updateError, 'Failed to reject rebate.')
    toast.error(updateError.message || 'Failed to reject rebate.')
    loading.value = false; return { success: false }
  }
  if (!updated?.length) {
    toast.warning('Rebate is no longer pending approval — refresh and try again.')
    loading.value = false; return { success: false }
  }

  if (rebateAmount > 0) {
    const glResult = await getGLStore().postJournalEntry(
      new Date().toISOString().slice(0, 10),
      'accrual',
      orderId,
      `Rebate rejected — reversing accrual on order ${order?.ethical_no ?? orderId}`,
      [
        { account_code: '2020', debit: rebateAmount, credit: 0, memo: 'Reverse rebate payable — rejected' },
        { account_code: '6030', debit: 0, credit: rebateAmount, memo: 'Reverse computed rebate — rejected' },
      ],
      user.id,
    )
    if (!glResult.success) {
      console.warn('rejectRebate: accrual reversal failed:', glResult.error)
      toast.warning('Rebate rejected, but the GL reversal did not post — verify with Finance.')
    }
  }

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'rebate_rejected',
    description: `Rebate rejected: ${reason}`, module: 'ethical', transaction_id: orderId,
  })
  if (logError) console.warn('rejectRebate: activity log insert failed:', logError.message)

  toast.success('Rebate rejected.')
  await fetchRebateQueue()
  loading.value = false
  return { success: true }
}

// Disburse an approved rebate. paidTo + reference are required support: the
// recipient is an individual and the customer's owner may never acknowledge
// it, so our own record is the only backing for the 6030 deduction.
export async function payRebate(payload: {
  orderId: number
  method: RebatePaymentMethod
  reference?: string
  paidTo: string
  cashAccountId: number
}) {
  loading.value = true
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }
  if (!payload.paidTo?.trim()) { toast.warning('Record who received the rebate.'); loading.value = false; return { success: false } }

  const { data: order } = await supabase
    .from('transactions')
    .select('ethical_no, ethical_details(rebate_amount)')
    .eq('id', payload.orderId)
    .maybeSingle()
  const rebateAmount = (order?.ethical_details as unknown as { rebate_amount: number | null } | null)?.rebate_amount ?? 0

  const { data: account } = await supabase
    .from('cash_accounts').select('id, name, classification, balance, gl_account_code').eq('id', payload.cashAccountId).maybeSingle()
  if (!account) { toast.error('Cash account not found.'); loading.value = false; return { success: false } }

  const nowIso = new Date().toISOString()
  const { data: updated, error: updateError } = await supabase
    .from('ethical_details')
    .update({
      rebate_status: 'paid', rebate_paid_at: nowIso, rebate_payment_method: payload.method,
      rebate_reference: payload.reference || null, rebate_paid_to: payload.paidTo.trim(),
      rebate_cash_account_id: payload.cashAccountId,
    })
    .eq('transaction_id', payload.orderId)
    .eq('rebate_status', 'approved')
    .select('id')
  if (updateError) {
    handleError(updateError, 'Failed to record rebate payout.')
    toast.error(updateError.message || 'Failed to record rebate payout.')
    loading.value = false; return { success: false }
  }
  if (!updated?.length) {
    toast.warning('Rebate is not approved for payout — refresh and try again.')
    loading.value = false; return { success: false }
  }

  // Settle the liability against the funding account:
  //   DR 2020 Accrued Expenses / CR whichever asset account the cash sits in.
  // Was an inline two-way map that had drifted from the shared one — it sent
  // time deposits to 1020 instead of 1100.
  const cashCode = glAccountCodeFor(account)
  const glResult = await getGLStore().postJournalEntry(
    nowIso.slice(0, 10),
    'disbursement',
    payload.orderId,
    `Rebate paid to ${payload.paidTo.trim()} for order ${order?.ethical_no ?? payload.orderId} via ${payload.method}${payload.reference ? ` (${payload.reference})` : ''}`,
    [
      { account_code: '2020', debit: rebateAmount, credit: 0, memo: 'Settle rebate payable' },
      { account_code: cashCode, debit: 0, credit: rebateAmount, memo: `Rebate payout via ${payload.method}` },
    ],
    user.id,
  )
  if (!glResult.success) {
    console.warn('payRebate: disbursement posting failed:', glResult.error)
    toast.warning('Rebate marked paid, but the GL entry did not post — verify with Finance.')
  }

  const { error: balanceError } = await supabase
    .from('cash_accounts')
    .update({ balance: (account.balance ?? 0) - rebateAmount })
    .eq('id', payload.cashAccountId)
  if (balanceError) console.warn('payRebate: cash account balance update failed:', balanceError.message)

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'rebate_paid',
    description: `Rebate of ${rebateAmount} paid to ${payload.paidTo.trim()} via ${payload.method}${payload.reference ? ` ref ${payload.reference}` : ''}`,
    module: 'ethical', transaction_id: payload.orderId,
  })
  if (logError) console.warn('payRebate: activity log insert failed:', logError.message)

  toast.success('Rebate payout recorded.')
  await fetchRebateQueue()
  loading.value = false
  return { success: true }
}
