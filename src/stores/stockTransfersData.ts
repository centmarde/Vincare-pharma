import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { generateNextNumber, insertWithDocRetry } from '@/utils/helpers'
import type { ProductType } from '@/stores/productsData'
import type { WarehouseType } from '@/stores/warehouseData'

const toast = useToast()

// Stock transfers live in `transactions` as transaction_type = 'stock_transfer',
// lines in `transaction_items` (qty = requested_qty, received_qty = received).
// These view-model types are mapped from the hub so the transfer UI is unchanged.
//
// A transfer moves stock MAIN WAREHOUSE -> BRANCH WAREHOUSE:
//   source       products.current_stock            (main; unchanged, and read by
//                                                   18 other files -- do not move)
//   destination  warehouse_products.total_qty      (the branch, transactions.warehouse_id)
// The source is implicit because a transfer is always FROM main, so only the
// destination needs recording. Replaces the old outlets/outlet_stock pair.

export type StockTransferItemType = {
  id: number
  product_id: number | null
  requested_qty: number
  received_qty: number | null
  product?: ProductType | null
}

export type StockTransferType = {
  id: number
  created_at: string
  transfer_no: string | null
  warehouse_id: number | null
  warehouse?: WarehouseType | null
  status: string | null
  remarks: string | null
  requested_by: string | null
  approved_by: string | null
  received_by: string | null
  approved_at: string | null
  received_at: string | null
  updated_at: string | null
  stock_transfer_items?: StockTransferItemType[]
}

export type StockTransferLineInput = {
  product_id: number
  requested_qty: number
}

type FetchTransfersOptions = {
  warehouseId?: number
  status?: string
  orderBy?: 'created_at' | 'status'
  ascending?: boolean
}

// Line values live directly on transaction_items (transaction_item_details was
// merged back in). A transfer is outbound from the warehouse, so the requested
// quantity is qty_stock_out and the actually-received count is
// actual_count_stock_out (the "actual quantity that moved out").
const SELECT_TRANSFER = '*, transaction_items!transaction_items_transaction_id_fkey(id, product_id, qty_stock_out, actual_count_stock_out, product:product_id(*)), warehouse:warehouse_id(*)'

/**
 * Products that cannot be transferred because they carry no selling price.
 *
 * A branch sells what it receives, and POS prices a line from
 * products.selling_price — so shipping an unpriced product puts stock on a
 * shelf that can only be rung up at zero. Treating 0 the same as NULL is
 * deliberate: both ring up free, and the catalogue currently has both.
 *
 * Checked at request AND at approve. A guard only at the point of entry is not
 * a guard: a price can be cleared between raising a request and approving it.
 */
async function findUnpricedProducts(productIds: number[]) {
  const ids = [...new Set(productIds)]
  if (!ids.length) return []
  const { data } = await supabase
    .from('products')
    .select('id, product_name, selling_price')
    .in('id', ids)
  return (data ?? [])
    .filter((p) => p.selling_price == null || Number(p.selling_price) <= 0)
    .map((p) => p.product_name ?? `#${p.id}`)
}

function unpricedMessage(names: string[]) {
  const shown = names.slice(0, 3).join(', ')
  const more = names.length > 3 ? ` and ${names.length - 3} more` : ''
  return `Cannot transfer ${shown}${more} — no selling price set. Set a selling price on the product first, otherwise the branch can only sell it for ₱0.00.`
}

function mapRowToTransfer(row: any): StockTransferType {
  return {
    id:           row.id,
    created_at:   row.created_at,
    transfer_no:  row.transfer_no,
    warehouse_id: row.warehouse_id,
    warehouse:    row.warehouse,
    status:       row.status,
    remarks:      row.remarks,
    requested_by: row.created_by,
    approved_by:  row.approved_by,
    received_by:  row.received_by,
    approved_at:  row.approved_at,
    received_at:  row.received_at,
    updated_at:   row.updated_at,
    stock_transfer_items: (row.transaction_items ?? []).map((li: any) => ({
      id:            li.id,
      product_id:    li.product_id,
      requested_qty: li.qty_stock_out,
      received_qty:  li.actual_count_stock_out,
      product:       li.product,
    })),
  }
}

