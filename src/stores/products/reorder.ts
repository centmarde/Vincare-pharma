// Reorder request lifecycle: create, fetch (list + count), transition, and the
// approve / reject / mark-awaiting-stock / complete actions. Uses the shared
// state's products/currentProduct to keep the local reorder flag in sync.

import { supabase } from '@/lib/supabase'
import { generateRONumber, insertWithDocRetry } from '@/utils/generativeHelpers'
import { useAuthUserStore } from '@/stores/authUser'
import { useLogsDataStore } from '@/stores/logsData'
import { useToast } from 'vue-toastification'
import { REORDER_TYPES } from './types'
import { products, currentProduct, loading, reorderRequests, reorderCount } from './state'

const toast = useToast()

// authStore gi-hold here as a lazy singleton para ma-reuse ang cached users
// across reorder actions (parehas sa dato nga usa ra ka store-level authStore),
// pero dili ma-trigger ang Pinia setup sa import time.
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())

export async function createReorderRequest(payload: {
  product_id: number
  reason: 'reorder_outofstock' | 'reorder_lowstock' | 'reorder_expiring' | 'reorder_expired'
}) {
  loading.value = true

  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) {
    toast.error('User not authenticated.')
    loading.value = false
    return { success: false }
  }

  const { data: existing } = await supabase
    .from('transactions')
    .select('id, transaction_items!transaction_items_transaction_id_fkey!inner(product_id)')
    .in('transaction_type', REORDER_TYPES)
    .eq('status', 'pending')
    .eq('transaction_items.product_id', payload.product_id)
    .maybeSingle()

  if (existing) {
    toast.info('This product already has a pending reorder request.')
    loading.value = false
    return { success: false }
  }

  // Fetch product name for a meaningful log description
  const { data: productData } = await supabase
    .from('products')
    .select('product_name')
    .eq('id', payload.product_id)
    .single()

  const productName = productData?.product_name ?? `Product #${payload.product_id}`
  const reasonLabel = payload.reason.replace('reorder_', '').replace('_', ' ')

  const { data: txData, error: txError } = await insertWithDocRetry<{ id: number }>(
    () => generateRONumber(),
    async (docNo) =>
      supabase
        .from('transactions')
        .insert({
          transaction_type: payload.reason,
          status: 'pending',
          created_by: user.id,
          reference_no: docNo,
          remarks: `Reorder "${productName}" flagged from warehouse (${reasonLabel})`,
        })
        .select('id')
        .single(),
  )

  if (txError || !txData) {
    toast.error('Failed to submit reorder request.')
    loading.value = false
    return { success: false }
  }

  const { error: itemError } = await supabase.from('transaction_items').insert({
    transaction_id: txData.id,
    product_id: payload.product_id,
  })

  if (itemError) {
    toast.error('Failed to save reorder item.')
    loading.value = false
    return { success: false }
  }

  // Flag the product for reorder on the products table.
  await supabase.from('products').update({ is_reorder: true }).eq('id', payload.product_id)

  // Keep the local products list in sync with the flag.
  const localIndex = products.value.findIndex((p) => p.id === payload.product_id)
  if (localIndex !== -1) products.value[localIndex].is_reorder = true
  if (currentProduct.value?.id === payload.product_id) {
    currentProduct.value.is_reorder = true
  }

  // Log the reorder request
  const logsStore = useLogsDataStore()
  await logsStore.createLog({
    action: 'reorder_request',
    description: `Reorder requested for "${productName}" — ${reasonLabel}`,
    module: 'reorder',
    transaction_id: txData.id,
    created_by: user.id,
  })

  loading.value = false
  toast.success('Reorder request submitted.')
  return { success: true, id: txData.id }
}

/**
 * Fetches the reorder request IDs associated with a transaction's line items
 * @param transactionId - The transaction ID to fetch reorder request IDs for
 * @returns Array of reorder request IDs
 */
export async function fetchReorderRequestIdsForTransaction(transactionId: number): Promise<number[]> {
  const { data, error } = await supabase
    .from('transaction_items')
    .select('reorder_request_id')
    .eq('transaction_id', transactionId)
    .not('reorder_request_id', 'is', null)

  if (error) {
    console.error('Failed to fetch reorder_request_id list for transaction', transactionId, error)
    return []
  }
  return (data || [])
    .map((r: any) => r.reorder_request_id)
    .filter((id: number | null): id is number => id != null)
}

// An unreadable result drops every link rather than risk resolving a reorder request the PR no longer owns.
export async function filterPendingReorderRequestIds(ids: number[]): Promise<number[]> {
  if (!ids.length) return []

  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .in('id', ids)
    .in('transaction_type', REORDER_TYPES)
    .eq('status', 'pending')

  if (error) {
    console.error('Failed to check reorder request statuses', error)
    return []
  }
  return (data || []).map((row: any) => row.id)
}

export async function fetchReorderRequests(includeResolved = false) {
  loading.value = true
  if (!getAuthStore().users.length) await getAuthStore().getAllUsers()

  const statuses = includeResolved
    ? ['pending', 'approved', 'awaiting_stock', 'rejected']
    : ['pending']

  const { data, error } = await supabase
    .from('transactions')
    .select(
      `
        id, transaction_type, status, created_at, created_by, remarks,
        transaction_items!transaction_items_transaction_id_fkey (
          id, product_id,
          products ( id, product_name, sku, unit, current_stock, reorder_level, expiry_date, supplier_id, cost_price, suppliers ( name ) )
        )
      `,
    )
    .in('transaction_type', REORDER_TYPES)
    .in('status', statuses)
    .order('created_at', { ascending: false })

  loading.value = false
  if (error) {
    toast.error('Failed to fetch reorder requests.')
    return
  }

  reorderRequests.value = (data || []).map((tx: any) => {
    const item = tx.transaction_items?.[0]
    return {
      id: tx.id,
      transaction_type: tx.transaction_type,
      status: tx.status,
      product: item?.products
        ? { ...item.products, supplier_name: item.products.suppliers?.name ?? null }
        : null,
      requester_name:
        getAuthStore().users.find((u) => u.id === tx.created_by)?.full_name?.toUpperCase() ?? '—',
      created_at: tx.created_at,
    }
  })
  reorderCount.value = reorderRequests.value.filter((r) => r.status === 'pending').length
}

