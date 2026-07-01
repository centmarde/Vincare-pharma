import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
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
const SELECT_SALE = '*, transaction_items(id, product_id, qty, unit_price, line_total, product:product_id(*)), customer:customer_id(*), outlet:outlet_id(*), pos_sale_details(*)'

function mapRowToSale(row: any): SaleType {
  const details = row.pos_sale_details ?? {}
  return {
    id:               row.id,
    created_at:       row.created_at,
    sale_no:          row.reference_no,
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
      quantity:   li.qty,
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

    // Atomic: header + items + stock decrement happen inside the DB function.
    const { data: saleId, error: rpcError } = await supabase.rpc('pos_create_sale', {
      p_outlet_id:        outletId,
      p_lines:            lines,
      p_tendered:         amountTendered,
      p_customer_name:    customer?.name ?? null,
      p_customer_address: customer?.address ?? null,
      p_customer_mobile:  customer?.mobile ?? null,
      p_cashier:          user.id,
    })

    if (rpcError) {
      handleError(rpcError, 'Failed to record sale.')
      toast.error(rpcError.message || 'Failed to record sale.')
      loading.value = false
      return { success: false }
    }

    // Read back the created sale for the receipt. subtotal/change_due are in
    // pos_sale_details (hub redesign), not on the core transactions row.
    const { data: row } = await supabase
      .from('transactions')
      .select('reference_no, total_amount, pos_sale_details(subtotal, change_due)')
      .eq('id', saleId)
      .single()

    const psd = (row as any)?.pos_sale_details ?? {}
    toast.success(`Sale ${row?.reference_no ?? ''} completed.`)
    loading.value = false
    return {
      success: true,
      saleNo:   row?.reference_no as string,
      subtotal: (psd.subtotal ?? 0) as number,
      total:    (row?.total_amount ?? 0) as number,
      change:   (psd.change_due ?? 0) as number,
      cashierName,
    }
  }

  const voidSale = async (saleId: number, reason: string) => {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const { error: rpcError } = await supabase.rpc('pos_void_sale', {
      p_sale_id: saleId,
      p_reason:  reason,
      p_user:    user.id,
    })

    if (rpcError) {
      handleError(rpcError, 'Failed to void sale.')
      toast.error(rpcError.message || 'Failed to void sale.')
      loading.value = false
      return { success: false }
    }

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
