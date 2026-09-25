import { generateDSNumber, insertWithDocRetry } from '@/utils/generativeHelpers'
import { useAuthUserStore } from './authUser'
import { useLogsDataStore } from './logsData'
import { useToast } from 'vue-toastification'
import { supabase } from '@/lib/supabase'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Ref } from 'vue'

const toast = useToast()

// A disposal is a `transactions` row, not a table of its own — same shape as a
// reorder request (see productsData.createReorderRequest). It has to be: every
// activity log row is anchored by logs.transaction_id, a FK to transactions.id,
// so a disposal that isn't a transaction could not be logged at all.
const disposalTransactionType = 'disposal'

const actionRequested = 'dispose_requested'
const actionApproved = 'dispose_approved'
const actionRejected = 'dispose_rejected'

const disposalModule = 'disposal'

export type DisposalProduct = {
  id: number
  product_name: string | null
  sku: string | null
  unit: string | null
  batch_no: string | null
  expiry_date: string | null
  current_stock: number | null
  cost_price: number | null
}

export type DisposalRequest = {
  id: number
  created_at: string
  updated_at: string | null
  reference_no: string | null
  status: string
  reason: string | null
  qty: number
  cost_price: number | null
  total_cost: number
  requester_name: string
  approver_name: string | null
  product: DisposalProduct | null
}

export type CreateDisposalPayload = {
  productId: number
  qty: number
  reason: string
}

const disposalSelect = `
  id, reference_no, status, created_at, updated_at, created_by, approved_by, remarks,
  transaction_items!transaction_items_transaction_id_fkey (
    id, product_id, qty_stock_out, cost_price,
    products ( id, product_name, sku, unit, batch_no, expiry_date, current_stock, cost_price )
  )
`