export async function fetchReorderCount() {
  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .in('transaction_type', REORDER_TYPES)
    .eq('status', 'pending')
  reorderCount.value = count ?? 0
}

export async function transitionReorderRequestsById(
  reorderRequestIds: number[],
  fromStatus: string,
  toStatus: string,
  logAction: string,
  describe: (productName: string) => string,
) {
  if (!reorderRequestIds.length) return

  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) return

  const { data: matches, error: fetchError } = await supabase
    .from('transactions')
    .select(
      `id, transaction_items!transaction_items_transaction_id_fkey!inner ( product_id, products ( product_name ) )`,
    )
    .in('id', reorderRequestIds)
    .in('transaction_type', REORDER_TYPES)
    .eq('status', fromStatus)

  if (fetchError || !matches?.length) return

  const ids = matches.map((m: any) => m.id)

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ status: toStatus })
    .in('id', ids)

  if (updateError) {
    console.error(`Failed to transition reorder requests to ${toStatus}:`, updateError)
    return
  }

  const logsStore = useLogsDataStore()
  await Promise.all(
    matches.map((m: any) => {
      const productName =
        m.transaction_items?.[0]?.products?.product_name ??
        `Product #${m.transaction_items?.[0]?.product_id}`
      return logsStore.createLog({
        action: logAction,
        description: describe(productName),
        module: 'reorder',
        transaction_id: m.id,
        created_by: user.id,
      })
    }),
  ).catch((err) => console.error('Failed to log reorder transition:', err))

  reorderRequests.value = reorderRequests.value.map((r) =>
    ids.includes(r.id) ? { ...r, status: toStatus } : r,
  )
  reorderCount.value = reorderRequests.value.filter((r) => r.status === 'pending').length
}

/**
 * Approves reorder requests by their IDs, transitioning them from pending to approved status
 * @param reorderRequestIds - Array of reorder request IDs to approve
 */
export async function approveReorderRequestsById(reorderRequestIds: number[]) {
  await transitionReorderRequestsById(
    reorderRequestIds,
    'pending',
    'approved',
    'reorder_approved',
    (productName) => `Reorder approved for "${productName}" (Purchase Requisition approved)`,
  )
}

/**
 * Rejects reorder requests by their IDs, transitioning them from pending to rejected status
 * @param reorderRequestIds - Array of reorder request IDs to reject
 */
export async function rejectReorderRequestsById(reorderRequestIds: number[]) {
  await transitionReorderRequestsById(
    reorderRequestIds,
    'pending',
    'rejected',
    'reorder_rejected',
    (productName) => `Reorder rejected for "${productName}" (Purchase Requisition rejected)`,
  )
}

/**
 * Marks reorder requests as awaiting stock by their IDs, transitioning from approved to awaiting_stock
 * @param reorderRequestIds - Array of reorder request IDs to mark as awaiting stock
 */
export async function markReorderRequestsAwaitingStockById(reorderRequestIds: number[]) {
  await transitionReorderRequestsById(
    reorderRequestIds,
    'approved',
    'awaiting_stock',
    'reorder_awaiting_stock',
    (productName) => `Reorder awaiting stock for "${productName}" (Purchase Order issued)`,
  )
}

/**
 * Completes reorder requests by their IDs, transitioning from awaiting_stock to complete status
 * @param reorderRequestIds - Array of reorder request IDs to mark as complete
 */
export async function completeReorderRequestsById(reorderRequestIds: number[]) {
  if (!reorderRequestIds.length) return

  loading.value = true

  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) {
    toast.error('User not authenticated.')
    loading.value = false
    return
  }

  const { data: matches, error: fetchError } = await supabase
    .from('transactions')
    .select(
      `id, transaction_items!transaction_items_transaction_id_fkey!inner ( product_id, products ( product_name ) )`,
    )
    .in('id', reorderRequestIds)
    .in('transaction_type', REORDER_TYPES)
    .eq('status', 'awaiting_stock')

  if (fetchError) {
    toast.error('Failed to look up reorder requests.')
    loading.value = false
    return
  }

  const ids = (matches || []).map((m: any) => m.id)
  if (!ids.length) {
    loading.value = false
    return
  }

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ status: 'complete' })
    .in('id', ids)

  if (updateError) {
    toast.error('Failed to complete reorder requests.')
    loading.value = false
    return
  }

  const logsStore = useLogsDataStore()
  await Promise.all(
    (matches || []).map((m: any) => {
      const productName =
        m.transaction_items?.[0]?.products?.product_name ??
        `Product #${m.transaction_items?.[0]?.product_id}`
      return logsStore.createLog({
        action: 'reorder_completed',
        description: `Reorder completed for "${productName}"`,
        module: 'reorder',
        transaction_id: m.id,
        created_by: user.id,
      })
    }),
  ).catch((err) => {
    console.error('Failed to log reorder completion:', err)
  })

  reorderRequests.value = reorderRequests.value.filter((r) => !ids.includes(r.id))
  reorderCount.value = reorderRequests.value.length

  loading.value = false
}