export const useStockTransfersDataStore = defineStore('stockTransfersData', () => {
  const authStore = useAuthUserStore()

  const transfers: Ref<StockTransferType[]> = ref([])
  const currentTransfer: Ref<StockTransferType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')
  const pendingTransfers = computed(() => transfers.value.filter(t => t.status === 'pending_approval'))

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }
  const clearError = () => { error.value = '' }

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value
    realtimeStatus.value = 'subscribing'
    const channel = supabase
      .channel('stock-transfers-channel')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: 'transaction_type=eq.stock_transfer' },
        async () => { await fetchTransfers() })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') realtimeStatus.value = 'subscribed'
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') realtimeStatus.value = 'error'
      })
    realtimeChannel.value = channel
    return channel
  }

  const stopRealtime = async () => {
    const channel = realtimeChannel.value
    if (!channel) return
    realtimeChannel.value = null
    realtimeStatus.value = 'idle'
    await supabase.removeChannel(channel)
  }

  const fetchTransfers = async (options: FetchTransfersOptions = {}) => {
    loading.value = true
    clearError()
    try {
      const { warehouseId, status, orderBy = 'created_at', ascending = false } = options
      let q = supabase.from('transactions').select(SELECT_TRANSFER).eq('transaction_type', 'stock_transfer')
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      if (status) q = q.eq('status', status)
      q = q.order(orderBy, { ascending })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      transfers.value = (data || []).map(mapRowToTransfer)
      return transfers.value
    } catch (err) {
      handleError(err, 'Failed to fetch stock transfers')
      return []
    } finally {
      loading.value = false
    }
  }

  // Header + items + reference_no in one client sequence (was stock_transfer_create).
  // Best-effort, not atomic: a failure between the header insert and the items
  // insert leaves an orphan header, and the reference_no is generated by a
  // read-max-and-increment without a server-side lock, so a rare concurrent
  // collision is possible (accepted trade-off, JS-over-RPC convention).
  const createTransferRequest = async (
    warehouseId: number,
    items: StockTransferLineInput[],
    remarks?: string,
  ) => {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }
    if (!items.length) {
      toast.warning('Add at least one product to the transfer request.')
      loading.value = false
      return { success: false }
    }

    // No is_active filter: `warehouses` has no such column (schema finalised).
    const { data: warehouse, error: warehouseError } = await supabase
      .from('warehouses')
      .select('id')
      .eq('id', warehouseId)
      .maybeSingle()
    if (warehouseError || !warehouse) {
      loading.value = false
      toast.error('Destination warehouse not found.')
      return { success: false }
    }

    const unpriced = await findUnpricedProducts(items.map(i => i.product_id))
    if (unpriced.length) {
      toast.error(unpricedMessage(unpriced))
      loading.value = false
      return { success: false }
    }

    const year = new Date().getFullYear().toString()
    const { data: created, docNo: transferNo, error: insertError } = await insertWithDocRetry<{ id: number }>(
      () => generateNextNumber('transfer_no', `ST-${year}-`, ['reference_no']),
      async (docNo) => supabase
        .from('transactions')
        .insert({
          transfer_no: docNo,
          transaction_type: 'stock_transfer',
          status: 'pending_approval',
          warehouse_id: warehouseId,
          remarks: remarks || null,
          created_by: user.id,
        })
        .select('id')
        .single(),
    )

    if (insertError || !created) {
      handleError(insertError, 'Failed to create stock transfer request.')
      toast.error(insertError?.message || 'Failed to create stock transfer request.')
      loading.value = false
      return { success: false }
    }

    // One insert per line now that line values live on transaction_items.
    // Requested quantity is outbound from the warehouse -> qty_stock_out.
    const { error: itemsError } = await supabase
      .from('transaction_items')
      .insert(items.map(item => ({
        transaction_id: created.id,
        product_id: item.product_id,
        qty_stock_out: item.requested_qty,
      })))
    if (itemsError) {
      handleError(itemsError, 'Failed to save transfer line items.')
      toast.error(itemsError.message || 'Failed to save transfer line items.')
      loading.value = false
      return { success: false }
    }

    const { error: logError } = await supabase.from('logs').insert({
      action: 'requested', description: `Stock transfer ${transferNo} requested`,
      module: 'warehouse', created_by: user.id, transaction_id: created.id,
    })
    if (logError) console.warn('createTransferRequest: activity log insert failed:', logError.message)

    toast.success(`Stock transfer ${transferNo} requested successfully.`)
    await fetchTransfers()
    loading.value = false
    return { success: true }
  }

  // Warehouse approves: deduct products.current_stock per line (was transfer_approve).
  // Checks every line's stock first, then deducts — avoids applying a partial
  // deduction when a later line fails the static insufficient-stock check, though
  // it's still not atomic against concurrent stock changes (accepted trade-off).
  const approveTransfer = async (transferId: number) => {
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return false }

    loading.value = true

    const { data: transfer, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, transaction_items!transaction_items_transaction_id_fkey(product_id, qty_stock_out)')
      .eq('id', transferId)
      .eq('transaction_type', 'stock_transfer')
      .maybeSingle()

    if (fetchError || !transfer) {
      loading.value = false
      handleError(fetchError, 'Transfer not found.')
      toast.error(fetchError?.message || 'Transfer not found.')
      return false
    }
    if (transfer.status !== 'pending_approval') {
      loading.value = false
      toast.error('Transfer is not pending approval.')
      return false
    }

    const lines = ((transfer.transaction_items ?? []) as unknown as { product_id: number; qty_stock_out: number | null }[])
      .map(li => ({ product_id: li.product_id, qty: li.qty_stock_out ?? 0 }))
    const unpriced = await findUnpricedProducts(lines.map(l => l.product_id))
    if (unpriced.length) {
      loading.value = false
      toast.error(unpricedMessage(unpriced))
      return false
    }

    const stockChecks: { product_id: number; qty: number; current_stock: number }[] = []
    for (const line of lines) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('current_stock')
        .eq('id', line.product_id)
        .maybeSingle()
      if (productError || !product || (product.current_stock ?? 0) < line.qty) {
        loading.value = false
        toast.error(`Insufficient warehouse stock for product ${line.product_id}.`)
        return false
      }
      stockChecks.push({ product_id: line.product_id, qty: line.qty, current_stock: product.current_stock ?? 0 })
    }

    for (const check of stockChecks) {
      const { error: updateStockError } = await supabase
        .from('products')
        .update({ current_stock: check.current_stock - check.qty })
        .eq('id', check.product_id)
      if (updateStockError) {
        loading.value = false
        handleError(updateStockError, 'Failed to deduct warehouse stock.')
        toast.error(updateStockError.message || 'Failed to deduct warehouse stock (partway through — verify stock manually).')
        return false
      }
    }

    const nowIso = new Date().toISOString()
    const { error: statusError } = await supabase
      .from('transactions')
      .update({ status: 'approved', approved_by: user.id, approved_at: nowIso, updated_at: nowIso })
      .eq('id', transferId)
    if (statusError) {
      loading.value = false
      handleError(statusError, 'Failed to approve stock transfer.')
      toast.error(statusError.message || 'Failed to approve stock transfer.')
      return false
    }

    const { error: logError } = await supabase.from('logs').insert({
      action: 'approved', description: 'Stock transfer approved',
      module: 'warehouse', created_by: user.id, transaction_id: transferId,
    })
    if (logError) console.warn('approveTransfer: activity log insert failed:', logError.message)

    loading.value = false
    toast.success('Stock transfer approved and deducted from warehouse stock.')
    await fetchTransfers()
    return true
  }

  // Status flip + activity log — done in JS per the "no RPC under ~10 round-trips"
  // convention (was transfer_reject). The .eq('status','pending_approval') guard
  // reproduces the RPC's "not pending" rejection; the log is best-effort (a failed
  // log doesn't roll back the status, accepted per the convention — non-financial).
  const rejectTransfer = async (transferId: number) => {
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return false }

    loading.value = true
    const nowIso = new Date().toISOString()
    const { data: updated, error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'rejected', approved_by: user.id, approved_at: nowIso, updated_at: nowIso })
      .eq('id', transferId)
      .eq('transaction_type', 'stock_transfer')
      .eq('status', 'pending_approval')
      .select('id')

    if (updateError) {
      loading.value = false
      handleError(updateError, 'Failed to reject stock transfer.')
      toast.error(updateError.message || 'Failed to reject stock transfer.')
      return false
    }
    if (!updated || updated.length === 0) {
      loading.value = false
      toast.error('Transfer is not pending approval.')
      return false
    }

    const { error: logError } = await supabase.from('logs').insert({
      action: 'rejected', description: 'Stock transfer rejected',
      module: 'warehouse', created_by: user.id, transaction_id: transferId,
    })
    if (logError) console.warn('rejectTransfer: activity log insert failed:', logError.message)

    loading.value = false
    toast.success('Stock transfer rejected.')
    await fetchTransfers()
    return true
  }

  // Branch receives: record received_qty per line + add to warehouse_products (was
  // transfer_receive). Best-effort, not atomic: a failure partway through a
  // multi-line receipt can leave some lines recorded / stock updated and others
  // not (accepted trade-off, JS-over-RPC convention) — status stays 'approved'
  // in that case so the UI lets the caller retry. Each line is guarded by its
  // own actual_count_stock_out (skip if already set) so a retry can't
  // re-credit the branch for lines that already fully succeeded.
  const receiveTransfer = async (
    transferId: number,
    receivedItems: { item_id: number; received_qty: number }[],
  ) => {
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return false }

    loading.value = true

    const { data: transfer, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, warehouse_id')
      .eq('id', transferId)
      .eq('transaction_type', 'stock_transfer')
      .maybeSingle()

    if (fetchError || !transfer) {
      loading.value = false
      handleError(fetchError, 'Transfer not found.')
      toast.error(fetchError?.message || 'Transfer not found.')
      return false
    }
    if (transfer.status !== 'approved') {
      loading.value = false
      toast.error('Transfer is not approved.')
      return false
    }
    if (!transfer.warehouse_id) {
      loading.value = false
      toast.error('Transfer has no destination warehouse.')
      return false
    }

    for (const received of receivedItems) {
      // Guard against a retry (after a partial earlier failure) re-crediting
      // the branch for a line that already fully succeeded: a non-null
      // actual_count_stock_out means this line's stock was already applied.
      const { data: item, error: itemFetchError } = await supabase
        .from('transaction_items')
        .select('product_id, actual_count_stock_out')
        .eq('id', received.item_id)
        .eq('transaction_id', transferId)
        .maybeSingle()
      if (itemFetchError) {
        loading.value = false
        handleError(itemFetchError, 'Failed to record received quantity.')
        toast.error(itemFetchError.message || 'Failed to record received quantity.')
        return false
      }
      if (!item?.product_id) continue
      if (item.actual_count_stock_out != null) continue

      // The branch's row for this product. Scoped to a real warehouse_id, so it
      // can never match a MAIN-warehouse row (those carry warehouse_id NULL and
      // hold the reservation FKs -- crediting one here would corrupt them).
      const { data: existingStock } = await supabase
        .from('warehouse_products')
        .select('id, total_qty')
        .eq('warehouse_id', transfer.warehouse_id)
        .eq('product_id', item.product_id)
        .maybeSingle()

      // Apply the stock credit first, mark the line as received last — so
      // "actual_count_stock_out is set" reliably implies "stock was applied."
      // A branch that has never held this product gets its row created here.
      const { error: stockError } = existingStock
        ? await supabase
            .from('warehouse_products')
            .update({ total_qty: (existingStock.total_qty ?? 0) + received.received_qty })
            .eq('id', existingStock.id)
        : await supabase
            .from('warehouse_products')
            .insert({
              warehouse_id: transfer.warehouse_id,
              product_id: item.product_id,
              total_qty: received.received_qty,
              is_main_warehouse: false,
            })

      if (stockError) {
        loading.value = false
        handleError(stockError, 'Failed to update warehouse stock.')
        toast.error(stockError.message || 'Failed to update warehouse stock.')
        return false
      }

      const { error: itemError } = await supabase
        .from('transaction_items')
        .update({ actual_count_stock_out: received.received_qty })
        .eq('id', received.item_id)
      if (itemError) {
        loading.value = false
        handleError(itemError, 'Failed to record received quantity.')
        toast.error(itemError.message || 'Failed to record received quantity.')
        return false
      }
    }

    const nowIso = new Date().toISOString()
    const { error: statusError } = await supabase
      .from('transactions')
      .update({ status: 'completed', received_by: user.id, received_at: nowIso, updated_at: nowIso })
      .eq('id', transferId)
    if (statusError) {
      loading.value = false
      handleError(statusError, 'Failed to complete stock transfer.')
      toast.error(statusError.message || 'Failed to complete stock transfer.')
      return false
    }

    const { error: logError } = await supabase.from('logs').insert({
      action: 'received', description: `Stock transfer received into warehouse ${transfer.warehouse_id}`,
      module: 'warehouse', created_by: user.id, transaction_id: transferId,
    })
    if (logError) console.warn('receiveTransfer: activity log insert failed:', logError.message)

    loading.value = false
    toast.success('Stock transfer received and warehouse stock updated.')
    await fetchTransfers()
    return true
  }

  const resetStore = () => {
    transfers.value = []
    currentTransfer.value = undefined
    loading.value = false
    error.value = ''
  }

  return {
    transfers,
    currentTransfer,
    loading,
    error,
    isLoading,
    hasError,
    isRealtimeSubscribed,
    pendingTransfers,
    fetchTransfers,
    createTransferRequest,
    approveTransfer,
    rejectTransfer,
    receiveTransfer,
    clearError,
    resetStore,
    startRealtime,
    stopRealtime,
  }
})
