import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useCanvassDataStore } from '@/stores/canvassData'
import { useDeliveryReceiptsDataStore } from '@/stores/deliveryReceiptsData'
import { useGLDataStore } from '@/stores/glData'
import { useCustomersDataStore } from '@/stores/customersData'
import { useStockSourcingStore } from '@/stores/stockSourcingData'
import type { StockLocationId } from '@/stores/stockSourcingData'
import { glAccountCodeFor } from '@/stores/financeData'
import { generateNextNumber, insertWithDocRetry } from '@/utils/helpers'
import type { ProductType } from '@/stores/productsData'
import { useProductsDataStore } from '@/stores/productsData'
import type { CustomerType } from '@/stores/customersData'
import type { AgentType } from '@/stores/agentsData'
import type { OutletType } from '@/stores/outletsData'
import type { Shortfall, CanvassSelection, CanvassPRResult } from '@/utils/canvassTypes'

const toast = useToast()

export type { Shortfall, CanvassSelection, CanvassPRResult }

export type EthicalItemType = {
  id: number
  product_id: number | null
  quantity: number
  unit_price: number
  line_total: number
  /** Cost snapshot taken when the line was entered — what the GL relieves. */
  cost_price: number | null
  delivered_qty: number
  product?: ProductType | null
}

export type CollectionType = {
  id: number
  created_at: string
  transaction_id: number | null
  amount: number | null
  payment_method: string | null
  reference_no: string | null
  collected_by: string | null
  agent_id: number | null
  commission_rate: number | null
  commission_amount: number | null
  commission_status: string | null
  commission_paid_at: string | null
  remarks: string | null
  // Soft void (20260720000000). Every fetch here filters voided rows out, so
  // this is null in practice — present so a future "voided payments" view can
  // read it without a type change.
  voided_at?: string | null
  void_reason?: string | null
}

export type RebateStatus = 'pending_approval' | 'approved' | 'paid' | 'rejected'
export type RebatePaymentMethod = 'cash' | 'gcash' | 'cheque' | 'bank' | 'other'

export type EthicalOrderType = {
  id: number
  created_at: string
  order_no: string | null
  outlet_id: number | null
  outlet?: OutletType | null
  /** Where the stock comes from (null = main warehouse). */
  warehouse_id: number | null
  customer_id: number | null
  agent_id: number | null
  status: string | null
  fulfillment_status: string | null
  subtotal: number | null
  total_amount: number | null
  discount_amount: number | null
  rebate_amount: number | null
  /** In-kind marketing give applied to this order. Posts to 6010, not 6030. */
  ads_amount: number | null
  terms_days: number | null
  due_date: string | null
  amount_paid: number | null
  paid_at: string | null
  created_by: string | null
  remarks: string | null
  rebate_status: RebateStatus | null
  rebate_approved_by: string | null
  rebate_approved_at: string | null
  rebate_rejected_reason: string | null
  rebate_paid_at: string | null
  rebate_payment_method: RebatePaymentMethod | null
  rebate_reference: string | null
  rebate_paid_to: string | null
  rebate_cash_account_id: number | null
  customer?: CustomerType | null
  agent?: AgentType | null
  items?: EthicalItemType[]
  collections?: CollectionType[]
}

export type EthicalLineInput = {
  product_id: number
  quantity: number
  unit_price: number
  /** Cost at the moment of invoicing — what the GL relieves from inventory. */
  cost_price?: number | null
}

type FetchOrdersOptions = {
  status?: string
  agentId?: number
  customerId?: number
  orderBy?: 'created_at' | 'due_date' | 'total_amount'
  ascending?: boolean
}

type CommissionSummaryRow = {
  agent_id: number | null
  agent_name: string | null
  total_commission: number
  unpaid_commission: number
  paid_commission: number
}

// Line values live directly on transaction_items (transaction_item_details was
// merged back in). An ethical order is outbound, so the ordered quantity is
// qty_stock_out and the delivered/sourced count is actual_count_stock_out.
const SELECT_ORDER =
  '*, transaction_items!transaction_items_transaction_id_fkey(id, product_id, qty_stock_out, unit_price, line_total, cost_price, actual_count_stock_out, stock_sources, product:product_id(*)), customer:customer_id(*), agent:agent_id(*), outlet:outlet_id(*), ethical_details(*)'

