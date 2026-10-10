// Collections and commissions: recording a payment against an order (and
// accruing its rebate once paid in full), the collection ledger, and the
// per-agent commission summary.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useGLDataStore } from '@/stores/glData'
import type { CollectionType, CommissionSummaryRow } from './types'
import { collections, commissionSummary, loading, handleError, clearError } from './state'
import { fetchOrders } from './orders'

const toast = useToast()

// Resolved lazily rather than at import time: a store factory called while
// this module is first evaluated can run before Pinia is installed.
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())
let glStore: ReturnType<typeof useGLDataStore> | null = null
const getGLStore = () => (glStore ??= useGLDataStore())

// Insert a payment against the balance, update the cumulative amount_paid
// cache, flip status (was ethical_record_collection).
export async function recordCollection(payload: {
  orderId: number
  amount: number
  method?: string
  reference?: string
  remarks?: string
  // Which of our accounts received the money. Required so the payment
  // actually lands somewhere — without it nothing ever credited
  // cash_accounts.balance, which only ever decreased (expenses, vouchers,
  // rebate payouts) and eventually blocks disbursements on a false
  // "insufficient balance".
  cashAccountId: number
}) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }
  if (payload.amount <= 0) { toast.error('Collection amount must be positive.'); loading.value = false; return { success: false } }

  const { data: order, error: fetchError } = await supabase
    .from('transactions')
    .select('id, status, total_amount, agent_id, ethical_no, ethical_details(amount_paid, rebate_amount, rebate_status)')
    .eq('id', payload.orderId)
    .eq('transaction_type', 'ethical_order')
    .maybeSingle()
  if (fetchError || !order) {
    handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.')
    loading.value = false; return { success: false }
  }
  if (order.status !== 'invoiced' && order.status !== 'partial') {
    toast.error('Order is not open for collection.'); loading.value = false; return { success: false }
  }

  const orderDetails = order.ethical_details as unknown as
    { amount_paid: number | null; rebate_amount: number | null; rebate_status: string | null } | null
  const paid = orderDetails?.amount_paid ?? 0
  const total = order.total_amount ?? 0
  const balance = total - paid
  if (payload.amount > balance) {
    toast.error(`Collection amount (${payload.amount}) exceeds outstanding balance (${balance}).`)
    loading.value = false; return { success: false }
  }

  let commissionRate = 0
  if (order.agent_id) {
    const { data: agent } = await supabase.from('agents').select('commission_rate').eq('id', order.agent_id).maybeSingle()
    commissionRate = agent?.commission_rate ?? 0
  }
  const commissionAmount = payload.amount * (commissionRate / 100)
  const newStatus = paid + payload.amount >= total ? 'paid' : 'partial'

  // Resolve the receiving account before writing anything — a collection
  // pointing at a missing account would record money as landing nowhere.
  const { data: account, error: accountError } = await supabase
    .from('cash_accounts').select('id, name, balance').eq('id', payload.cashAccountId).maybeSingle()
  if (accountError || !account) {
    toast.error('Select a valid cash account to deposit this payment into.')
    loading.value = false; return { success: false }
  }

  const { data: collection, error: collectionError } = await supabase
    .from('collections')
    .insert({
      transaction_id: payload.orderId, amount: payload.amount,
      payment_method: payload.method || null, reference_no: payload.reference || null,
      collected_by: user.id, agent_id: order.agent_id,
      commission_rate: commissionRate, commission_amount: commissionAmount,
      cash_account_id: payload.cashAccountId,
    })
    .select('id')
    .single()
  if (collectionError || !collection) {
    handleError(collectionError, 'Failed to record collection.')
    toast.error(collectionError?.message || 'Failed to record collection.')
    loading.value = false
    return { success: false }
  }

  const nowIso = new Date().toISOString()
  // The rebate only falls due once the order is paid IN FULL, and every rebate
  // needs approval before cash moves — so full payment parks it in the
  // approval queue rather than making it immediately payable.
  const rebateAmount = orderDetails?.rebate_amount ?? 0
  const rebateFallsDueNow =
    newStatus === 'paid' && rebateAmount > 0 && !orderDetails?.rebate_status
  const detailsUpdate: Record<string, unknown> = { amount_paid: paid + payload.amount, paid_at: nowIso }
  if (rebateFallsDueNow) detailsUpdate.rebate_status = 'pending_approval'

  const { error: detailsError } = await supabase
    .from('ethical_details')
    .update(detailsUpdate)
    .eq('transaction_id', payload.orderId)
  if (detailsError) console.warn('recordCollection: ethical_details update failed:', detailsError.message)

  // Only flip status if the amount_paid cache write above actually landed —
  // status='paid'/'partial' otherwise implies a balance that the cache
  // doesn't reflect, and once status leaves invoiced/partial the guard at
  // the top of this function permanently blocks any further collection
  // that could have corrected it.
  if (!detailsError) {
    const { error: statusError } = await supabase
      .from('transactions')
      .update({ status: newStatus, updated_at: nowIso })
      .eq('id', payload.orderId)
    if (statusError) console.warn('recordCollection: status flip failed:', statusError.message)
  }

  // The money lands in the chosen account. Best-effort like every other
  // balance write in the app (JS-over-RPC convention) — a failure here is
  // logged and surfaced rather than rolled back, since the collection itself
  // is the record of record and cash_accounts.balance is an operational cache.
  const { error: balanceError } = await supabase
    .from('cash_accounts')
    .update({ balance: (account.balance ?? 0) + payload.amount })
    .eq('id', payload.cashAccountId)
  if (balanceError) {
    console.warn('recordCollection: cash account balance update failed:', balanceError.message)
    toast.warning(`Collection recorded, but ${account.name}'s balance was not updated. Verify it manually.`)
  }

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'collection',
    description: `Collection of ${payload.amount} into ${account.name}${detailsError ? ' — WARNING: balance cache update failed, verify manually' : ''}`,
    module: 'ethical', transaction_id: payload.orderId,
  })
  if (logError) console.warn('recordCollection: activity log insert failed:', logError.message)

  // The rebate is a real obligation the moment the order is settled in full, so
  // accrue the expense now rather than waiting for the cash to leave:
  //   DR 6030 Computed Rebates / CR 2020 Accrued Expenses
  // Best-effort per the JS-over-RPC trade-off — a failure here is logged and
  // surfaced, never silently swallowed, since it would understate expenses.
  if (rebateFallsDueNow && !detailsError) {
    const glResult = await getGLStore().postJournalEntry(
      nowIso.slice(0, 10),
      'accrual',
      payload.orderId,
      `Rebate accrued on fully-paid ethical order ${order.ethical_no ?? payload.orderId}`,
      [
        { account_code: '6030', debit: rebateAmount, credit: 0, memo: 'Computed rebate earned on full payment' },
        { account_code: '2020', debit: 0, credit: rebateAmount, memo: 'Rebate payable, pending approval' },
      ],
      user.id,
    )
    if (!glResult.success) {
      console.warn('recordCollection: rebate accrual posting failed:', glResult.error)
      toast.warning('Collection recorded, but the rebate accrual did not post to the GL — verify with Finance.')
    }
  }

  if (detailsError) toast.warning('Collection recorded, but the order balance may be out of sync — verify manually.')
  else toast.success('Collection recorded.')
  await fetchOrders()
  await fetchCollections(payload.orderId)
  loading.value = false
  return { success: true, collectionId: collection.id }
}

