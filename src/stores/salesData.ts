import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { generateNextNumber, insertWithDocRetry } from '@/utils/helpers'
import type { ProductType } from '@/stores/productsData'
import type { CustomerType } from '@/stores/customersData'
import type { OutletType } from '@/stores/outletsData'

const toast = useToast()

// Sales now live in the `transactions` hub as transaction_type = 'sale',
// with their lines in `transaction_items`. These types are the view-model the
// sales UI consumes; fetch maps the hub columns onto them so the composables
// and components are unaffected by the consolidation.
//
// Outlets are a real table now (see outletsData.ts) — branches are editable
// data, identified by outlet_id. No code here may hardcode a branch code.

export type SaleItemType = {
  id: number
  product_id: number | null
  quantity: number
  unit_price: number
  line_total: number
  product?: ProductType | null
}

export type SaleType = {
  id: number
  created_at: string
  sale_no: string | null
  outlet_id: number | null
  outlet?: OutletType | null
  status: string | null
  payment_method: string | null
  subtotal: number | null
  total_amount: number | null
  amount_tendered: number | null
  change_due: number | null
  cashier_id: string | null
  remittance_id: number | null
  customer_id: number | null
  customer?: CustomerType | null
  voided_at: string | null
  void_reason: string | null
  sale_items?: SaleItemType[]
}

export type SaleLineInput = {
  product_id: number
  quantity: number
  unit_price: number
}

type FetchSalesOptions = {
  outletId?: number
  unremittedOnly?: boolean
  dateFrom?: string
  dateTo?: string
  orderBy?: 'created_at' | 'total_amount'
  ascending?: boolean
}

// transactions + embedded items; mapped to SaleType in mapRowToSale().
// POS-specific fields live in pos_sale_details (hub redesign migration 0003).
// payment_method is the one field kept on transactions (also used by other
// transaction types) so we still fall back to row.payment_method for it.
// Line values live directly on transaction_items (transaction_item_details was
// merged back in). A sale is outbound, so the line quantity is qty_stock_out.
const SELECT_SALE = '*, transaction_items(id, product_id, qty_stock_out, unit_price, line_total, product:product_id(*)), customer:customer_id(*), outlet:outlet_id(*), pos_sale_details(*)'

function mapRowToSale(row: any): SaleType {
  const details = row.pos_sale_details ?? {}
  return {
    id:               row.id,
    created_at:       row.created_at,
    sale_no:          row.sale_no,
    outlet_id:        row.outlet_id,
    outlet:           row.outlet,
    status:           row.status,
    payment_method:   details.payment_method,
    subtotal:         details.subtotal,
    total_amount:     row.total_amount,
    amount_tendered:  details.amount_tendered,
    change_due:       details.change_due,
    cashier_id:       row.created_by,
    remittance_id:    row.remittance_id,
    customer_id:      row.customer_id,
    customer:         row.customer,
    voided_at:        details.voided_at,
    void_reason:      details.void_reason,
    sale_items: (row.transaction_items ?? []).map((li: any) => ({
      id:         li.id,
      product_id: li.product_id,
      quantity:   li.qty_stock_out,
      unit_price: li.unit_price,
      line_total: li.line_total,
      product:    li.product,
    })),
  }
}