function mapRow(row: any): EthicalOrderType {
  const details = row.ethical_details ?? {}
  const discountAmount = details.discount_amount ?? 0
  const rebateAmount = details.rebate_amount ?? 0
  const adsAmount = details.ads_amount ?? 0
  return {
    id:             row.id,
    created_at:     row.created_at,
    order_no:       row.ethical_no,
    outlet_id:      row.outlet_id,
    outlet:         row.outlet,
    warehouse_id:   row.warehouse_id ?? null,
    customer_id:    row.customer_id,
    agent_id:       row.agent_id,
    status:         row.status,
    fulfillment_status: details.fulfillment_status ?? null,
    // total_amount = subtotal − discount (rebate is a separate payout, never
    // part of the invoice), so subtotal reconstructs as total + discount only.
    subtotal:       (row.total_amount ?? 0) + discountAmount,
    total_amount:   row.total_amount,
    discount_amount: discountAmount,
    rebate_amount:  rebateAmount,
    ads_amount:     adsAmount,
    terms_days:     details.terms_days ?? null,
    due_date:       details.due_date ?? null,
    amount_paid:    details.amount_paid ?? 0,
    paid_at:        details.paid_at ?? null,
    created_by:     row.created_by,
    remarks:        row.remarks,
    rebate_status:  details.rebate_status ?? null,
    rebate_approved_by: details.rebate_approved_by ?? null,
    rebate_approved_at: details.rebate_approved_at ?? null,
    rebate_rejected_reason: details.rebate_rejected_reason ?? null,
    rebate_paid_at: details.rebate_paid_at ?? null,
    rebate_payment_method: details.rebate_payment_method ?? null,
    rebate_reference: details.rebate_reference ?? null,
    rebate_paid_to: details.rebate_paid_to ?? null,
    rebate_cash_account_id: details.rebate_cash_account_id ?? null,
    customer:       row.customer,
    agent:          row.agent,
    items: (row.transaction_items ?? []).map((li: any) => ({
      id:            li.id,
      product_id:    li.product_id,
      quantity:      li.qty_stock_out,
      unit_price:    li.unit_price,
      line_total:    li.line_total,
      cost_price:    li.cost_price ?? null,
      delivered_qty: li.actual_count_stock_out ?? 0,
      product:       li.product,
    })),
  }
}

