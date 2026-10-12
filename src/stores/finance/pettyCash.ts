// Petty cash / revolving fund replenishment: the request (with its liquidation
// preview), approval (moves the float from the funding bank account) and
// rejection.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { nextDocNumber, insertWithDocRetry } from '@/utils/helpers'
import type { LiquidationReportItem } from './types'
import { mapReplenishmentRow } from './mappers'
import { replenishmentRequests, loading, handleError, clearError } from './state'
import { fetchCashAccounts } from './cashAccounts'

const toast = useToast()

// Resolved lazily rather than at import time: a store factory called while
// this module is first evaluated can run before Pinia is installed.
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())

export async function fetchReplenishmentRequests() {
  loading.value = true
  clearError()
  try {
    const { data, error: fetchError } = await supabase.from('transactions')
      .select('*, cash_account:cash_account_id(name), funding_account:funding_account_id(name)')
      .eq('transaction_type', 'petty_cash_replenishment')
      .order('created_at', { ascending: false })
    if (fetchError) throw fetchError
    replenishmentRequests.value = ((data || []) as any[]).map(mapReplenishmentRow)
    return replenishmentRequests.value
  } catch (err) {
    handleError(err, 'Failed to fetch replenishment requests')
    return []
  } finally {
    loading.value = false
  }
}

// Same window the RPC itself uses (since last approved replenishment for
// this account, or all-time if never replenished) — lets the requester
// review what they're about to submit before committing.
export async function previewPettyCashLiquidation(cashAccountId: number) {
  try {
    // cash_account_id filters on the hub now (20260702000009); the scalar
    // fields (category/paid_to/or_si_no) still come from finance_details.
    const { data: lastApproved } = await supabase.from('transactions')
      .select('approved_at')
      .eq('transaction_type', 'petty_cash_replenishment')
      .eq('cash_account_id', cashAccountId)
      .eq('status', 'approved')
      .order('approved_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let q = supabase.from('transactions')
      .select('expense_no, total_amount, paid_at, finance_details(category, paid_to, or_si_no)')
      .eq('transaction_type', 'expense')
      .eq('cash_account_id', cashAccountId)
      .neq('status', 'voided')   // a voided expense had its cash restored
    if (lastApproved?.approved_at) q = q.gt('created_at', lastApproved.approved_at)
    q = q.order('paid_at', { ascending: true })

    const { data, error: fetchError } = await q
    if (fetchError) throw fetchError
    const rows: LiquidationReportItem[] = ((data || []) as any[]).map((r) => ({
      reference_no: r.expense_no,
      category: r.finance_details?.category ?? null,
      paid_to: r.finance_details?.paid_to ?? null,
      or_si_no: r.finance_details?.or_si_no ?? null,
      amount: r.total_amount ?? 0,
      paid_at: r.paid_at,
    }))
    const total = rows.reduce((sum, r) => sum + r.amount, 0)
    return { rows, total }
  } catch (err) {
    handleError(err, 'Failed to load liquidation report')
    return { rows: [], total: 0 }
  }
}

// Was request_petty_cash_replenishment.
export async function requestReplenishment(payload: {
  pettyCashAccountId: number
  fundingAccountId: number
  remarks?: string
}) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

  const { data: pettyAccount, error: pettyError } = await supabase
    .from('cash_accounts').select('account_type, float_amount, balance')
    .eq('id', payload.pettyCashAccountId).maybeSingle()
  if (pettyError || !pettyAccount || !['petty_cash', 'revolving_fund'].includes(pettyAccount.account_type)) {
    toast.error(`Petty cash / revolving fund account ${payload.pettyCashAccountId} not found.`)
    loading.value = false; return { success: false }
  }
  const { data: fundingAccount } = await supabase
    .from('cash_accounts').select('id').eq('id', payload.fundingAccountId).eq('account_type', 'bank').maybeSingle()
  if (!fundingAccount) {
    toast.error(`Funding bank account ${payload.fundingAccountId} not found.`)
    loading.value = false; return { success: false }
  }

  const shortfall = (pettyAccount.float_amount ?? 0) - pettyAccount.balance
  if (shortfall <= 0) {
    toast.error(`Account is already at or above its float (balance: ${pettyAccount.balance}, float: ${pettyAccount.float_amount}).`)
    loading.value = false; return { success: false }
  }

  const prefix = pettyAccount.account_type === 'revolving_fund' ? 'RVF' : 'PCR'
  const year = new Date().getFullYear().toString()
  const { data: created, docNo: requestNo, error: insertError } = await insertWithDocRetry<{ id: number }>(
    async () => {
      const { data: existingRequests } = await supabase
        .from('transactions')
        .select('reference_no')
        .like('reference_no', `${prefix}-${year}-%`)
      return nextDocNumber((existingRequests ?? []).map(r => r.reference_no), `${prefix}-${year}-`)
    },
    async (docNo) => supabase
      .from('transactions')
      .insert({
        reference_no: docNo, transaction_type: 'petty_cash_replenishment', status: 'pending_approval',
        total_amount: shortfall, subtotal: shortfall, remarks: payload.remarks || null, created_by: user.id,
        cash_account_id: payload.pettyCashAccountId, funding_account_id: payload.fundingAccountId,
      })
      .select('id')
      .single(),
  )
  if (insertError || !created) {
    handleError(insertError, 'Failed to request replenishment.')
    toast.error(insertError?.message || 'Failed to request replenishment.')
    loading.value = false
    return { success: false }
  }

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'petty_cash_replenish_request',
    description: `${requestNo} | requested ${shortfall}`, module: 'finance', transaction_id: created.id,
  })
  if (logError) console.warn('requestReplenishment: activity log insert failed:', logError.message)

  toast.success('Replenishment request submitted for approval.')
  await fetchReplenishmentRequests()
  loading.value = false
  return { success: true, requestId: created.id }
}

