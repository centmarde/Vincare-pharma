import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import type { ProductType } from '@/stores/productsData'

const toast = useToast()

// Sales now live in the `transactions` hub as transaction_type = 'sale',
// with their lines in `transaction_items`. These types are the view-model the
// sales UI consumes; fetch maps the hub columns onto them so the composables
// and components are unaffected by the consolidation.

export const EXELMED_OUTLET = 'EXELMED'

// Outlets are constants now (the `outlets` table was folded away). Codes are
// stored on transactions.outlet / outlet_stock.outlet; names live here.
export const OUTLETS = [
  { code: 'EXELMED', name: 'Exelmed Pharma Trade' },
  { code: 'ETHICAL', name: 'Ethical Department' },
] as const

export function outletName(code: string | null | undefined): string {
  return OUTLETS.find((o) => o.code === code)?.name ?? '—'
}

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
  outlet: string | null
  status: string | null
  payment_method: string | null
  subtotal: number | null
  total_amount: number | null
  amount_tendered: number | null
  change_due: number | null
  cashier_id: string | null
  remittance_id: number | null
  customer_name: string | null
  customer_address: string | null
  customer_mobile: string | null
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
  outlet?: string
  unremittedOnly?: boolean
  dateFrom?: string
  dateTo?: string
  orderBy?: 'created_at' | 'total_amount'
  ascending?: boolean
}

// transactions + embedded items; mapped to SaleType in mapRowToSale().
const SELECT_SALE = '*, transaction_items(id, product_id, qty, unit_price, line_total, product:product_id(*))'

function mapRowToSale(row: any): SaleType {
  return {
    id:               row.id,
    created_at:       row.created_at,
    sale_no:          row.reference_no,
    outlet:           row.outlet,
    status:           row.status,
    payment_method:   row.payment_method,
    subtotal:         row.subtotal,
    total_amount:     row.total_amount,
    amount_tendered:  row.amount_tendered,
    change_due:       row.change_due,
    cashier_id:       row.created_by,
    remittance_id:    row.remittance_id,
    customer_name:    row.customer_name,
    customer_address: row.customer_address,
    customer_mobile:  row.customer_mobile,
    voided_at:        row.voided_at,
    void_reason:      row.void_reason,
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

  // The POS outlet code. (No async lookup — outlets are constants now.)
  function resolveExelmedOutlet(): string {
    return EXELMED_OUTLET
  }

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
      const { outlet, unremittedOnly, dateFrom, dateTo, orderBy = 'created_at', ascending = false } = options

      let q = supabase.from('transactions').select(SELECT_SALE).eq('transaction_type', 'sale')

      if (outlet) q = q.eq('outlet', outlet)
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
    lines: SaleLineInput[]
    amountTendered: number
    customer?: { name?: string | null; address?: string | null; mobile?: string | null }
  }) => {
    loading.value = true
    clearError()

    const { lines, amountTendered, customer } = payload

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
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
      p_outlet:           EXELMED_OUTLET,
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

    // Read back the created sale for the receipt.
    const { data: row } = await supabase
      .from('transactions')
      .select('reference_no, subtotal, total_amount, change_due')
      .eq('id', saleId)
      .single()

    toast.success(`Sale ${row?.reference_no ?? ''} completed.`)
    loading.value = false
    return {
      success: true,
      saleNo:   row?.reference_no as string,
      subtotal: (row?.subtotal ?? 0) as number,
      total:    (row?.total_amount ?? 0) as number,
      change:   (row?.change_due ?? 0) as number,
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
    resolveExelmedOutlet,
    clearError,
    resetStore,
    startRealtime,
    stopRealtime,
  }
})