export const useDisposalsDataStore = defineStore('disposalsData', () => {
  const authStore = useAuthUserStore()

  const disposalRequests: Ref<DisposalRequest[]> = ref([])
  const disposalRegister: Ref<DisposalRequest[]> = ref([])
  const loading = ref(false)
  const registerLoading = ref(false)
  const error: Ref<string> = ref('')

  const pendingDisposals = computed(() =>
    disposalRequests.value.filter((d) => d.status === 'pending'),
  )
  const pendingDisposalCount = computed(() => pendingDisposals.value.length)

  const registerTotalUnits = computed(() =>
    disposalRegister.value.reduce((sum, d) => sum + d.qty, 0),
  )
  const registerTotalValue = computed(() =>
    disposalRegister.value.reduce((sum, d) => sum + d.total_cost, 0),
  )

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }

  const clearError = () => {
    error.value = ''
  }

  function resolveUserName(userId: string | null): string | null {
    if (!userId) return null
    const user = authStore.users.find((u: any) => u.id === userId)
    return user?.full_name?.toUpperCase() ?? user?.email ?? null
  }

  function mapDisposalRow(tx: any): DisposalRequest {
    const item = tx.transaction_items?.[0]
    const product = item?.products ?? null
    const qty = item?.qty_stock_out ?? 0
    // Prefer the cost captured on the line at request time over the product's
    // live cost_price — a write-off has to be valued at what the stock cost
    // when it was destroyed, not at whatever the master says today.
    const costPrice = item?.cost_price ?? product?.cost_price ?? null

    return {
      id: tx.id,
      created_at: tx.created_at,
      updated_at: tx.updated_at ?? null,
      reference_no: tx.reference_no ?? null,
      status: tx.status,
      reason: tx.remarks ?? null,
      qty,
      cost_price: costPrice,
      total_cost: qty * (costPrice ?? 0),
      requester_name: resolveUserName(tx.created_by) ?? '—',
      approver_name: resolveUserName(tx.approved_by),
      product: product
        ? {
            id: product.id,
            product_name: product.product_name ?? null,
            sku: product.sku ?? null,
            unit: product.unit ?? null,
            batch_no: product.batch_no ?? null,
            expiry_date: product.expiry_date ?? null,
            current_stock: product.current_stock ?? null,
            cost_price: product.cost_price ?? null,
          }
        : null,
    }
  }

  async function fetchDisposalRequests(includeResolved = false) {
    loading.value = true
    clearError()

    if (!authStore.users.length) await authStore.getAllUsers()

    const statuses = includeResolved ? ['pending', 'approved', 'rejected'] : ['pending']

    const { data, error: fetchError } = await supabase
      .from('transactions')
      .select(disposalSelect)
      .eq('transaction_type', disposalTransactionType)
      .in('status', statuses)
      .order('created_at', { ascending: false })

    loading.value = false

    if (fetchError) {
      handleError(fetchError, 'Failed to fetch disposal requests.')
      toast.error('Failed to fetch disposal requests.')
      return []
    }

    disposalRequests.value = (data || []).map(mapDisposalRow)
    return disposalRequests.value
  }

  async function fetchDisposalById(disposalId: number): Promise<DisposalRequest | null> {
    if (!authStore.users.length) await authStore.getAllUsers()

    const { data, error: fetchError } = await supabase
      .from('transactions')
      .select(disposalSelect)
      .eq('id', disposalId)
      .eq('transaction_type', disposalTransactionType)
      .maybeSingle()

    if (fetchError || !data) return null
    return mapDisposalRow(data)
  }

  async function fetchDisposalRegister() {
    registerLoading.value = true
    clearError()

    if (!authStore.users.length) await authStore.getAllUsers()

    const { data, error: fetchError } = await supabase
      .from('transactions')
      .select(disposalSelect)
      .eq('transaction_type', disposalTransactionType)
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })

    registerLoading.value = false

    if (fetchError) {
      handleError(fetchError, 'Failed to fetch the disposal register.')
      toast.error('Failed to fetch the disposal register.')
      return []
    }

    disposalRegister.value = (data || []).map(mapDisposalRow)
    return disposalRegister.value
  }

  async function logDisposalEvent(
    action: string,
    disposal: DisposalRequest,
    userId: string,
    description: string,
  ) {
    const logsStore = useLogsDataStore()
    await logsStore.createLog({
      action,
      description,
      module: disposalModule,
      transaction_id: disposal.id,
      created_by: userId,
    })
  }

  // Only one pending disposal per product at a time, mirroring the reorder rule
  // — a second request would race the first one's stock decrement.
  async function checkPendingDisposal(
    productId: number,
  ): Promise<'pending' | 'none' | 'unknown'> {
    const { data, error: checkError } = await supabase
      .from('transactions')
      .select('id, transaction_items!transaction_items_transaction_id_fkey!inner(product_id)')
      .eq('transaction_type', disposalTransactionType)
      .eq('status', 'pending')
      .eq('transaction_items.product_id', productId)
      .limit(1)
    if (checkError) return 'unknown'
    return data?.length ? 'pending' : 'none'
  }

  async function createDisposalRequest(payload: CreateDisposalPayload) {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const reason = payload.reason.trim()
    if (!reason) {
      toast.warning('A reason is required to request a disposal.')
      loading.value = false
      return { success: false }
    }

    const pendingCheck = await checkPendingDisposal(payload.productId)
    if (pendingCheck === 'pending') {
      toast.info('This product already has a pending disposal request.')
      loading.value = false
      return { success: false }
    }
    if (pendingCheck === 'unknown') {
      toast.error('Could not verify existing disposal requests — please try again.')
      loading.value = false
      return { success: false }
    }

    const { data: product } = await supabase
      .from('products')
      .select('product_name, sku, batch_no, current_stock, cost_price')
      .eq('id', payload.productId)
      .maybeSingle()

    if (!product) {
      toast.error('Product not found.')
      loading.value = false
      return { success: false }
    }

    const onHand = product.current_stock ?? 0
    if (payload.qty < 1 || payload.qty > onHand) {
      toast.warning(`Quantity to dispose must be between 1 and ${onHand}.`)
      loading.value = false
      return { success: false }
    }

    const productName = product.product_name ?? `Product #${payload.productId}`

    const {
      data: txData,
      docNo,
      error: txError,
    } = await insertWithDocRetry<{ id: number }>(
      () => generateDSNumber(),
      async (nextDocNo) =>
        supabase
          .from('transactions')
          .insert({
            transaction_type: disposalTransactionType,
            status: 'pending',
            created_by: user.id,
            reference_no: nextDocNo,
            remarks: reason,
          })
          .select('id')
          .single(),
    )

    if (txError || !txData) {
      handleError(txError, 'Failed to submit disposal request.')
      toast.error(txError?.message || 'Failed to submit disposal request.')
      loading.value = false
      return { success: false }
    }

    const { error: itemError } = await supabase.from('transaction_items').insert({
      transaction_id: txData.id,
      product_id: payload.productId,
      qty_stock_out: payload.qty,
      cost_price: product.cost_price ?? null,
    })

    if (itemError) {
      const { error: cleanupError } = await supabase
        .from('transactions')
        .delete()
        .eq('id', txData.id)
      if (cleanupError)
        console.warn(
          'createDisposalRequest: failed to remove the orphan disposal transaction:',
          cleanupError.message,
        )

      handleError(itemError, 'Failed to save the disposal line item.')
      toast.error('Failed to save the disposal line item.')
      loading.value = false
      return { success: false }
    }

    const logsStore = useLogsDataStore()
    await logsStore.createLog({
      action: actionRequested,
      description: `Disposal requested for "${productName}" (SKU ${product.sku || 'N/A'}, batch ${product.batch_no || '—'}) — ${payload.qty} of ${onHand} units: ${reason}`,
      module: disposalModule,
      transaction_id: txData.id,
      created_by: user.id,
    })

    await fetchDisposalRequests(true)
    loading.value = false
    toast.success(`Disposal request ${docNo ?? ''} submitted for approval.`.replace('  ', ' '))
    return { success: true, id: txData.id }
  }

  // Deliberately the reverse of changeRequestsData.approveRequest, which applies
  // the change first so a failure stays retryable. A void is idempotent; a stock
  // decrement is not — so the guarded status flip runs FIRST and is what stops a
  // double-click from destroying the same units twice.
  async function approveDisposal(disposalId: number) {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const disposal = await fetchDisposalById(disposalId)
    if (!disposal || disposal.status !== 'pending') {
      toast.error('Pending disposal request not found.')
      loading.value = false
      return { success: false }
    }

    const product = disposal.product
    if (!product) {
      toast.error('This disposal request has no product attached.')
      loading.value = false
      return { success: false }
    }

    const onHand = product.current_stock ?? 0
    if (onHand < disposal.qty) {
      toast.error(
        `Stock changed since this request was filed — ${onHand} left but ${disposal.qty} requested. Ask for it to be re-filed.`,
      )
      loading.value = false
      return { success: false }
    }

    const { data: approved, error: approveError } = await supabase
      .from('transactions')
      .update({
        status: 'approved',
        approved_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', disposalId)
      .eq('status', 'pending')
      .select('id')

    if (approveError) {
      handleError(approveError, 'Failed to approve the disposal request.')
      toast.error(approveError.message || 'Failed to approve the disposal request.')
      loading.value = false
      return { success: false }
    }

    if (!approved?.length) {
      toast.warning('This disposal request was already resolved.')
      await fetchDisposalRequests(true)
      loading.value = false
      return { success: false }
    }

    const remainingStock = Math.max(0, onHand - disposal.qty)

    // Guarded on the stock we read a moment ago: a concurrent sale that moved it
    // turns into a visible warning instead of a silent lost update.
    const { data: adjusted, error: stockError } = await supabase
      .from('products')
      .update({ current_stock: remainingStock, is_disposed: remainingStock <= 0 })
      .eq('id', product.id)
      .eq('current_stock', onHand)
      .select('id')

    const stockApplied = !stockError && !!adjusted?.length

    // The approval is already committed, so a failed decrement cannot be undone
    // without risking a double decrement on retry — say so in the log instead of
    // recording a stock movement that never happened.
    const stockNote = stockApplied
      ? `stock ${onHand} → ${remainingStock}`
      : `STOCK NOT ADJUSTED — still ${onHand}, needs manual correction`

    const productName = product.product_name ?? `Product #${product.id}`
    await logDisposalEvent(
      actionApproved,
      disposal,
      user.id,
      `Approved disposal ${disposal.reference_no ?? `#${disposal.id}`} — ${disposal.qty} unit(s) of "${productName}" (SKU ${product.sku || 'N/A'}, batch ${product.batch_no || '—'}), ${stockNote}`,
    )

    await fetchDisposalRequests(true)
    loading.value = false

    if (!stockApplied) {
      toast.warning(
        'Disposal approved, but the stock adjustment did not apply — please adjust this product manually.',
      )
      return { success: false }
    }

    toast.success('Disposal approved and stock adjusted.')
    return { success: true }
  }

  async function rejectDisposal(disposalId: number, reason: string = '') {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const disposal = await fetchDisposalById(disposalId)
    if (!disposal || disposal.status !== 'pending') {
      toast.error('Pending disposal request not found.')
      loading.value = false
      return { success: false }
    }

    const { data: rejected, error: rejectError } = await supabase
      .from('transactions')
      .update({
        status: 'rejected',
        approved_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', disposalId)
      .eq('status', 'pending')
      .select('id')

    if (rejectError) {
      handleError(rejectError, 'Failed to reject the disposal request.')
      toast.error(rejectError.message || 'Failed to reject the disposal request.')
      loading.value = false
      return { success: false }
    }

    if (!rejected?.length) {
      toast.warning('This disposal request was already resolved.')
      await fetchDisposalRequests(true)
      loading.value = false
      return { success: false }
    }

    // The rejection reason lives in the log, not in transactions.remarks — that
    // column holds the REQUESTER's reason and overwriting it would lose why the
    // disposal was asked for in the first place.
    const note = reason.trim() || 'Rejected by approver.'
    const productName = disposal.product?.product_name ?? 'this product'
    await logDisposalEvent(
      actionRejected,
      disposal,
      user.id,
      `Rejected disposal ${disposal.reference_no ?? `#${disposal.id}`} — ${disposal.qty} unit(s) of "${productName}" (SKU ${disposal.product?.sku || 'N/A'}, batch ${disposal.product?.batch_no || '—'}): ${note}`,
    )

    await fetchDisposalRequests(true)
    loading.value = false
    toast.success('Disposal request rejected.')
    return { success: true }
  }

  const resetStore = () => {
    disposalRequests.value = []
    disposalRegister.value = []
    loading.value = false
    registerLoading.value = false
    error.value = ''
  }

  return {
    disposalRequests,
    disposalRegister,
    loading,
    registerLoading,
    error,
    pendingDisposals,
    pendingDisposalCount,
    registerTotalUnits,
    registerTotalValue,
    fetchDisposalRequests,
    fetchDisposalById,
    fetchDisposalRegister,
    checkPendingDisposal,
    createDisposalRequest,
    approveDisposal,
    rejectDisposal,
    clearError,
    resetStore,
  }
})