/**
 * Move a cash account's balance by `delta`, writing only if the balance is
 * still the figure just read and re-reading on a clash — so two movements on
 * the same account cannot overwrite each other ("read, add, write" lost one
 * whenever they overlapped). Refuses to take an account below zero.
 */
async function moveCashBalance(accountId: number, delta: number): Promise<
  { ok: true } | { ok: false; reason: 'insufficient' | 'not_found' | 'conflict' | 'error'; available?: number; message?: string }
> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error: readError } = await supabase
      .from('cash_accounts').select('balance').eq('id', accountId).maybeSingle()
    if (readError) return { ok: false, reason: 'error', message: readError.message }
    if (!data) return { ok: false, reason: 'not_found' }
    const asRead = data.balance as number | null
    const next = Number(asRead ?? 0) + delta
    if (next < -0.005) return { ok: false, reason: 'insufficient', available: Number(asRead ?? 0) }
    const base = supabase.from('cash_accounts').update({ balance: next }).eq('id', accountId)
    const guarded = asRead == null ? base.is('balance', null) : base.eq('balance', asRead)
    const { data: updated, error: updateError } = await guarded.select('id')
    if (updateError) return { ok: false, reason: 'error', message: updateError.message }
    if (updated?.length) return { ok: true }
  }
  return { ok: false, reason: 'conflict' }
}

