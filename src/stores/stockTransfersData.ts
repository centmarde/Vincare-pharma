import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useProductsDataStore } from '@/stores/productsData'
import { useOutletStockDataStore } from '@/stores/outletStockData'
import type { OutletType } from '@/stores/outletsData'
import type { ProductType } from '@/stores/productsData'

const toast = useToast()

// ─── Types ──────────────────────────────────────────────────────────────────

export type StockTransferItemType = {
  id: number
  created_at: string
  stock_transfer_id: number | null
  product_id: number | null
  requested_qty: number
  received_qty: number | null
  // Joined FK data
  product?: ProductType | null
}

export type StockTransferType = {
  id: number
  created_at: string
  transfer_no: string | null
  outlet_id: number | null
  status: string | null
  remarks: string | null
  requested_by: string | null
  approved_by: string | null
  received_by: string | null
  approved_at: string | null
  received_at: string | null
  updated_at: string | null
  // Joined FK data
  outlet?: OutletType | null
  stock_transfer_items?: StockTransferItemType[]
}

export type StockTransferLineInput = {
  product_id: number
  requested_qty: number
}

type FetchTransfersOptions = {
  outlet_id?: number
  status?: string
  orderBy?: keyof Pick<StockTransferType, 'created_at' | 'status'>
  ascending?: boolean
}

const SELECT_WITH_ITEMS = `
  *,
  outlet:outlet_id(*),
  stock_transfer_items(*, product:product_id(*))
`

