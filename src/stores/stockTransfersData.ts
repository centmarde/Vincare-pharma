import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { generateNextNumber, insertWithDocRetry, describeProduct, toLocalISODate } from '@/utils/helpers'
import { issueRow, useIssueList } from '@/composables/useIssueList'
import type { IssueRow } from '@/composables/useIssueList'
import type { ProductType } from '@/stores/productsData'
import { useProductsDataStore } from '@/stores/productsData'
import type { WarehouseType } from '@/stores/warehouseData'

const toast = useToast()
// Lists of products (short, unpriced, to fix by hand) go to the issue dialog;
// the toast is kept for one-line errors and notices.
const issues = useIssueList()

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

/**
 * Another batch / brand of a requested product the warehouse could send
 * instead. One `products` row is one batch, so "the same product" is every
 * row that shares the generic name.
 */
export type TransferSubstitute = {
  id: number
  product_name: string | null
  brand: string | null
  batch_no: string | null
  expiry_date: string | null
  unit: string | null
  current_stock: number
  selling_price: number | null
  /** Units of this batch other lines of the same transfer already ask for. */
  already_on_transfer: number
  /** Why it cannot be sent, if it cannot (no selling price, not enough stock). */
  blocked: string | null
}

/** A line the warehouse changed to another batch, as logged. */
export type TransferSubstitutionNote = { created_at: string; description: string }

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
  if (!ids.length) return { rows: [] as IssueRow[], failed: false }
  const { data, error } = await supabase
    .from('products')
    .select('id, product_name, sku, batch_no, expiry_date, selling_price')
    .in('id', ids)
  // A failed lookup is NOT "everything is priced". Swallowing the error here
  // would turn the guard into a no-op exactly when it cannot be trusted, so the
  // caller is told the check could not run and refuses rather than proceeding.
  if (error || !data) return { rows: [] as IssueRow[], failed: true }
  return {
    // Each row carries SKU, batch AND the product id. The catalogue has
    // duplicate names -- two rows can share a name AND a SKU with only one of
    // them priced -- so the name alone would read as the row the user just
    // priced when it is the other.
    rows: data
      .filter((p) => p.selling_price == null || Number(p.selling_price) <= 0)
      .map((p) => issueRow(p, p.id as number, 'No selling price set')),
    failed: false,
  }
}

/** The unpriced products, listed in the issue dialog rather than a toast. */
function reportUnpriced(rows: IssueRow[]) {
  issues.showIssues({
    title: 'Products with no selling price',
    message: 'These cannot be transferred yet. Set a selling price on each product first, otherwise the branch can only sell it for ₱0.00.',
    rows,
  })
}

/**
 * A batch swap holds the transfer for the moment it changes a line: its status
 * reads 'line_change' instead of 'pending_approval'. Approve claims only a
 * 'pending_approval' row and a swap only locks one, so the two can never
 * interleave (an approval deducting one batch while the line records another).
 * Shown as Pending Approval everywhere; a lock older than this is a swap that
 * died part-way, and the next swap or approval clears it.
 */
const lineChangeStatus = 'line_change'
const staleLineChangeMs = 2 * 60 * 1000

/** Clears a swap lock left behind by a swap that never finished. True when the transfer is pending again. */
async function clearStaleLineChange(transferId: number, updatedAt: string | null): Promise<boolean> {
  if (!updatedAt || Date.now() - new Date(updatedAt).getTime() < staleLineChangeMs) return false
  const { data } = await supabase
    .from('transactions').update({ status: 'pending_approval', updated_at: new Date().toISOString() })
    .eq('id', transferId).eq('status', lineChangeStatus).eq('updated_at', updatedAt)
    .select('id')
  return !!data?.length
}

