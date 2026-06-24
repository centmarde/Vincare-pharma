import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useOutletsDataStore } from '@/stores/outletsData'
import { useOutletStockDataStore } from '@/stores/outletStockData'
import type { ProductType } from '@/stores/productsData'

const toast = useToast()

// ─── Types ──────────────────────────────────────────────────────────────────

export type SaleItemType = {
  id: number
  created_at: string
  sale_id: number | null
  product_id: number | null
  quantity: number
  unit_price: number
  line_total: number
  // Joined FK data
  product?: ProductType | null
}

export type SaleType = {
  id: number
  created_at: string
  sale_no: string | null
  outlet_id: number | null
  status: string | null
  payment_method: string | null
  subtotal: number | null
  total_amount: number | null
  amount_tendered: number | null
  change_due: number | null
  cashier_id: string | null
  remittance_id: number | null
  updated_at: string | null
  // Joined FK data
  sale_items?: SaleItemType[]
}

// A cart line passed into createSale (price is snapshotted from the product).
export type SaleLineInput = {
  product_id: number
  quantity: number
  unit_price: number
}

type FetchSalesOptions = {
  outlet_id?: number
  unremittedOnly?: boolean
  orderBy?: keyof Pick<SaleType, 'created_at' | 'total_amount'>
  ascending?: boolean
}

const SELECT_WITH_ITEMS = '*, sale_items(*, product:product_id(*))'

export const useSalesDataStore = defineStore('salesData', () => {
  const authStore = useAuthUserStore()
  const outletsStore = useOutletsDataStore()
  const outletStockStore = useOutletStockDataStore()

  // ─── State ──────────────────────────────────────────────────────────────────

  const sales: Ref<SaleType[]> = ref([])
  const currentSale: Ref<SaleType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // ─── Realtime ────────────────────────────────────────────────────────────────

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // ─── Computed ────────────────────────────────────────────────────────────────

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }

  const clearError = () => {
    error.value = ''
  }

  // ─── Reference Number Generator ─────────────────────────────────────────────

  async function getLatestSaleNo(prefix: string): Promise<number> {
    const { data } = await supabase
      .from('sales')
      .select('sale_no')
      .ilike('sale_no', `${prefix}%`)
      .order('sale_no', { ascending: false })
      .limit(1)

    const latest = (data as { sale_no: string }[] | null)?.[0]?.sale_no
    return latest ? parseInt(latest.split('-')[2], 10) : 0
  }

  async function generateSaleNumber(): Promise<string> {
    const year   = new Date().getFullYear()
    const prefix = `SO-${year}-`
    const last   = await getLatestSaleNo(prefix)
    return `${prefix}${String(last + 1).padStart(3, '0')}`
  }

  // ─── Realtime ────────────────────────────────────────────────────────────────

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value

    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel('sales-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, async () => {
        await fetchSales()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') realtimeStatus.value = 'subscribed'
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          realtimeStatus.value = 'error'
        }
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

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const fetchSales = async (options: FetchSalesOptions = {}) => {
    loading.value = true
    clearError()

    try {
      const { outlet_id, unremittedOnly, orderBy = 'created_at', ascending = false } = options

      let q = supabase.from('sales').select(SELECT_WITH_ITEMS)

      if (typeof outlet_id === 'number') q = q.eq('outlet_id', outlet_id)
      if (unremittedOnly) q = q.is('remittance_id', null).eq('status', 'completed')

      q = q.order(orderBy as string, { ascending })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      sales.value = (data || []) as unknown as SaleType[]
      return sales.value

    } catch (err) {
      handleError(err, 'Failed to fetch sales')
      return []
    } finally {
      loading.value = false
    }
  }

  // Resolve the Exelmed outlet by code so we never hardcode a magic id.
  async function resolveExelmedOutletId(): Promise<number | undefined> {
    if (!outletsStore.outlets.length) await outletsStore.fetchOutlets()
    return outletsStore.outlets.find(o => o.code === 'EXELMED')?.id
  }

  const createSale = async (payload: { lines: SaleLineInput[]; amountTendered: number }) => {
    loading.value = true
    clearError()

    const { lines, amountTendered } = payload

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

    const outletId = await resolveExelmedOutletId()
    if (outletId == null) {
      handleError(new Error('Exelmed outlet not found'), 'Exelmed outlet not found.')
      toast.error('Exelmed outlet not found.')
      loading.value = false
      return { success: false }
    }

    // Validate stock availability before writing anything.
    await outletStockStore.fetchOutletStock({ outletId })
    for (const line of lines) {
      const onHand = outletStockStore.outletStock.find(s => s.product_id === line.product_id)?.quantity ?? 0
      if (line.quantity > onHand) {
        toast.error('Not enough stock for one or more items.')
        loading.value = false
        return { success: false }
      }
    }

    const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)
    const total = subtotal
    if (amountTendered < total) {
      toast.warning('Amount tendered is less than the total.')
      loading.value = false
      return { success: false }
    }

    const saleNo = await generateSaleNumber()

    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert({
        sale_no:         saleNo,
        outlet_id:       outletId,
        status:          'completed',
        payment_method:  'cash',
        subtotal,
        total_amount:    total,
        amount_tendered: amountTendered,
        change_due:      amountTendered - total,
        cashier_id:      user.id,
      })
      .select('*')
      .single()

    if (saleError || !saleData) {
      handleError(saleError, 'Failed to record sale.')
      toast.error('Failed to record sale.')
      loading.value = false
      return { success: false }
    }

    const { error: itemsError } = await supabase
      .from('sale_items')
      .insert(lines.map(l => ({
        sale_id:    saleData.id,
        product_id: l.product_id,
        quantity:   l.quantity,
        unit_price: l.unit_price,
        line_total: l.quantity * l.unit_price,
      })))

    if (itemsError) {
      handleError(itemsError, 'Failed to save sale items.')
      toast.error('Failed to save sale items.')
      loading.value = false
      return { success: false }
    }

    // Decrement outlet stock per line (point of sale → stock leaves the outlet).
    for (const line of lines) {
      const ok = await outletStockStore.decrementOutletStock(outletId, line.product_id, line.quantity)
      if (!ok) {
        toast.error('Failed to deduct outlet stock.')
        loading.value = false
        return { success: false }
      }
    }

    toast.success(`Sale ${saleNo} completed.`)
    currentSale.value = saleData as SaleType
    loading.value = false
    return { success: true, sale: saleData as SaleType, saleNo, total, change: amountTendered - total }
  }

  const resetStore = () => {
    sales.value = []
    currentSale.value = undefined
    loading.value = false
    error.value = ''
  }

  // ─── Expose ───────────────────────────────────────────────────────────────────

  return {
    // State
    sales,
    currentSale,
    loading,
    error,

    // Computed
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Actions
    fetchSales,
    createSale,
    generateSaleNumber,
    resolveExelmedOutletId,
    clearError,
    resetStore,

    // Realtime
    startRealtime,
    stopRealtime,
  }
})