export const useSalesDataStore = defineStore('salesData', () => {
  const authStore = useAuthUserStore()

  const sales: Ref<SaleType[]> = ref([])
  const currentSale: Ref<SaleType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }
  const clearError = () => { error.value = '' }

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value
    realtimeStatus.value = 'subscribing'
    const channel = supabase
      .channel('sales-channel')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: 'transaction_type=eq.sale' },
        async () => { await fetchSales() })
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

  const fetchSales = async (options: FetchSalesOptions = {}) => {
    loading.value = true
    clearError()
    try {
      const { outletId, unremittedOnly, dateFrom, dateTo, orderBy = 'created_at', ascending = false } = options

      let q = supabase.from('transactions').select(SELECT_SALE).eq('transaction_type', 'sale')

      if (outletId) q = q.eq('outlet_id', outletId)
      if (unremittedOnly) q = q.is('remittance_id', null).eq('status', 'completed')
      if (dateFrom) q = q.gte('created_at', dateFrom)
      if (dateTo) q = q.lte('created_at', dateTo)

      q = q.order(orderBy, { ascending })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      sales.value = (data || []).map(mapRowToSale)
      return sales.value
    } catch (err) {
      handleError(err, 'Failed to fetch sales')
      return []
    } finally {
      loading.value = false
    }
  }

  // Header + pos_sale_details + items + branch stock decrement (was
  // pos_create_sale). Not atomic — a failure partway through can leave
  // pos_sale_details/some items/some stock decrements written — but the
  // header always gets rolled back (deleted) on any downstream failure so a
  // partial sale never sits around with status='completed': remittancesData's
  // submitRemittance sums total_amount for every status='completed' sale, so
  // a stray "completed" row with no items/stock movement would silently
  // inflate expected cash. Assumes the cart already merges duplicate product
  // lines (existing POS UI behavior), so each product's on-hand snapshot only
  // needs to be read once per checkout.
  const rollbackSale = async (id: number) => {
    await supabase.from('transaction_items').delete().eq('transaction_id', id)
    await supabase.from('pos_sale_details').delete().eq('transaction_id', id)
    const { error } = await supabase.from('transactions').delete().eq('id', id).eq('transaction_type', 'sale')
    if (error) console.warn('createSale: rollback of partial sale failed — status=\'completed\' row left behind, id:', id, error.message)
  }

  const createSale = async (payload: {
    outletId: number
    lines: SaleLineInput[]
    amountTendered: number
    customer?: { name?: string | null; address?: string | null; mobile?: string | null }
  }) => {
    loading.value = true
    clearError()

    const { outletId, lines, amountTendered, customer } = payload

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }
    if (!outletId) {
      toast.warning('Select a branch first.')
      loading.value = false
      return { success: false }
    }
    if (!lines.length) {
      toast.warning('Cart is empty.')
      loading.value = false
      return { success: false }
    }

    const cashierName = user.user_metadata?.full_name ?? user.email ?? '—'

    const { data: outlet, error: outletError } = await supabase
      .from('outlets')
      .select('channel')
      .eq('id', outletId)
      .eq('is_active', true)
      .maybeSingle()
    if (outletError || !outlet) {
      toast.error('Outlet not found or inactive.')
      loading.value = false
      return { success: false }
    }
    if (outlet.channel !== 'pos') {
      toast.error('Outlet is not a POS outlet.')
      loading.value = false
      return { success: false }
    }

    const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)
    const total = subtotal
    if (amountTendered < total) {
      toast.error(`Amount tendered (${amountTendered}) is less than total (${total}).`)
      loading.value = false
      return { success: false }
    }

    const stockChecks: { product_id: number; onHand: number }[] = []
    for (const line of lines) {
      const { data: stockRow, error: stockError } = await supabase
        .from('outlet_stock')
        .select('quantity')
        .eq('outlet_id', outletId)
        .eq('product_id', line.product_id)
        .maybeSingle()
      if (stockError || !stockRow || stockRow.quantity < line.quantity) {
        toast.error(`Insufficient stock for product ${line.product_id}.`)
        loading.value = false
        return { success: false }
      }
      stockChecks.push({ product_id: line.product_id, onHand: stockRow.quantity })
    }

    const name = customer?.name?.trim() || null
    const address = customer?.address?.trim() || null
    const mobile = customer?.mobile?.trim() || null
    let customerId: number | null = null
    if (mobile) {
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('department', 'pos')
        .eq('contact_no', mobile)
        .limit(1)
        .maybeSingle()
      if (existingCustomer) customerId = existingCustomer.id
    }
    if (customerId) {
      await supabase
        .from('customers')
        .update({ ...(name ? { name } : {}), ...(address ? { address } : {}) })
        .eq('id', customerId)
    } else if (name || mobile) {
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({ name: name ?? 'Walk-in Customer', agency_type: 'private', contact_no: mobile, address, department: 'pos', is_active: true })
        .select('id')
        .single()
      if (customerError) {
        handleError(customerError, 'Failed to save customer.')
        toast.error(customerError.message || 'Failed to save customer.')
        loading.value = false
        return { success: false }
      }
      customerId = newCustomer?.id ?? null
    }

    const year = new Date().getFullYear().toString()
    const { data: created, docNo: saleNo, error: insertError } = await insertWithDocRetry<{ id: number }>(
      () => generateNextNumber('sale_no', `SO-${year}-`, ['reference_no']),
      async (docNo) => supabase
        .from('transactions')
        .insert({
          // Mirror the sale number into reference_no too (parity with purchasing /
          // in-house / ethical), so the transactions row shows its live document
          // number in the same column the other modules use. sale_no stays the
          // canonical per-type column; the reference_no unique index reserves SO-.
          reference_no: docNo,
          sale_no: docNo,
          transaction_type: 'sale',
          status: 'completed',
          outlet_id: outletId,
          total_amount: total,
          customer_id: customerId,
          created_by: user.id,
        })
        .select('id')
        .single(),
    )

    if (insertError || !created) {
      handleError(insertError, 'Failed to record sale.')
      toast.error(insertError?.message || 'Failed to record sale.')
      loading.value = false
      return { success: false }
    }

    const changeDue = amountTendered - total
    const { error: detailsError } = await supabase.from('pos_sale_details').insert({
      transaction_id: created.id,
      payment_method: 'cash',
      subtotal,
      amount_tendered: amountTendered,
      change_due: changeDue,
    })
    if (detailsError) {
      handleError(detailsError, 'Failed to save sale details.')
      toast.error(detailsError.message || 'Failed to save sale details.')
      await rollbackSale(created.id)
      loading.value = false
      return { success: false }
    }

    for (const line of lines) {
      // One insert per line now that line values live on transaction_items.
      // A sale is outbound -> qty_stock_out.
      const { error: itemError } = await supabase
        .from('transaction_items')
        .insert({
          transaction_id: created.id,
          product_id: line.product_id,
          qty_stock_out: line.quantity,
          unit_price: line.unit_price,
          line_total: line.quantity * line.unit_price,
        })
      if (itemError) {
        handleError(itemError, 'Failed to save sale line item.')
        toast.error(itemError.message || 'Failed to save sale line item.')
        await rollbackSale(created.id)
        loading.value = false
        return { success: false }
      }
      const check = stockChecks.find(c => c.product_id === line.product_id)
      const { error: stockUpdateError } = await supabase
        .from('outlet_stock')
        .update({ quantity: (check?.onHand ?? 0) - line.quantity, updated_at: new Date().toISOString() })
        .eq('outlet_id', outletId)
        .eq('product_id', line.product_id)
      if (stockUpdateError) {
        handleError(stockUpdateError, 'Failed to update branch stock.')
        toast.error(stockUpdateError.message || 'Failed to update branch stock (partway through — verify stock manually).')
        // Header/items/details still get rolled back so the sale doesn't get
        // swept into a remittance as "completed" — any stock already
        // decremented for earlier lines in this loop is NOT restored here
        // (pre-existing trade-off; the toast says to verify stock manually).
        await rollbackSale(created.id)
        loading.value = false
        return { success: false }
      }
    }

    const { error: logError } = await supabase.from('logs').insert({
      action: 'created', description: `POS sale ${saleNo} completed`,
      module: 'pos', created_by: user.id, transaction_id: created.id,
    })
    if (logError) console.warn('createSale: activity log insert failed:', logError.message)

    toast.success(`Sale ${saleNo} completed.`)
    loading.value = false
    return {
      success: true,
      saleNo,
      subtotal,
      total,
      change: changeDue,
      cashierName,
    }
  }

  // Void a completed, un-remitted sale and restore branch stock (was
  // pos_void_sale). Stock restore is best-effort per line — the void itself
  // (status flip) is not rolled back if a restore fails, since silently
  // un-voiding a sale the cashier already told the customer was voided would be
  // more confusing than a stock count that needs a manual correction.
  const voidSale = async (saleId: number, reason: string) => {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const { data: sale, error: fetchError } = await supabase
      .from('transactions')
      .select('id, status, remittance_id, outlet_id, transaction_items(product_id, qty_stock_out)')
      .eq('id', saleId)
      .eq('transaction_type', 'sale')
      .maybeSingle()

    if (fetchError || !sale) {
      handleError(fetchError, 'Sale not found.')
      toast.error(fetchError?.message || 'Sale not found.')
      loading.value = false
      return { success: false }
    }
    if (sale.status !== 'completed') {
      toast.error('Only completed sales can be voided.')
      loading.value = false
      return { success: false }
    }
    if (sale.remittance_id) {
      toast.error('Sale already remitted; cannot void.')
      loading.value = false
      return { success: false }
    }

    const nowIso = new Date().toISOString()
    const { error: statusError } = await supabase
      .from('transactions')
      .update({ status: 'voided', updated_at: nowIso })
      .eq('id', saleId)
    if (statusError) {
      handleError(statusError, 'Failed to void sale.')
      toast.error(statusError.message || 'Failed to void sale.')
      loading.value = false
      return { success: false }
    }

    const { error: detailsError } = await supabase
      .from('pos_sale_details')
      .update({ voided_at: nowIso, voided_by: user.id, void_reason: reason || null })
      .eq('transaction_id', saleId)
    if (detailsError) console.warn('voidSale: pos_sale_details update failed:', detailsError.message)

    const lines = ((sale.transaction_items ?? []) as unknown as { product_id: number; qty_stock_out: number | null }[])
      .map(li => ({ product_id: li.product_id, qty: li.qty_stock_out ?? 0 }))
    for (const line of lines) {
      const { data: stockRow } = await supabase
        .from('outlet_stock')
        .select('quantity')
        .eq('outlet_id', sale.outlet_id)
        .eq('product_id', line.product_id)
        .maybeSingle()
      const { error: stockError } = await supabase
        .from('outlet_stock')
        .update({ quantity: (stockRow?.quantity ?? 0) + line.qty, updated_at: nowIso })
        .eq('outlet_id', sale.outlet_id)
        .eq('product_id', line.product_id)
      if (stockError) {
        toast.warning(`Sale voided, but stock for product ${line.product_id} needs manual correction.`)
      }
    }

    const { error: logError } = await supabase.from('logs').insert({
      action: 'voided', description: `POS sale voided: ${reason || '(no reason)'}`,
      module: 'pos', created_by: user.id, transaction_id: saleId,
    })
    if (logError) console.warn('voidSale: activity log insert failed:', logError.message)

    toast.success('Sale voided and stock restored.')
    await fetchSales()
    loading.value = false
    return { success: true }
  }

  const resetStore = () => {
    sales.value = []
    currentSale.value = undefined
    loading.value = false
    error.value = ''
  }

  return {
    sales,
    currentSale,
    loading,
    error,
    isLoading,
    hasError,
    isRealtimeSubscribed,
    fetchSales,
    createSale,
    voidSale,
    clearError,
    resetStore,
    startRealtime,
    stopRealtime,
  }
})