// Was approve_petty_cash_replenishment.
//
// CLAIM FIRST: the request is flipped pending_approval -> approved in one
// guarded write before any money moves. A double submit, a retry or a second
// approver finds nothing left to flip and stops — before, all of them passed
// the "pending" read and each debited the funding account again. If either
// balance then fails to move, what was moved is put back and the request is
// returned to pending, so a retry starts clean. (A failed credit to the petty
// fund used to be a console warning, leaving the bank debited for money that
// landed nowhere.)
export async function approveReplenishment(id: number) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

  const { data: request, error: fetchError } = await supabase
    .from('transactions')
    .select('reference_no, total_amount, cash_account_id, funding_account_id')
    .eq('id', id).eq('transaction_type', 'petty_cash_replenishment').eq('status', 'pending_approval')
    .maybeSingle()
  if (fetchError || !request) {
    toast.error(`Pending replenishment request ${id} not found.`); loading.value = false; return { success: false }
  }
  if (!request.cash_account_id || !request.funding_account_id) {
    toast.error(`Replenishment request ${id} has no cash/funding account details.`)
    loading.value = false; return { success: false }
  }

  const amount = request.total_amount ?? 0

  const nowIso = new Date().toISOString()
  const { data: claimed, error: claimError } = await supabase
    .from('transactions')
    .update({ status: 'approved', approved_by: user.id, approved_at: nowIso, updated_at: nowIso })
    .eq('id', id).eq('transaction_type', 'petty_cash_replenishment').eq('status', 'pending_approval')
    .select('id')
  if (claimError || !claimed?.length) {
    handleError(claimError, 'Failed to approve replenishment.')
    toast.error(claimError?.message || 'This request is no longer pending — it was already approved or rejected.')
    await fetchReplenishmentRequests()
    loading.value = false; return { success: false }
  }

  /** Back to pending, so the request can be approved again once fixed. */
  async function reopen() {
    const { error: reopenError } = await supabase
      .from('transactions')
      .update({ status: 'pending_approval', approved_by: null, approved_at: null, updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'approved')
    if (reopenError) console.warn('approveReplenishment: could not reopen the request:', reopenError.message)
  }

  const debit = await moveCashBalance(request.funding_account_id, -amount)
  if (!debit.ok) {
    await reopen()
    handleError(debit.message ?? debit.reason, 'Failed to approve replenishment.')
    toast.error(debit.reason === 'insufficient'
      ? `Insufficient balance in funding account (available: ${debit.available ?? 0}).`
      : `Failed to approve replenishment (${debit.message ?? debit.reason}). Nothing was moved.`)
    loading.value = false; return { success: false }
  }

  const credit = await moveCashBalance(request.cash_account_id, amount)
  if (!credit.ok) {
    const back = await moveCashBalance(request.funding_account_id, amount)
    await reopen()
    handleError(credit.message ?? credit.reason, 'Failed to approve replenishment.')
    toast.error(back.ok
      ? 'Could not credit the petty cash fund. Nothing was moved; the request is back to pending.'
      : `Could not credit the petty cash fund, and the funding account could not be put back — add ${amount} to it by hand.`,
    { timeout: 15000 })
    await fetchCashAccounts()
    loading.value = false; return { success: false }
  }

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'petty_cash_replenish_approve',
    description: `${request.reference_no} | ${amount}`, module: 'finance', transaction_id: id,
  })
  if (logError) console.warn('approveReplenishment: activity log insert failed:', logError.message)

  toast.success('Replenishment approved.')
  await Promise.all([fetchReplenishmentRequests(), fetchCashAccounts()])
  loading.value = false
  return { success: true }
}

// Was reject_petty_cash_replenishment.
export async function rejectReplenishment(id: number, reason: string) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

  const { data: request, error: fetchError } = await supabase
    .from('transactions')
    .select('reference_no, remarks')
    .eq('id', id).eq('transaction_type', 'petty_cash_replenishment').eq('status', 'pending_approval')
    .maybeSingle()
  if (fetchError || !request) {
    toast.error(`Pending replenishment request ${id} not found.`); loading.value = false; return { success: false }
  }

  const nowIso = new Date().toISOString()
  const newRemarks = `${request.remarks ? request.remarks + ' | ' : ''}Rejected: ${reason ?? ''}`
  const { error: statusError } = await supabase
    .from('transactions')
    .update({ status: 'rejected', approved_by: user.id, approved_at: nowIso, updated_at: nowIso, remarks: newRemarks })
    .eq('id', id)
  if (statusError) {
    handleError(statusError, 'Failed to reject replenishment.')
    toast.error(statusError.message || 'Failed to reject replenishment.')
    loading.value = false
    return { success: false }
  }

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'petty_cash_replenish_reject',
    description: `${request.reference_no} | ${reason ?? ''}`, module: 'finance', transaction_id: id,
  })
  if (logError) console.warn('rejectReplenishment: activity log insert failed:', logError.message)

  toast.success('Replenishment request rejected.')
  await fetchReplenishmentRequests()
  loading.value = false
  return { success: true }
}