// Voided collections are excluded: every consumer of this (order balances,
// the Commissions view) is a money view, and a voided payment is no longer
// money received. Its record lives on the change request + the activity log.
export async function fetchCollections(orderId?: number): Promise<CollectionType[]> {
  try {
    let q = supabase.from('collections').select('*').is('voided_at', null).order('created_at', { ascending: true })
    if (orderId !== undefined) q = q.eq('transaction_id', orderId)
    const { data, error: e } = await q
    if (e) throw e
    collections.value = (data || []) as CollectionType[]
    return collections.value
  } catch (err) {
    handleError(err, 'Failed to fetch collections')
    return []
  }
}

// Single-table update — done in JS per the "no RPC under ~10 round-trips"
// convention (was ethical_mark_commission_paid, one `update collections`).
export async function markCommissionPaid(collectionId: number) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

  const { error: updateError } = await supabase
    .from('collections')
    .update({ commission_status: 'paid', commission_paid_at: new Date().toISOString() })
    .eq('id', collectionId)

  if (updateError) {
    handleError(updateError, 'Failed to mark commission as paid.')
    toast.error(updateError.message || 'Failed to mark commission as paid.')
    loading.value = false
    return { success: false }
  }

  toast.success('Commission marked as paid.')
  await fetchCommissionSummary()
  loading.value = false
  return { success: true }
}

export async function fetchCommissionSummary(): Promise<CommissionSummaryRow[]> {
  try {
    const { data, error: e } = await supabase
      .from('collections')
      .select('agent_id, agent:agent_id(name), commission_amount, commission_status')
      .is('voided_at', null)   // a voided collection earns no commission
    if (e) throw e

    // Group by agent_id and sum commissions
    const grouped = new Map<number | null, { agent_name: string | null; total: number; unpaid: number; paid: number }>()
    for (const row of (data || []) as any[]) {
      const agentId = row.agent_id as number | null
      const agent = row.agent as any
      const agentName = agent?.name ?? null
      const amount = (row.commission_amount ?? 0) as number
      const isPaid = row.commission_status === 'paid'

      if (!grouped.has(agentId)) {
        grouped.set(agentId, { agent_name: agentName, total: 0, unpaid: 0, paid: 0 })
      }
      const summary = grouped.get(agentId)!
      summary.total += amount
      if (isPaid) summary.paid += amount
      else summary.unpaid += amount
    }

    const result: CommissionSummaryRow[] = Array.from(grouped.entries()).map(([agentId, summary]) => ({
      agent_id: agentId,
      agent_name: summary.agent_name,
      total_commission: summary.total,
      unpaid_commission: summary.unpaid,
      paid_commission: summary.paid,
    }))

    commissionSummary.value = result
    return result
  } catch (err) {
    handleError(err, 'Failed to fetch commission summary')
    return []
  }
}