export const useStockTransfersDataStore = defineStore('stockTransfersData', () => {
  const authStore = useAuthUserStore()
  const productsStore = useProductsDataStore()
  const outletStockStore = useOutletStockDataStore()

  // ─── State ──────────────────────────────────────────────────────────────────

  const transfers: Ref<StockTransferType[]> = ref([])
  const currentTransfer: Ref<StockTransferType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // ─── Realtime ────────────────────────────────────────────────────────────────

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // ─── Computed ────────────────────────────────────────────────────────────────

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')
  const pendingTransfers = computed(() => transfers.value.filter(t => t.status === 'pending_approval'))

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }

  const clearError = () => {
    error.value = ''
  }

  // ─── Reference Number Generator ─────────────────────────────────────────────

  async function getLatestTransferNo(prefix: string): Promise<number> {
    const { data } = await supabase
      .from('stock_transfers')
      .select('transfer_no')
      .ilike('transfer_no', `${prefix}%`)
      .order('transfer_no', { ascending: false })
      .limit(1)

    const latest = (data as { transfer_no: string }[] | null)?.[0]?.transfer_no
    return latest ? parseInt(latest.split('-')[2], 10) : 0
  }

  async function generateTransferNumber(): Promise<string> {
    const year   = new Date().getFullYear()
    const prefix = `ST-${year}-`
    const last   = await getLatestTransferNo(prefix)
    return `${prefix}${String(last + 1).padStart(3, '0')}`
  }

  // ─── Realtime ────────────────────────────────────────────────────────────────

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value

    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel('stock-transfers-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_transfers' }, async () => {
        await fetchTransfers()
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

  const fetchTransfers = async (options: FetchTransfersOptions = {}) => {
    loading.value = true
    clearError()

    try {
      const { outlet_id, status, orderBy = 'created_at', ascending = false } = options

      let q = supabase.from('stock_transfers').select(SELECT_WITH_ITEMS)

      if (typeof outlet_id === 'number') q = q.eq('outlet_id', outlet_id)
      if (status) q = q.eq('status', status)

      q = q.order(orderBy as string, { ascending })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      transfers.value = (data || []) as unknown as StockTransferType[]
      return transfers.value

    } catch (err) {
      handleError(err, 'Failed to fetch stock transfers')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchTransferById = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('stock_transfers')
        .select(SELECT_WITH_ITEMS)
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      currentTransfer.value = data as unknown as StockTransferType
      return currentTransfer.value

    } catch (err) {
      handleError(err, `Failed to fetch stock transfer with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const createTransferRequest = async (
    outletId: number,
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

    const transferNo = await generateTransferNumber()

    const { data: transferData, error: transferError } = await supabase
      .from('stock_transfers')
      .insert({
        transfer_no:  transferNo,
        outlet_id:    outletId,
        status:       'pending_approval',
        remarks:      remarks ?? null,
        requested_by: user.id,
      })
      .select('id')
      .single()

    if (transferError || !transferData) {
      handleError(transferError, 'Failed to create stock transfer request.')
      toast.error('Failed to create stock transfer request.')
      loading.value = false
      return { success: false }
    }

    const { error: itemsError } = await supabase
      .from('stock_transfer_items')
      .insert(items.map(item => ({
        stock_transfer_id: transferData.id,
        product_id:        item.product_id,
        requested_qty:     item.requested_qty,
      })))

    if (itemsError) {
      handleError(itemsError, 'Failed to save stock transfer items.')
      toast.error('Failed to save stock transfer items.')
      loading.value = false
      return { success: false }
    }

    toast.success(`Stock transfer ${transferNo} requested successfully.`)
    await fetchTransfers()
    loading.value = false
    return { success: true }
  }

  const approveTransfer = async (transferId: number) => {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return false
    }

    const { data: items, error: itemsError } = await supabase
      .from('stock_transfer_items')
      .select('product_id, requested_qty')
      .eq('stock_transfer_id', transferId)

    if (itemsError || !items) {
      handleError(itemsError, 'Failed to load transfer items.')
      toast.error('Failed to load transfer items.')
      loading.value = false
      return false
    }

    const productIds = items.map(i => i.product_id).filter((id): id is number => id != null)

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, current_stock')
      .in('id', productIds)

    if (productsError || !products) {
      handleError(productsError, 'Failed to load product stock.')
      toast.error('Failed to load product stock.')
      loading.value = false
      return false
    }

    for (const item of items) {
      if (item.product_id == null) continue
      const product = products.find(p => p.id === item.product_id)
      const newStock = (product?.current_stock ?? 0) - item.requested_qty
      const result = await productsStore.updateProduct(item.product_id, { current_stock: newStock })
      if (!result) {
        toast.error('Failed to deduct warehouse stock. Approval aborted.')
        loading.value = false
        return false
      }
    }

    const { error: updateError } = await supabase
      .from('stock_transfers')
      .update({
        status: 'approved', approved_by: user.id,
        approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
      .eq('id', transferId)

    loading.value = false

    if (updateError) {
      handleError(updateError, 'Failed to approve stock transfer.')
      toast.error('Failed to approve stock transfer.')
      return false
    }

    toast.success('Stock transfer approved and deducted from warehouse stock.')
    await fetchTransfers()
    return true
  }

  const rejectTransfer = async (transferId: number) => {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return false
    }

    const { error: updateError } = await supabase
      .from('stock_transfers')
      .update({
        status: 'rejected', approved_by: user.id,
        approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
      .eq('id', transferId)

    loading.value = false

    if (updateError) {
      handleError(updateError, 'Failed to reject stock transfer.')
      toast.error('Failed to reject stock transfer.')
      return false
    }

    toast.success('Stock transfer rejected.')
    await fetchTransfers()
    return true
  }

  const receiveTransfer = async (
    transferId: number,
    outletId: number,
    receivedItems: { item_id: number; product_id: number; received_qty: number }[],
  ) => {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return false
    }

    for (const item of receivedItems) {
      const { error: itemUpdateError } = await supabase
        .from('stock_transfer_items')
        .update({ received_qty: item.received_qty })
        .eq('id', item.item_id)

      if (itemUpdateError) {
        handleError(itemUpdateError, 'Failed to save received quantity.')
        toast.error('Failed to save received quantity.')
        loading.value = false
        return false
      }

      const incremented = await outletStockStore.incrementOutletStock(
        outletId, item.product_id, item.received_qty,
      )
      if (!incremented) {
        toast.error('Failed to update outlet stock. Receiving aborted.')
        loading.value = false
        return false
      }
    }

    const { error: updateError } = await supabase
      .from('stock_transfers')
      .update({
        status: 'completed', received_by: user.id,
        received_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
      .eq('id', transferId)

    loading.value = false

    if (updateError) {
      handleError(updateError, 'Failed to complete stock transfer.')
      toast.error('Failed to complete stock transfer.')
      return false
    }

    toast.success('Stock transfer received and outlet stock updated.')
    await fetchTransfers()
    return true
  }

  const resetStore = () => {
    transfers.value = []
    currentTransfer.value = undefined
    loading.value = false
    error.value = ''
  }

  // ─── Expose ───────────────────────────────────────────────────────────────────

  return {
    // State
    transfers,
    currentTransfer,
    loading,
    error,

    // Computed
    isLoading,
    hasError,
    isRealtimeSubscribed,
    pendingTransfers,

    // Actions
    fetchTransfers,
    fetchTransferById,
    createTransferRequest,
    approveTransfer,
    rejectTransfer,
    receiveTransfer,
    generateTransferNumber,
    clearError,
    resetStore,

    // Realtime
    startRealtime,
    stopRealtime,
  }
})