function mapRowToTransfer(row: any): StockTransferType {
  return {
    id:           row.id,
    created_at:   row.created_at,
    transfer_no:  row.transfer_no,
    warehouse_id: row.warehouse_id,
    warehouse:    row.warehouse,
    // A swap's momentary lock is still a pending transfer to everyone looking.
    status:       row.status === lineChangeStatus ? 'pending_approval' : row.status,
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

/**
 * Lines a store action can accept. Checked here, not only in the form, so a
 * caller that skips the form's validation cannot save a zero or negative line.
 */
function invalidLines(items: { product_id: number | null; requested_qty: number }[]): boolean {
  return items.some((i) => i.product_id == null || !Number.isFinite(i.requested_qty) || i.requested_qty <= 0)
}

export const useStockTransfersDataStore = defineStore('stockTransfersData', () => {
  const authStore = useAuthUserStore()
  const productsStore = useProductsDataStore()

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

    const priceCheck = await findUnpricedProducts(items.map(i => i.product_id))
    if (priceCheck.failed) {
      toast.error('Could not verify selling prices. Try again before requesting this transfer.')
      loading.value = false
      return { success: false }
    }
    if (priceCheck.rows.length) {
      reportUnpriced(priceCheck.rows)
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

  // ─── Drafts ──────────────────────────────────────────────────────────────
  // A transfer still being prepared: saved, editable, not yet a request.
  //
  // No ST number until it is submitted — the same rule Ethical drafts follow,
  // so an abandoned draft never leaves a gap in the series. A draft is
  // invisible to everything downstream: approveTransfer acts only on
  // 'pending_approval', and stock reconciliation counts only 'approved' and
  // 'completed'. Every write below is guarded on status = 'draft', so a draft
  // submitted or deleted in another tab cannot be overwritten from this one.

  /** Create a draft, or replace an existing draft's warehouse, remarks and lines. */
  async function saveTransferDraft(
    payload: { draftId?: number | null; warehouseId: number | null; items: StockTransferLineInput[]; remarks?: string },
    options: { silent?: boolean } = {},
  ): Promise<{ success: boolean; draftId?: number }> {
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }
    if (!payload.items.length) {
      toast.warning('Add at least one product before saving the draft.')
      return { success: false }
    }
    if (invalidLines(payload.items)) {
      toast.warning('Every line needs a product and a quantity greater than 0.')
      return { success: false }
    }

    loading.value = true
    let draftId = payload.draftId ?? null
    let oldLineIds: number[] = []

    if (draftId) {
      const { data: updated, error: updateError } = await supabase
        .from('transactions')
        .update({ warehouse_id: payload.warehouseId, remarks: payload.remarks || null, updated_at: new Date().toISOString() })
        .eq('id', draftId)
        .eq('transaction_type', 'stock_transfer')
        .eq('status', 'draft')
        .select('id')
      if (updateError || !updated?.length) {
        loading.value = false
        handleError(updateError, 'Draft not found.')
        toast.error(updateError?.message || 'This draft was already submitted or deleted.')
        return { success: false }
      }
      // Must succeed: without the old line ids they cannot be removed after the
      // new ones go in, and the draft would silently carry both sets — doubling
      // what it asks for on submit.
      const { data: oldLines, error: oldLinesError } = await supabase
        .from('transaction_items').select('id').eq('transaction_id', draftId)
      if (oldLinesError) {
        loading.value = false
        handleError(oldLinesError, 'Failed to save the draft.')
        toast.error('Could not read the draft\'s current lines. Nothing was changed — try again.')
        return { success: false }
      }
      oldLineIds = (oldLines ?? []).map((l) => l.id as number)
    } else {
      const { data: created, error: insertError } = await supabase
        .from('transactions')
        .insert({
          transaction_type: 'stock_transfer',
          status: 'draft',
          warehouse_id: payload.warehouseId,
          remarks: payload.remarks || null,
          created_by: user.id,
        })
        .select('id')
        .single()
      if (insertError || !created) {
        loading.value = false
        handleError(insertError, 'Failed to save the draft.')
        toast.error(insertError?.message || 'Failed to save the draft.')
        return { success: false }
      }
      draftId = created.id as number
    }

    // New lines first, old ones removed after: if the insert fails, an edited
    // draft keeps the lines it had instead of being left with none.
    const { data: newLines, error: itemsError } = await supabase
      .from('transaction_items')
      .insert(payload.items.map(item => ({
        transaction_id: draftId,
        product_id: item.product_id,
        qty_stock_out: item.requested_qty,
      })))
      .select('id')
    if (itemsError) {
      // A brand-new draft with no lines is useless — remove it.
      if (!payload.draftId) await supabase.from('transactions').delete().eq('id', draftId).eq('status', 'draft')
      loading.value = false
      handleError(itemsError, 'Failed to save the draft lines.')
      toast.error(itemsError.message || 'Failed to save the draft lines.')
      return { success: false }
    }
    if (oldLineIds.length) {
      const { error: cleanupError } = await supabase.from('transaction_items').delete().in('id', oldLineIds)
      if (cleanupError) {
        // Old and new lines would both be on the draft. Take the new ones back
        // out so it stays exactly as it was, and say the save did not happen.
        const newIds = (newLines ?? []).map((l) => l.id as number)
        if (newIds.length) await supabase.from('transaction_items').delete().in('id', newIds)
        loading.value = false
        handleError(cleanupError, 'Failed to save the draft.')
        toast.error('The draft could not be updated. It was left as it was — try again.')
        return { success: false }
      }
    }

    if (!options.silent) toast.success('Draft saved.')
    await fetchTransfers()
    loading.value = false
    return { success: true, draftId }
  }

  /** Turn a draft into a request: price check, then mint its ST number. */
  async function submitTransferDraft(draftId: number): Promise<{ success: boolean }> {
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }

    loading.value = true
    const { data: draft, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, warehouse_id, transaction_items!transaction_items_transaction_id_fkey(product_id, qty_stock_out)')
      .eq('id', draftId)
      .eq('transaction_type', 'stock_transfer')
      .maybeSingle()
    if (fetchError || !draft || draft.status !== 'draft') {
      loading.value = false
      handleError(fetchError, 'Draft not found.')
      toast.error(fetchError?.message || 'This draft was already submitted or deleted.')
      return { success: false }
    }
    if (!draft.warehouse_id) {
      loading.value = false
      toast.warning('Pick a destination warehouse before submitting.')
      return { success: false }
    }
    // The same check a direct request makes: the warehouse may have been
    // removed since the draft was saved.
    const { data: warehouse } = await supabase
      .from('warehouses').select('id').eq('id', draft.warehouse_id).maybeSingle()
    if (!warehouse) {
      loading.value = false
      toast.error('The destination warehouse on this draft no longer exists. Pick another one.')
      return { success: false }
    }
    const lines = (draft.transaction_items ?? []) as unknown as { product_id: number; qty_stock_out: number | null }[]
    if (!lines.length) {
      loading.value = false
      toast.warning('Add at least one product before submitting.')
      return { success: false }
    }
    if (invalidLines(lines.map((l) => ({ product_id: l.product_id, requested_qty: Number(l.qty_stock_out) })))) {
      loading.value = false
      toast.warning('Every line needs a product and a quantity greater than 0.')
      return { success: false }
    }

    const priceCheck = await findUnpricedProducts(lines.map(l => l.product_id))
    if (priceCheck.failed) {
      loading.value = false
      toast.error('Could not verify selling prices. Try again before requesting this transfer.')
      return { success: false }
    }
    if (priceCheck.rows.length) {
      loading.value = false
      reportUnpriced(priceCheck.rows)
      return { success: false }
    }

    const year = new Date().getFullYear().toString()
    const { data: submitted, docNo: transferNo, error: submitError } = await insertWithDocRetry<{ id: number }>(
      () => generateNextNumber('transfer_no', `ST-${year}-`, ['reference_no']),
      async (docNo) => supabase
        .from('transactions')
        .update({ transfer_no: docNo, status: 'pending_approval', updated_at: new Date().toISOString() })
        .eq('id', draftId)
        .eq('status', 'draft')
        .select('id')
        .maybeSingle(),
    )
    if (submitError || !submitted) {
      loading.value = false
      handleError(submitError, 'Failed to submit the draft.')
      toast.error(submitError?.message || 'This draft was already submitted or deleted.')
      return { success: false }
    }

    const { error: logError } = await supabase.from('logs').insert({
      action: 'requested', description: `Stock transfer ${transferNo} requested`,
      module: 'warehouse', created_by: user.id, transaction_id: draftId,
    })
    if (logError) console.warn('submitTransferDraft: activity log insert failed:', logError.message)

    toast.success(`Stock transfer ${transferNo} requested successfully.`)
    await fetchTransfers()
    loading.value = false
    return { success: true }
  }

  /** Delete a draft outright — it was never a document, so there is nothing to void. */
  async function deleteTransferDraft(draftId: number): Promise<{ success: boolean }> {
    clearError()
    loading.value = true
    // Claimed in ONE guarded write before anything is removed. Checking the
    // status and then deleting left a gap: a submit landing in between would
    // have its lines deleted out from under a live request. Once flipped, a
    // submit can no longer match it ('draft' only), and if a step below fails
    // the row stays visible as Cancelled rather than half-deleted.
    const { data: claimed, error: claimError } = await supabase
      .from('transactions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', draftId)
      .eq('transaction_type', 'stock_transfer')
      .eq('status', 'draft')
      .select('id')
    if (claimError || !claimed?.length) {
      loading.value = false
      handleError(claimError, 'Draft not found.')
      toast.error(claimError?.message || 'Only a draft can be deleted — this transfer was already submitted.')
      return { success: false }
    }
    const { error: itemsError } = await supabase.from('transaction_items').delete().eq('transaction_id', draftId)
    if (itemsError) {
      loading.value = false
      handleError(itemsError, 'Failed to delete the draft.')
      toast.error(itemsError.message || 'Failed to delete the draft.')
      return { success: false }
    }
    const { error: deleteError } = await supabase
      .from('transactions').delete().eq('id', draftId).eq('status', 'cancelled')
    if (deleteError) {
      loading.value = false
      handleError(deleteError, 'Failed to delete the draft.')
      toast.error(deleteError.message || 'Failed to delete the draft.')
      return { success: false }
    }
    toast.success('Draft deleted.')
    await fetchTransfers()
    loading.value = false
    return { success: true }
  }

  /**
   * Warehouse on-hand per product, read fresh. Lets an approver see which
   * lines are short before pressing Approve. Null when the read fails — the
   * caller shows nothing rather than a guess, and approveTransfer still checks.
   */
  async function fetchMainStock(productIds: number[]): Promise<Map<number, number> | null> {
    if (!productIds.length) return new Map()
    const { data, error: stockError } = await supabase
      .from('products')
      .select('id, current_stock')
      .in('id', productIds)
    if (stockError) {
      console.warn('fetchMainStock: could not read warehouse stock:', stockError.message)
      return null
    }
    return new Map((data ?? []).map((p) => [p.id as number, (p.current_stock as number | null) ?? 0]))
  }

  /** "ACETYLCYSTEINE  200MG" and "acetylcysteine 200mg" are the same product. */
  function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
    const norm = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
    return !!norm(a) && norm(a) === norm(b)
  }

  /**
   * The other batches / brands of a requested product that the main warehouse
   * could send in its place: same generic name, stock on hand, not expired, not
   * disposed. Soonest expiry first, so the oldest good stock goes out first.
   * `qtyNeeded` marks the ones that cannot cover the line; `alreadyNeeded`
   * (units per product the transfer's other lines ask for) counts against the
   * same stock, since Approve totals per product.
   */
  async function fetchTransferSubstitutes(
    productId: number,
    qtyNeeded: number,
    alreadyNeeded: Map<number, number> = new Map(),
  ): Promise<TransferSubstitute[] | null> {
    const { data: requested, error: requestedError } = await supabase
      .from('products').select('id, product_name').eq('id', productId).maybeSingle()
    if (requestedError || !requested?.product_name) return requestedError ? null : []
    const today = toLocalISODate(new Date())
    // Names are stored with stray spaces ("CETIRIZINE 10MG TAB 100'S "), so
    // match word by word and let sameName() keep only the exact product.
    const words = requested.product_name.trim().split(/\s+/).filter(Boolean)
    const { data, error: listError } = await supabase
      .from('products')
      .select('id, product_name, brand, batch_no, expiry_date, unit, current_stock, selling_price, is_disposed')
      .ilike('product_name', `%${words.join('%')}%`)
      .neq('id', productId)
      .gt('current_stock', 0)
      .order('expiry_date', { ascending: true, nullsFirst: false })
    if (listError) {
      console.warn('fetchTransferSubstitutes failed:', listError.message)
      return null
    }
    return ((data ?? []) as any[])
      // The pattern is loose (and ilike treats _ and % as wildcards); keep only real name matches.
      .filter((p) => sameName(p.product_name, requested.product_name))
      .filter((p) => !p.is_disposed)
      .filter((p) => !p.expiry_date || String(p.expiry_date).slice(0, 10) >= today)
      .map((p) => {
        const stock = Number(p.current_stock ?? 0)
        const price = p.selling_price == null ? null : Number(p.selling_price)
        const already = alreadyNeeded.get(p.id) ?? 0
        return {
          id: p.id,
          product_name: p.product_name ?? null,
          brand: p.brand ?? null,
          batch_no: p.batch_no ?? null,
          expiry_date: p.expiry_date ?? null,
          unit: p.unit ?? null,
          current_stock: stock,
          selling_price: price,
          already_on_transfer: already,
          blocked: !(price && price > 0)
            ? 'No selling price set'
            : stock < qtyNeeded + already
              ? already
                ? `Only ${stock} on hand — ${already} already on this transfer`
                : `Only ${stock} on hand`
              : null,
        }
      })
  }

  /**
   * The approver sends a different batch / brand for one line of a pending
   * transfer. Only while it is Pending Approval — approving then checks and
   * deducts the batch actually chosen, and the branch receives that batch.
   * The swap is logged with both batches, so the change is never silent.
   * `expectedProductId` is the batch the approver saw on the line: if someone
   * else changed it meanwhile, nothing is overwritten.
   */
  async function substituteTransferLine(
    transferId: number,
    lineId: number,
    newProductId: number,
    expectedProductId?: number | null,
  ): Promise<{ success: boolean }> {
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }

    const { data: transfer, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, updated_at, transfer_no, transaction_items!transaction_items_transaction_id_fkey(id, product_id, qty_stock_out)')
      .eq('id', transferId)
      .eq('transaction_type', 'stock_transfer')
      .maybeSingle()
    if (fetchError || !transfer) { toast.error('Transfer not found.'); return { success: false } }
    if (transfer.status === lineChangeStatus && !(await clearStaleLineChange(transferId, transfer.updated_at))) {
      toast.error('Another line on this transfer is being changed right now. Try again in a moment.')
      return { success: false }
    }
    if (transfer.status !== 'pending_approval' && transfer.status !== lineChangeStatus) {
      toast.error('Only a transfer waiting for approval can have a line changed.')
      return { success: false }
    }
    const line = ((transfer.transaction_items ?? []) as unknown as { id: number; product_id: number }[])
      .find((li) => li.id === lineId)
    if (!line) { toast.error('That line is no longer on this transfer.'); return { success: false } }
    if (line.product_id === newProductId) return { success: true }
    if (expectedProductId != null && line.product_id !== expectedProductId) {
      toast.error('Someone else changed this line while you were choosing. Reopen the transfer and try again.')
      return { success: false }
    }

    const { data: pair, error: pairError } = await supabase
      .from('products')
      .select('id, product_name, brand, batch_no, expiry_date, sku, selling_price, is_disposed')
      .in('id', [line.product_id, newProductId])
    const from = (pair ?? []).find((p) => p.id === line.product_id)
    const to = (pair ?? []).find((p) => p.id === newProductId)
    if (pairError || !to) { toast.error('Could not read the batch to send instead.'); return { success: false } }
    if (from && !sameName(from.product_name, to.product_name)) {
      toast.error('Only another batch or brand of the same product can be sent instead.')
      return { success: false }
    }
    if (to.is_disposed) { toast.error('That batch has been disposed.'); return { success: false } }
    // The list was read when the dialog opened; the batch may have expired since.
    if (to.expiry_date && String(to.expiry_date).slice(0, 10) < toLocalISODate(new Date())) {
      toast.error('That batch has expired. Pick another one.')
      return { success: false }
    }
    if (!(Number(to.selling_price) > 0)) {
      toast.error('That batch has no selling price, so the branch could not sell it. Set its price first.')
      return { success: false }
    }

    // Hold the transfer while the line changes (see lineChangeStatus): an
    // approval can't claim it now, and if it was approved a moment ago this
    // finds nothing to lock.
    const { data: locked, error: lockError } = await supabase
      .from('transactions')
      .update({ status: lineChangeStatus, updated_at: new Date().toISOString() })
      .eq('id', transferId)
      .eq('status', 'pending_approval')
      .select('id')
    if (lockError || !locked?.length) {
      handleError(lockError, 'Failed to change the batch.')
      toast.error(lockError?.message || 'This transfer was approved or changed while you were choosing. Reopen it and try again.')
      return { success: false }
    }

    // Guarded on the line still holding the batch the approver saw, so two
    // people changing the same line cannot overwrite each other unnoticed.
    const { data: updated, error: updateError } = await supabase
      .from('transaction_items')
      .update({ product_id: newProductId })
      .eq('id', lineId)
      .eq('transaction_id', transferId)
      .eq('product_id', line.product_id)
      .select('id')

    // Release the hold whatever happened; the new updated_at also refreshes
    // every open screen (realtime watches transactions).
    const { data: released, error: releaseError } = await supabase
      .from('transactions')
      .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
      .eq('id', transferId)
      .eq('status', lineChangeStatus)
      .select('id')
    if (releaseError || !released?.length) {
      console.warn('substituteTransferLine: could not release the transfer:', releaseError?.message)
      toast.warning('The transfer may show as busy for up to two minutes; it frees itself after that.')
    }

    if (updateError || !updated?.length) {
      handleError(updateError, 'Failed to change the batch.')
      toast.error(updateError?.message || 'The line changed while you were choosing. Reopen the transfer and try again.')
      return { success: false }
    }

    const describe = (prod: any) => [
      prod?.brand, prod?.batch_no ? `batch ${prod.batch_no}` : null,
      prod?.expiry_date ? `exp ${String(prod.expiry_date).slice(0, 7)}` : null,
    ].filter(Boolean).join(', ') || `product #${prod?.id}`
    const { error: logError } = await supabase.from('logs').insert({
      action: 'line_substituted', module: 'warehouse', created_by: user.id, transaction_id: transferId,
      description: `${transfer.transfer_no ?? 'Transfer'}: ${to.product_name ?? 'product'} — sending ${describe(to)} instead of ${describe(from)}`,
    })
    if (logError) console.warn('substituteTransferLine: activity log insert failed:', logError.message)

    toast.success(`Line changed — sending ${describe(to)}.`)
    return { success: true }
  }

  /** Lines the warehouse switched to another batch, oldest first (from the activity log). */
  async function fetchSubstitutionNotes(transferId: number): Promise<TransferSubstitutionNote[]> {
    const { data, error: notesError } = await supabase
      .from('logs')
      .select('created_at, description')
      .eq('transaction_id', transferId)
      .eq('action', 'line_substituted')
      .order('created_at', { ascending: true })
    if (notesError) {
      console.warn('fetchSubstitutionNotes failed:', notesError.message)
      return []
    }
    return (data ?? []) as TransferSubstitutionNote[]
  }

  // Warehouse approves: deduct products.current_stock per product (was transfer_approve).
  //
  // 1. Read-only checks: prices, then stock per product — every shortage listed.
  // 2. CLAIM the transfer: flip pending_approval -> approved in one guarded
  //    write. A double-click or a second approver finds nothing to flip and
  //    stops there; before, both passed the status check and both deducted.
  // 3. Deduct each product through adjustMainStock, which cannot overwrite a
  //    movement that lands at the same time.
  // 4. Any failure after the claim puts back what was deducted and returns the
  //    transfer to Pending Approval, so a retry starts clean instead of
  //    deducting a second time.
  const approveTransfer = async (transferId: number) => {
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return false }

    loading.value = true

    const { data: transfer, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, updated_at, transaction_items!transaction_items_transaction_id_fkey(product_id, qty_stock_out)')
      .eq('id', transferId)
      .eq('transaction_type', 'stock_transfer')
      .maybeSingle()

    if (fetchError || !transfer) {
      loading.value = false
      handleError(fetchError, 'Transfer not found.')
      toast.error(fetchError?.message || 'Transfer not found.')
      return false
    }
    if (transfer.status === lineChangeStatus && !(await clearStaleLineChange(transferId, transfer.updated_at))) {
      loading.value = false
      toast.error('A line on this transfer is being changed right now. Try approving again in a moment.')
      return false
    }
    if (transfer.status !== 'pending_approval' && transfer.status !== lineChangeStatus) {
      loading.value = false
      toast.error('Transfer is not pending approval.')
      return false
    }

    const lines = ((transfer.transaction_items ?? []) as unknown as { product_id: number; qty_stock_out: number | null }[])
      .map(li => ({ product_id: li.product_id, qty: li.qty_stock_out ?? 0 }))
    const priceCheck = await findUnpricedProducts(lines.map(l => l.product_id))
    if (priceCheck.failed) {
      loading.value = false
      toast.error('Could not verify selling prices. Try again before approving this transfer.')
      return false
    }
    if (priceCheck.rows.length) {
      loading.value = false
      reportUnpriced(priceCheck.rows)
      return false
    }

    // Totalled per product: two lines of the same product were checked one at a
    // time (each could pass while the pair exceeded stock), and the second
    // deduction then overwrote the first from the same stale starting figure.
    const needed = new Map<number, number>()
    for (const line of lines) needed.set(line.product_id, (needed.get(line.product_id) ?? 0) + line.qty)

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, product_name, sku, batch_no, expiry_date, current_stock')
      .in('id', [...needed.keys()])
    if (productsError) {
      loading.value = false
      handleError(productsError, 'Could not check warehouse stock.')
      toast.error('Could not check warehouse stock. Nothing was approved — try again.')
      return false
    }
    const productById = new Map((products ?? []).map((p) => [p.id as number, p]))

    // Every short line is reported at once, by name and batch — not the first
    // one only, by id ("product 11"), which sent staff to look them up one by
    // one between attempts.
    const stockChecks: { product_id: number; qty: number; current_stock: number }[] = []
    const shortages: IssueRow[] = []
    for (const [productId, qty] of needed) {
      const product = productById.get(productId)
      const onHand = product?.current_stock ?? 0
      if (!product || onHand < qty) {
        shortages.push(issueRow(product, productId, product ? `Needs ${qty} · ${onHand} on hand` : 'Product not found'))
        continue
      }
      stockChecks.push({ product_id: productId, qty, current_stock: onHand })
    }
    // Listed in the issue dialog, not a toast: a toast naming every short line
    // ran off the screen on a long transfer.
    if (shortages.length) {
      loading.value = false
      issues.showIssues({
        title: 'Not enough warehouse stock',
        message: 'This transfer was not approved. The main warehouse is short of these products:',
        rows: shortages,
        footnote: 'The transfer also lists its short lines first, marked in red.',
      })
      return false
    }

    const nowIso = new Date().toISOString()
    const { data: claimed, error: claimError } = await supabase
      .from('transactions')
      .update({ status: 'approved', approved_by: user.id, approved_at: nowIso, updated_at: nowIso })
      .eq('id', transferId)
      .eq('transaction_type', 'stock_transfer')
      .eq('status', 'pending_approval')
      .select('id')
    if (claimError || !claimed?.length) {
      loading.value = false
      handleError(claimError, 'Failed to approve stock transfer.')
      toast.error(claimError?.message || 'This transfer was already approved or rejected.')
      await fetchTransfers()
      return false
    }

    // A batch swap can land between the read above and the claim. Deduct only
    // if the lines are still what was checked; otherwise reopen for a re-check.
    const { data: lineRecheck, error: lineRecheckError } = await supabase
      .from('transaction_items').select('product_id, qty_stock_out').eq('transaction_id', transferId)
    const signature = (rows: { product_id: number; qty: number }[]) =>
      rows.map((r) => `${r.product_id}:${r.qty}`).sort().join('|')
    const linesNow = ((lineRecheck ?? []) as { product_id: number; qty_stock_out: number | null }[])
      .map((li) => ({ product_id: li.product_id, qty: li.qty_stock_out ?? 0 }))
    if (lineRecheckError || signature(linesNow) !== signature(lines)) {
      // Checked like the recovery below: if the reopen fails the transfer
      // still reads Approved with nothing deducted, and the branch could
      // receive goods that never left — that must be said, not "try again".
      const { data: reopened, error: reopenError } = await supabase
        .from('transactions')
        .update({ status: 'pending_approval', approved_by: null, approved_at: null, updated_at: new Date().toISOString() })
        .eq('id', transferId)
        .eq('status', 'approved')
        .select('id')
      const stillApproved = !!reopenError || !reopened?.length
      loading.value = false
      const why = lineRecheckError
        ? 'Could not re-read the transfer lines. Nothing was deducted'
        : 'A line was changed while approving. Nothing was deducted'
      toast.error(stillApproved
        ? `${why}, but the transfer still shows as Approved — set it back to Pending Approval before anyone receives it.`
        : `${why} — review the transfer and approve again.`, { timeout: stillApproved ? 20000 : 15000 })
      await fetchTransfers()
      return false
    }

    const deducted: { productId: number; qty: number }[] = []
    for (const check of stockChecks) {
      const result = await productsStore.adjustMainStock(check.product_id, -check.qty)
      if (result.ok) {
        deducted.push({ productId: check.product_id, qty: check.qty })
        continue
      }
      // Put back what was taken and reopen the transfer for approval.
      const unrestored: IssueRow[] = []
      for (const d of deducted) {
        const back = await productsStore.adjustMainStock(d.productId, d.qty)
        if (!back.ok) unrestored.push(issueRow(productById.get(d.productId), d.productId, `${d.qty} not put back — correct by hand`))
      }
      // Checked: if the reopen fails, the transfer still reads Approved with no
      // stock moved, and the branch could receive goods that never left.
      const { data: reopened, error: reopenError } = await supabase
        .from('transactions')
        .update({ status: 'pending_approval', approved_by: null, approved_at: null, updated_at: new Date().toISOString() })
        .eq('id', transferId)
        .eq('status', 'approved')
        .select('id')
      const stillApproved = !!reopenError || !reopened?.length
      const label = describeProduct(productById.get(check.product_id), check.product_id)
      const why = result.reason === 'insufficient'
        ? `${label} now has only ${result.onHand ?? 0} on hand (it changed while approving)`
        : `stock for ${label} could not be updated (${result.message ?? result.reason})`
      const stillApprovedNote = 'The transfer still shows as Approved — set it back to Pending Approval before anyone receives it.'
      loading.value = false
      if (unrestored.length) {
        // Products to fix by hand: a list, so the issue dialog.
        issues.showIssues({
          title: 'Transfer not approved — stock needs correcting',
          message: `Not approved: ${why}. Stock was taken for these products and could not be put back:`,
          rows: unrestored,
          footnote: stillApproved ? stillApprovedNote : 'The transfer is back to Pending Approval.',
        })
      } else {
        toast.error(
          stillApproved
            ? `Not approved: ${why}. Nothing was deducted. ${stillApprovedNote}`
            : `Not approved: ${why}. Nothing was deducted; the transfer is back to Pending Approval.`,
          { timeout: stillApproved ? 20000 : 15000 },
        )
      }
      await fetchTransfers()
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
    saveTransferDraft,
    submitTransferDraft,
    deleteTransferDraft,
    approveTransfer,
    fetchMainStock,
    fetchTransferSubstitutes,
    substituteTransferLine,
    fetchSubstitutionNotes,
    rejectTransfer,
    receiveTransfer,
    clearError,
    resetStore,
    startRealtime,
    stopRealtime,
  }
})