export const useEthicalDataStore = defineStore('ethicalData', () => {
  const authStore = useAuthUserStore()
  const canvassStore = useCanvassDataStore()
  const drStore = useDeliveryReceiptsDataStore()
  const customersStore = useCustomersDataStore()
  const glStore = useGLDataStore()
  const sourcingStore = useStockSourcingStore()
  const productsStore = useProductsDataStore()

  const orders: Ref<EthicalOrderType[]> = ref([])
  const currentOrder: Ref<EthicalOrderType | undefined> = ref(undefined)
  const collections: Ref<CollectionType[]> = ref([])
  const commissionSummary: Ref<CommissionSummaryRow[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)

  const handleError = (err: unknown, msg: string) => { error.value = err instanceof Error ? err.message : msg }
  const clearError = () => { error.value = '' }

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value
    const channel = supabase
      .channel('ethical-channel')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: 'transaction_type=eq.ethical_order' },
        async () => { await fetchOrders() })
      .subscribe()
    realtimeChannel.value = channel
    return channel
  }

  const stopRealtime = async () => {
    const channel = realtimeChannel.value
    if (!channel) return
    realtimeChannel.value = null
    await supabase.removeChannel(channel)
  }

  const fetchOrders = async (options: FetchOrdersOptions = {}) => {
    loading.value = true
    clearError()
    try {
      const { status, agentId, customerId, orderBy = 'created_at', ascending = false } = options
      let q = supabase.from('transactions').select(SELECT_ORDER).eq('transaction_type', 'ethical_order')
      if (status) q = q.eq('status', status)
      if (agentId) q = q.eq('agent_id', agentId)
      if (customerId) q = q.eq('customer_id', customerId)
      q = q.order(orderBy, { ascending })
      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      orders.value = (data || []).map(mapRow)
      return orders.value
    } catch (err) {
      handleError(err, 'Failed to fetch ethical orders')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchOrderById = async (id: number): Promise<EthicalOrderType | null> => {
    const { data, error: e } = await supabase
      .from('transactions')
      .select(SELECT_ORDER)
      .eq('id', id)
      .single()
    if (e || !data) { handleError(e, 'Failed to load order'); return null }
    return mapRow(data)
  }

  // ---- Draft → invoice -------------------------------------------------------
  // An ethical order starts as a DRAFT while the client is still haggling:
  // lines, quantities, prices and terms stay editable, no stock moves, nothing
  // is booked, and it carries NO EO number — the EO series is the invoice
  // series, so minting one for a draft that is later discarded would leave a
  // gap in it. confirmDraft() locks the terms: it mints the number, draws the
  // stock and flips the order to 'invoiced'. createOrder() is simply the two in
  // one go, so direct invoicing and draft confirmation share one code path.

  type OrderPayload = {
    customerId: number
    agentId?: number | null
    outletId: number
    sourceLocationId: StockLocationId
    discount?: number
    rebate?: number
    ads?: number        // in-kind marketing give — posts to 6010, not 6030
    termsDays?: number
    remarks?: string
    lines: EthicalLineInput[]
  }

  // Validates the branch + stock location. Shared by save and confirm: a draft
  // can sit for days, and the branch may be deactivated in the meantime.
  async function validateLocations(outletId: number | null, sourceLocationId: StockLocationId | undefined): Promise<boolean> {
    if (!outletId) { toast.warning('Select a branch.'); return false }
    if (sourceLocationId === undefined) { toast.warning('Select where the stock comes from.'); return false }

    const { data: outlet, error: outletError } = await supabase
      .from('outlets')
      .select('channel')
      .eq('id', outletId)
      .eq('is_active', true)
      .maybeSingle()
    if (outletError || !outlet) { toast.error('Branch not found or inactive.'); return false }
    if (outlet.channel !== 'ethical') { toast.error('That branch is not an ethical branch.'); return false }

    // A branch must be a real warehouse. The main warehouse (null) has no row to
    // check — it is the products table itself.
    if (sourceLocationId != null) {
      const { data: warehouse, error: warehouseError } = await supabase
        .from('warehouses')
        .select('id')
        .eq('id', sourceLocationId)
        .maybeSingle()
      if (warehouseError || !warehouse) { toast.error('Stock location not found.'); return false }
    }
    return true
  }

  // Create a new draft, or overwrite an existing one (draftId). A draft has no
  // stock or ledger effect, so its lines are simply replaced wholesale.
  // Best-effort, not atomic (JS-over-RPC convention) — but a half-written draft
  // is harmless: it is visible, editable and deletable, and books nothing.
  async function saveDraft(payload: OrderPayload & { draftId?: number }, options: { silent?: boolean } = {}) {
    loading.value = true
    clearError()
    try {
      const { user, error: authError } = await authStore.getCurrentUser()
      if (authError || !user) { toast.error('User not authenticated.'); return { success: false as const } }
      if (!payload.lines.length) { toast.warning('Add at least one line item.'); return { success: false as const } }
      if (!(await validateLocations(payload.outletId, payload.sourceLocationId))) return { success: false as const }

      const subtotal = payload.lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)
      const discount = payload.discount ?? 0
      // Discount is an on-invoice price reduction, so it lowers the total. The
      // rebate is a deferred incentive PAID OUT SEPARATELY (cash/GCash per the
      // customer's rebate_payment_mode) — it's recorded on the order for the
      // eventual payout but must NOT reduce what the customer owes here.
      const total = subtotal - discount
      if (total < 0) { toast.error('Total amount cannot be negative after discount.'); return { success: false as const } }

      const header = {
        // outlet_id = WHO SOLD IT (the ethical branch).
        // warehouse_id = WHERE THE STOCK WILL COME FROM — null means the main
        // warehouse. cancelOrder reads it back to return the goods there.
        outlet_id: payload.outletId,
        warehouse_id: payload.sourceLocationId,
        customer_id: payload.customerId, agent_id: payload.agentId ?? null,
        total_amount: total, remarks: payload.remarks || null,
        updated_at: new Date().toISOString(),
      }

      let orderId: number
      if (payload.draftId) {
        const { data: updated, error: updateError } = await supabase
          .from('transactions')
          .update(header)
          .eq('id', payload.draftId)
          .eq('transaction_type', 'ethical_order')
          .eq('status', 'draft')   // terms are locked once invoiced
          .select('id')
          .maybeSingle()
        if (updateError) { handleError(updateError, 'Failed to save draft.'); toast.error(updateError.message || 'Failed to save draft.'); return { success: false as const } }
        if (!updated) { toast.error('This order is no longer a draft — its terms are locked.'); return { success: false as const } }
        orderId = updated.id

        const { error: clearLinesError } = await supabase.from('transaction_items').delete().eq('transaction_id', orderId)
        if (clearLinesError) { handleError(clearLinesError, 'Failed to save draft lines.'); toast.error(clearLinesError.message || 'Failed to save draft lines.'); return { success: false as const } }
      } else {
        const { data: created, error: insertError } = await supabase
          .from('transactions')
          .insert({ ...header, transaction_type: 'ethical_order', status: 'draft', created_by: user.id })
          .select('id')
          .single()
        if (insertError || !created) { handleError(insertError, 'Failed to create draft.'); toast.error(insertError?.message || 'Failed to create draft.'); return { success: false as const } }
        orderId = created.id

        // Record the customer's home channel on first transaction — only when blank,
        // so a cross-channel order never relabels an already-stamped customer.
        // Best-effort, never blocks the order. See customersData.stampDepartmentIfBlank.
        await customersStore.stampDepartmentIfBlank(payload.customerId, 'ethical')
      }

      const { error: linesError } = await supabase
        .from('transaction_items')
        .insert(payload.lines.map((l) => ({
          // An ethical order is outbound -> qty_stock_out. Nothing is sourced
          // yet, so actual_count_stock_out stays 0 until confirmDraft.
          transaction_id: orderId, product_id: l.product_id,
          qty_stock_out: l.quantity, unit_price: l.unit_price,
          // Without this the GL reads cost from the live product master at
          // projection time (or books no COGS at all when it is null).
          cost_price: l.cost_price ?? null,
          line_total: l.quantity * l.unit_price,
          actual_count_stock_out: 0, stock_sources: null,
        })))
      if (linesError) { handleError(linesError, 'Failed to save draft lines.'); toast.error(linesError.message || 'Failed to save draft lines.'); return { success: false as const } }

      // due_date is set at confirm (terms run from the invoice date, not from
      // when the draft was started); fulfillment_status likewise.
      const { error: detailsError } = await supabase.from('ethical_details').upsert({
        transaction_id: orderId, terms_days: payload.termsDays ?? 0, due_date: null,
        discount_amount: discount, rebate_amount: payload.rebate ?? 0, ads_amount: payload.ads ?? 0,
        fulfillment_status: null, amount_paid: 0, paid_at: null,
      }, { onConflict: 'transaction_id' })
      if (detailsError) { handleError(detailsError, 'Failed to save order details.'); toast.error(detailsError.message || 'Failed to save order details.'); return { success: false as const } }

      const { error: logError } = await supabase.from('logs').insert({
        created_by: user.id, action: payload.draftId ? 'draft_updated' : 'draft_created',
        description: `Ethical draft #${orderId} ${payload.draftId ? 'updated' : 'saved'} — ${payload.lines.length} line(s), total ${total}`,
        module: 'ethical', transaction_id: orderId,
      })
      if (logError) console.warn('saveDraft: activity log insert failed:', logError.message)

      if (!options.silent) { toast.success('Draft saved.'); await fetchOrders() }
      return { success: true as const, orderId }
    } finally {
      loading.value = false
    }
  }

  // Lock the terms: mint the EO number, draw stock from the chosen location,
  // start the credit term, and flip draft → invoiced. Best-effort, not atomic:
  // a failure partway through can leave partial stock decrements (accepted
  // trade-off, JS-over-RPC convention).
  //
  // Stock comes from ONE location (the draft's warehouse_id; null = the main
  // warehouse) and nowhere else. A shortfall stays a shortfall and surfaces as
  // `awaiting_stock` for a transfer or a procurement request to resolve.
  async function confirmDraft(draftId: number, options: { silent?: boolean } = {}) {
    loading.value = true
    clearError()
    try {
      const { user, error: authError } = await authStore.getCurrentUser()
      if (authError || !user) { toast.error('User not authenticated.'); return { success: false as const } }

      const { data: draft, error: fetchError } = await supabase
        .from('transactions')
        .select('id, status, outlet_id, warehouse_id, ethical_details(terms_days), transaction_items!transaction_items_transaction_id_fkey(id, product_id, qty_stock_out)')
        .eq('id', draftId)
        .eq('transaction_type', 'ethical_order')
        .maybeSingle()
      if (fetchError || !draft) { handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.'); return { success: false as const } }
      if (draft.status !== 'draft') { toast.error('This order has already been invoiced.'); return { success: false as const } }

      const lines = ((draft.transaction_items ?? []) as unknown as { id: number; product_id: number; qty_stock_out: number | null }[])
        .map((li) => ({ id: li.id, product_id: li.product_id, quantity: li.qty_stock_out ?? 0 }))
      if (!lines.length) { toast.warning('Add at least one line item before invoicing.'); return { success: false as const } }

      const sourceLocationId = draft.warehouse_id as StockLocationId
      if (!(await validateLocations(draft.outlet_id, sourceLocationId))) return { success: false as const }

      // The SAME planner the order form previewed with, so what the user approved
      // and what gets written cannot disagree. Re-run here rather than trusting a
      // figure from the form: another order may have taken the stock since.
      const plan = await sourcingStore.planSourcing(sourceLocationId, lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })))
      // A failed stock read is NOT a shortage. Continuing here would invoice an
      // order sourced with nothing, turning a dropped connection into a backorder.
      if (!plan) { toast.error('Could not read stock for that location. The order was not invoiced.'); return { success: false as const } }

      // Claim the draft BEFORE any stock moves. The status-guarded update is
      // what stops a double click (or two users) from confirming — and drawing
      // stock — twice: only one of them can flip it out of 'draft'.
      const year = new Date().getFullYear().toString()
      const { data: claimed, docNo: orderNo, error: claimError } = await insertWithDocRetry<{ id: number }>(
        () => generateNextNumber('ethical_no', `EO-${year}-`, ['reference_no']),
        async (docNo) => supabase
          .from('transactions')
          .update({
            // Mirror the order number into reference_no too (parity with purchasing /
            // in-house). ethical_no stays the canonical per-type column; the
            // reference_no unique index already reserves the EO- prefix.
            ethical_no: docNo, reference_no: docNo,
            status: 'invoiced', updated_at: new Date().toISOString(),
            // The invoice date. created_at is when the DRAFT was started; the
            // GL projector books the sale on approved_at so revenue lands in
            // the period it was actually invoiced.
            approved_by: user.id, approved_at: new Date().toISOString(),
          })
          .eq('id', draftId)
          .eq('status', 'draft')
          .select('id')
          .maybeSingle(),
      )
      if (claimError) { handleError(claimError, 'Failed to invoice order.'); toast.error(claimError.message || 'Failed to invoice order.'); return { success: false as const } }
      if (!claimed) { toast.error('This order has already been invoiced.'); return { success: false as const } }

      // planSourcing zeroes an expired line rather than drawing it. Say so by
      // name: otherwise the line just lands short and staff go looking for
      // stock that is sitting on the shelf, unsellable.
      const expiredPlanned = plan.filter((p) => p.expired).map((p) => p.product_id)
      if (expiredPlanned.length) {
        const expiredProducts = await productsStore.fetchProductsByIds(expiredPlanned)
        const label = expiredProducts.length
          ? expiredProducts.map((p) => p.product_name).join(', ')
          : expiredPlanned.join(', ')
        toast.warning(`Expired, so not sourced: ${label}. Those lines are left awaiting stock.`)
      }

      let anyShort = false
      for (const [index, line] of lines.entries()) {
        const planned = plan[index]
        let sourced = 0

        if (planned && planned.take > 0) {
          const drawn = await sourcingStore.drawStock(sourceLocationId, line.product_id, planned.take)
          // A failed draw must not be recorded as delivered stock, or the order
          // claims goods that never left the shelf.
          if (drawn) sourced = planned.take
          else toast.warning(`Stock for product ${line.product_id} could not be drawn; line left unsourced.`)
        }
        if (sourced < line.quantity) anyShort = true

        if (sourced > 0) {
          // stock_sources held a {branch, warehouse} split back when one line
          // could be filled from two places at once. With a single chosen
          // source there is nothing to split: WHERE is transactions.warehouse_id
          // and HOW MANY is actual_count_stock_out.
          const { error: lineError } = await supabase
            .from('transaction_items')
            .update({ actual_count_stock_out: sourced })
            .eq('id', line.id)
          if (lineError) {
            console.warn(`confirmDraft: sourced count not recorded for line ${line.id}:`, lineError.message)
            toast.warning(`Stock was drawn for product ${line.product_id}, but the line did not record it. Verify manually.`)
          }
        }
      }

      // Terms run from the invoice date, not from when the draft was started.
      const termsDays = (draft.ethical_details as unknown as { terms_days: number | null } | null)?.terms_days ?? 0
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + termsDays)
      const { error: detailsError } = await supabase
        .from('ethical_details')
        .update({ due_date: dueDate.toISOString().slice(0, 10), fulfillment_status: anyShort ? 'awaiting_stock' : 'fulfilled' })
        .eq('transaction_id', draftId)
      if (detailsError) {
        console.warn('confirmDraft: ethical_details update failed:', detailsError.message)
        toast.warning('Order invoiced, but its due date / stock status did not save. Verify manually.')
      }

      const { error: logError } = await supabase.from('logs').insert({
        created_by: user.id, action: 'created', description: `Ethical order ${orderNo} invoiced`,
        module: 'ethical', transaction_id: draftId,
      })
      if (logError) console.warn('confirmDraft: activity log insert failed:', logError.message)

      if (!options.silent) toast.success(`Order ${orderNo} invoiced.`)
      await fetchOrders()
      return { success: true as const, orderId: draftId, orderNo }
    } finally {
      loading.value = false
    }
  }

  // Straight to invoice — a draft that is confirmed immediately. If the confirm
  // step fails, the order is left as a DRAFT (visible, editable, no stock moved)
  // rather than as a half-built invoice.
  async function createOrder(payload: OrderPayload) {
    const saved = await saveDraft(payload, { silent: true })
    if (!saved.success) return { success: false as const }
    const confirmed = await confirmDraft(saved.orderId, { silent: true })
    if (!confirmed.success) {
      toast.warning('The order was saved as a draft but not invoiced — retry to invoice it.')
      await fetchOrders()
      // The draft id is RETURNED on failure, not swallowed. Without it the form
      // stays in create mode, and pressing submit again runs saveDraft from
      // scratch — a second draft for the same order. The caller adopts this id
      // so a retry re-saves and re-confirms the draft that already exists.
      return { success: false as const, draftId: saved.orderId }
    }
    toast.success(`Ethical order ${confirmed.orderNo} created.`)
    return { success: true as const, orderId: confirmed.orderId }
  }

  // Discard a draft. It has no number, no stock movement and no ledger entry,
  // so it is removed outright rather than cancelled. Its activity logs are
  // kept: logs.transaction_id is ON DELETE SET NULL, so they survive unlinked,
  // and the discard itself is logged the same way.
  async function deleteDraft(draftId: number) {
    loading.value = true
    clearError()
    try {
      const { user, error: authError } = await authStore.getCurrentUser()
      if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }

      const { data: draft } = await supabase
        .from('transactions').select('id, status').eq('id', draftId).eq('transaction_type', 'ethical_order').maybeSingle()
      if (!draft || draft.status !== 'draft') { toast.error('Only drafts can be discarded.'); return { success: false } }

      // transaction_items is ON DELETE SET NULL (not cascade), so the lines
      // must go first or they would linger as orphans.
      for (const table of ['transaction_items', 'ethical_details'] as const) {
        const { error: childError } = await supabase.from(table).delete().eq('transaction_id', draftId)
        if (childError) { handleError(childError, 'Failed to discard draft.'); toast.error(childError.message || 'Failed to discard draft.'); return { success: false } }
      }
      const { error: deleteError } = await supabase
        .from('transactions').delete().eq('id', draftId).eq('status', 'draft')
      if (deleteError) { handleError(deleteError, 'Failed to discard draft.'); toast.error(deleteError.message || 'Failed to discard draft.'); return { success: false } }

      const { error: logError } = await supabase.from('logs').insert({
        created_by: user.id, action: 'draft_discarded', description: `Ethical draft #${draftId} discarded`,
        module: 'ethical', transaction_id: null,
      })
      if (logError) console.warn('deleteDraft: activity log insert failed:', logError.message)

      toast.success('Draft discarded.')
      await fetchOrders()
      return { success: true }
    } finally {
      loading.value = false
    }
  }

  // Insert a payment against the balance, update the cumulative amount_paid
  // cache, flip status (was ethical_record_collection).
  const recordCollection = async (payload: {
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
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
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
      const glResult = await glStore.postJournalEntry(
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

  // ---- Rebate payout workflow ---------------------------------------------
  // A rebate is earned per order, falls due only once that order is paid IN
  // FULL, and always needs approval before cash goes out. It's paid to the
  // client's purchaser (an individual), so it's a selling expense (6030), never
  // a discount off the invoice.

  const rebateQueue: Ref<EthicalOrderType[]> = ref([])

  // Orders whose rebate is live: fully paid, has a rebate, not yet settled or
  // rejected. rebate_status is null for orders paid before this workflow
  // existed, so treat null-on-a-paid-order as pending rather than stranding it.
  const fetchRebateQueue = async () => {
    loading.value = true
    clearError()
    try {
      const { data, error: fetchError } = await supabase
        .from('transactions')
        .select(SELECT_ORDER)
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
  const approveRebate = async (orderId: number) => {
    loading.value = true
    const { user, error: authError } = await authStore.getCurrentUser()
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
  const rejectRebate = async (orderId: number, reason: string) => {
    loading.value = true
    const { user, error: authError } = await authStore.getCurrentUser()
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
      const glResult = await glStore.postJournalEntry(
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
  const payRebate = async (payload: {
    orderId: number
    method: RebatePaymentMethod
    reference?: string
    paidTo: string
    cashAccountId: number
  }) => {
    loading.value = true
    const { user, error: authError } = await authStore.getCurrentUser()
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
    const glResult = await glStore.postJournalEntry(
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

  // Issue a Delivery Receipt for the fulfilled quantities. Document-only (stock
  // already moved at invoice) — was ethical_issue_dr; re-issuable (a reprint is
  // a fresh DR number). Returns the DR so the caller can print it immediately.
  const issueDeliveryReceipt = async (payload: {
    orderId: number
    receivedBy?: string
    remarks?: string
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, customer_id, ethical_no')
      .eq('id', payload.orderId)
      .eq('transaction_type', 'ethical_order')
      .maybeSingle()
    if (fetchError || !order) {
      handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.')
      loading.value = false; return { success: false }
    }
    if (order.status === 'cancelled') {
      toast.error('Cannot issue a DR for a cancelled order.'); loading.value = false; return { success: false }
    }
    if (order.status === 'draft') {
      toast.error('Invoice the order before issuing a DR.'); loading.value = false; return { success: false }
    }

    const { data: fulfilledItemRows, error: itemsError } = await supabase
      .from('transaction_items')
      .select('product_id, actual_count_stock_out, unit_price')
      .eq('transaction_id', payload.orderId)
      .gt('actual_count_stock_out', 0)
    if (itemsError) {
      handleError(itemsError, 'Failed to issue delivery receipt.')
      toast.error(itemsError.message || 'Failed to issue delivery receipt.')
      loading.value = false; return { success: false }
    }
    if (!fulfilledItemRows || fulfilledItemRows.length === 0) {
      toast.error('Nothing has been fulfilled on this order yet to receipt.')
      loading.value = false; return { success: false }
    }

    // actual_count_stock_out is CUMULATIVE (the order's running total, not a
    // per-delivery amount), so a second DR after a recheck resolves more of
    // the shortfall must only list the NEW quantity, not the full cumulative
    // total again — otherwise units already on a prior DR get re-listed as if
    // newly delivered. Subtract what earlier DRs for this order already put
    // on paper, per product.
    const { data: priorDrLines, error: priorDrError } = await supabase
      .from('delivery_receipts')
      .select('delivery_receipt_items(product_id, qty)')
      .eq('order_id', payload.orderId)
      .eq('source', 'ethical_order')
    if (priorDrError) {
      handleError(priorDrError, 'Failed to issue delivery receipt.')
      toast.error(priorDrError.message || 'Failed to issue delivery receipt.')
      loading.value = false; return { success: false }
    }
    const alreadyReceipted = new Map<number, number>()
    for (const dr of (priorDrLines ?? []) as { delivery_receipt_items: { product_id: number | null; qty: number }[] }[]) {
      for (const line of dr.delivery_receipt_items ?? []) {
        if (line.product_id == null) continue
        alreadyReceipted.set(line.product_id, (alreadyReceipted.get(line.product_id) ?? 0) + line.qty)
      }
    }

    const fulfilledItems = fulfilledItemRows
      .map((row: any) => {
        const already = row.product_id != null ? (alreadyReceipted.get(row.product_id) ?? 0) : 0
        return {
          product_id: row.product_id,
          delivered_qty: (row.actual_count_stock_out ?? 0) - already,
          unit_price: row.unit_price,
        }
      })
      .filter((item) => item.delivered_qty > 0)
    if (!fulfilledItems.length) {
      toast.error('Nothing new to receipt since the last delivery receipt.')
      loading.value = false; return { success: false }
    }

    // Document-only DR (no stock movement) into the dedicated tables via drStore.
    const dr = await drStore.createDeliveryReceipt({
      orderId: payload.orderId, orderNo: order.ethical_no, source: 'ethical_order', customerId: order.customer_id,
      poNo: null, receivedBy: payload.receivedBy || null,
      lines: fulfilledItems.map(item => ({
        product_id: item.product_id, qty: item.delivered_qty, unit_price: item.unit_price,
      })),
    }, user.id)
    if (!dr.success) {
      toast.error('Failed to issue delivery receipt.')
      loading.value = false; return { success: false }
    }
    const drNo = dr.drNo!

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'deliver', description: `Delivery receipt ${drNo} issued`,
      module: 'ethical', transaction_id: payload.orderId,
    })
    if (logError) console.warn('issueDeliveryReceipt: activity log insert failed:', logError.message)

    toast.success(`${drNo} issued.`)
    loading.value = false
    return { success: true, drId: dr.drId, drNo }
  }

  // Return the goods to the location they were drawn from, only for invoiced,
  // fully-fulfilled, uncollected orders (was ethical_cancel_order). The source
  // is transactions.warehouse_id (null = main warehouse); the quantity is the
  // line's actual_count_stock_out — what actually left, which is not always what
  // was ordered.
  const cancelOrder = async (orderId: number, reason: string) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, warehouse_id, ethical_details(fulfillment_status)')
      .eq('id', orderId)
      .eq('transaction_type', 'ethical_order')
      .maybeSingle()
    if (fetchError || !order) {
      handleError(fetchError, 'Order not found.'); toast.error(fetchError?.message || 'Order not found.')
      loading.value = false; return { success: false }
    }
    if (order.status !== 'invoiced') {
      toast.error('Only invoiced orders with no collections can be cancelled.'); loading.value = false; return { success: false }
    }
    const fulfillmentStatus = (order.ethical_details as unknown as { fulfillment_status: string | null } | null)?.fulfillment_status
    if (fulfillmentStatus !== 'fulfilled') {
      toast.error('Cannot cancel an order that is still awaiting stock.'); loading.value = false; return { success: false }
    }
    // Voided collections don't block cancellation — they no longer represent money received.
    const { count: collectionCount } = await supabase
      .from('collections').select('id', { count: 'exact', head: true }).eq('transaction_id', orderId).is('voided_at', null)
    if ((collectionCount ?? 0) > 0) {
      toast.error('Cannot cancel: order has collections.'); loading.value = false; return { success: false }
    }

    const { data: itemRows } = await supabase
      .from('transaction_items').select('product_id, actual_count_stock_out').eq('transaction_id', orderId)
    const items = (itemRows ?? []).map((row: any) => ({
      product_id: row.product_id as number | null,
      sourced: (row.actual_count_stock_out ?? 0) as number,
    }))

    // Best-effort restore, but — unlike other best-effort loops in this file —
    // a silent failure here used to leave stock permanently short while the
    // order still got marked 'cancelled' (implying the full restore
    // happened), with zero trace anywhere. Track failures so the log/toast
    // below actually reflect what happened.
    let restoreFailed = false
    for (const item of items) {
      if (item.product_id == null || item.sourced <= 0) continue
      const restored = await sourcingStore.returnStock(
        order.warehouse_id as StockLocationId,
        item.product_id,
        item.sourced,
      )
      if (!restored) {
        console.warn(`cancelOrder: stock restore failed for product ${item.product_id}`)
        restoreFailed = true
      }
    }

    const { error: statusError } = await supabase
      .from('transactions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)
    if (statusError) {
      handleError(statusError, 'Failed to cancel order.')
      toast.error(statusError.message || 'Failed to cancel order.')
      loading.value = false
      return { success: false }
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'cancelled',
      description: `Ethical order cancelled: ${reason || '(no reason)'}${restoreFailed ? ' — WARNING: stock restore partially failed, verify manually' : ''}`,
      module: 'ethical', transaction_id: orderId,
    })
    if (logError) console.warn('cancelOrder: activity log insert failed:', logError.message)

    if (restoreFailed) toast.warning('Order cancelled, but stock restore partially failed — verify stock manually.')
    else toast.success('Order cancelled and stock restored.')
    await fetchOrders()
    loading.value = false
    return { success: true }
  }

  // Re-attempt sourcing for short lines against the order's OWN location (was
  // ethical_recheck_stock). It never reaches into another location: the order is
  // bound to the source the user chose, and quietly filling it from elsewhere is
  // what this refactor removed.
  const recheckStock = async (orderId: number): Promise<Shortfall[]> => {
    const { data: order, error: fetchError } = await supabase
      .from('transactions').select('warehouse_id').eq('id', orderId).eq('transaction_type', 'ethical_order').maybeSingle()
    if (fetchError || !order) { handleError(fetchError, 'Failed to recheck stock'); return [] }
    const locationId = order.warehouse_id as StockLocationId

    // Supabase can't compare two columns server-side, so filter client-side.
    const { data: allLineRows } = await supabase
      .from('transaction_items')
      .select('id, product_id, qty_stock_out, actual_count_stock_out')
      .eq('transaction_id', orderId)
    const allLines = (allLineRows ?? []).map((row: any) => ({
      id: row.id,
      product_id: row.product_id,
      qty: row.qty_stock_out ?? 0,
      delivered_qty: row.actual_count_stock_out ?? 0,
    }))
    const shortLines = allLines.filter(l => l.delivered_qty < l.qty)

    // One planner call for every short line, so two lines naming the same
    // product can't both be promised the same units.
    const plan = await sourcingStore.planSourcing(
      locationId,
      shortLines.map(l => ({ product_id: l.product_id, quantity: l.qty - l.delivered_qty })),
    )
    // Same reasoning as createOrder: a failed read must not be mistaken for a
    // shortage, or a recheck would silently confirm the order is still short.
    if (!plan) {
      toast.error('Could not read stock for that location. Nothing was changed.')
      return []
    }

    const shortfall: Shortfall[] = []
    for (const [index, line] of shortLines.entries()) {
      const planned = plan[index]
      let sourced = 0

      if (planned && planned.take > 0) {
        const drawn = await sourcingStore.drawStock(locationId, line.product_id, planned.take)
        if (drawn) sourced = planned.take
      }
      const need = (line.qty - line.delivered_qty) - sourced

      await supabase.from('transaction_items')
        .update({ actual_count_stock_out: (line.delivered_qty ?? 0) + sourced })
        .eq('id', line.id)

      if (need > 0) {
        shortfall.push({
          product_id: line.product_id, ordered: line.qty,
          on_hand: (line.delivered_qty ?? 0) + sourced, needed: need,
        } as Shortfall)
      }
    }

    await supabase
      .from('ethical_details')
      .update({ fulfillment_status: shortfall.length > 0 ? 'awaiting_stock' : 'fulfilled' })
      .eq('transaction_id', orderId)

    await fetchOrders()
    return shortfall
  }

  // Commit a supplier canvass: create one PR per winning supplier (shared with
  // In-House via canvassData.ts — was the shared canvass_to_prs RPC).
  const canvassToPRs = async (orderId: number, selections: CanvassSelection[]) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }
    if (!selections.length) { toast.warning('Add at least one supplier selection.'); loading.value = false; return { success: false } }

    const result = await canvassStore.commitToPRs('ethical_order', orderId, selections, user.id)
    if (!result.success) {
      handleError(result.error, 'Failed to raise purchase requisitions.')
      toast.error(result.error || 'Failed to raise purchase requisitions.')
      loading.value = false; return { success: false }
    }
    const prs = result.prs ?? []
    toast.success(prs.length === 1
      ? `Raised ${prs[0].pr_no}.`
      : `Raised ${prs.length} purchase requisitions.`)
    await fetchOrders()
    loading.value = false
    return { success: true, prs }
  }

  // Voided collections are excluded: every consumer of this (order balances,
  // the Commissions view) is a money view, and a voided payment is no longer
  // money received. Its record lives on the change request + the activity log.
  const fetchCollections = async (orderId?: number): Promise<CollectionType[]> => {
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
  const markCommissionPaid = async (collectionId: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
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

  const fetchCommissionSummary = async (): Promise<CommissionSummaryRow[]> => {
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

  const resetStore = () => {
    orders.value = []
    currentOrder.value = undefined
    collections.value = []
    commissionSummary.value = []
    loading.value = false
    error.value = ''
  }

  return {
    orders, currentOrder, collections, commissionSummary, rebateQueue, loading, error,
    fetchOrders, fetchOrderById, createOrder, saveDraft, confirmDraft, deleteDraft, recordCollection, cancelOrder,
    recheckStock, canvassToPRs, issueDeliveryReceipt,
    fetchCollections, markCommissionPaid, fetchCommissionSummary,
    fetchRebateQueue, approveRebate, rejectRebate, payRebate,
    startRealtime, stopRealtime, clearError, resetStore,
  }
})
