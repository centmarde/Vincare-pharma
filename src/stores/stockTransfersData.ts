import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import type { ProductType } from '@/stores/productsData'
import type { OutletType } from '@/stores/outletsData'

const toast = useToast()

// Stock transfers live in `transactions` as transaction_type = 'stock_transfer',
// lines in `transaction_items` (qty = requested_qty, received_qty = received).
// These view-model types are mapped from the hub so the transfer UI is unchanged.

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
  outlet_id: number | null
  outlet?: OutletType | null
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
  outletId?: number
  status?: string
  orderBy?: 'created_at' | 'status'
  ascending?: boolean
}

const SELECT_TRANSFER = '*, transaction_items(id, product_id, qty, received_qty, product:product_id(*)), outlet:outlet_id(*)'

function mapRowToTransfer(row: any): StockTransferType {
  return {
    id:           row.id,
    created_at:   row.created_at,
    transfer_no:  row.reference_no,
    outlet_id:    row.outlet_id,
    outlet:       row.outlet,
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
      requested_qty: li.qty,
      received_qty:  li.received_qty,
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
      const { outletId, status, orderBy = 'created_at', ascending = false } = options
      let q = supabase.from('transactions').select(SELECT_TRANSFER).eq('transaction_type', 'stock_transfer')
      if (outletId) q = q.eq('outlet_id', outletId)
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

    // Atomic: header + items + reference_no in one DB transaction (no orphan
    // headers, no client-side number race).
    const { data, error: rpcError } = await supabase.rpc('stock_transfer_create', {
      p_outlet_id: outletId,
      p_lines:     items.map(item => ({ product_id: item.product_id, requested_qty: item.requested_qty })),
      p_remarks:   remarks ?? null,
      p_user:      user.id,
    })

    if (rpcError || !data) {
      handleError(rpcError, 'Failed to create stock transfer request.')
      toast.error(rpcError?.message || 'Failed to create stock transfer request.')
      loading.value = false
      return { success: false }
    }

    const result = data as { transfer_id: number; transfer_no: string }
    toast.success(`Stock transfer ${result.transfer_no} requested successfully.`)
    await fetchTransfers()
    loading.value = false
    return { success: true }
  }

  const approveTransfer = async (transferId: number) => {
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return false }

    loading.value = true
    const { error: rpcError } = await supabase.rpc('transfer_approve', { p_id: transferId, p_user: user.id })
    loading.value = false

    if (rpcError) {
      handleError(rpcError, 'Failed to approve stock transfer.')
      toast.error(rpcError.message || 'Failed to approve stock transfer.')
      return false
    }
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

  const receiveTransfer = async (
    transferId: number,
    receivedItems: { item_id: number; received_qty: number }[],
  ) => {
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return false }

    loading.value = true
    const { error: rpcError } = await supabase.rpc('transfer_receive', {
      p_id:       transferId,
      p_received: receivedItems,
      p_user:     user.id,
    })
    loading.value = false

    if (rpcError) {
      handleError(rpcError, 'Failed to complete stock transfer.')
      toast.error(rpcError.message || 'Failed to complete stock transfer.')
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
