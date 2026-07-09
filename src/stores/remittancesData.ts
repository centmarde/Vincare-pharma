import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useSalesDataStore } from '@/stores/salesData'
import { generateNextNumber } from '@/utils/helpers'
import type { OutletType } from '@/stores/outletsData'

const toast = useToast()

// Remittances live in `transactions` as transaction_type = 'remittance'
// (no line items). total_amount = expected; actual_amount lives in
// remittance_details. discrepancy is derived (actual_amount - total_amount),
// not a stored column.

export type RemittanceType = {
  id: number
  created_at: string
  remittance_no: string | null
  outlet_id: number | null
  outlet?: OutletType | null
  remittance_date: string | null
  expected_amount: number | null
  actual_amount: number | null
  discrepancy: number | null
  status: string | null
  notes: string | null
}

export type ExpectedSummary = {
  expected: number
  saleCount: number
}

type FetchRemittancesOptions = {
  outletId?: number
  orderBy?: 'created_at'
  ascending?: boolean
}

const SELECT_REMITTANCE = '*, outlet:outlet_id(*), remittance_details(actual_amount)'

function mapRowToRemittance(row: any): RemittanceType {
  const actualAmount = row.remittance_details?.actual_amount ?? null
  return {
    id:              row.id,
    created_at:      row.created_at,
    remittance_no:   row.remittance_no,
    outlet_id:       row.outlet_id,
    outlet:          row.outlet,
    remittance_date: row.created_at,
    expected_amount: row.total_amount,
    actual_amount:   actualAmount,
    discrepancy:     actualAmount === null ? null : actualAmount - (row.total_amount ?? 0),
    status:          row.status,
    notes:           row.remarks,
  }
}

export const useRemittancesDataStore = defineStore('remittancesData', () => {
  const authStore = useAuthUserStore()
  const salesStore = useSalesDataStore()

  const remittances: Ref<RemittanceType[]> = ref([])
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
      .channel('remittances-channel')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: 'transaction_type=eq.remittance' },
        async () => { await fetchRemittances() })
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

  const fetchRemittances = async (options: FetchRemittancesOptions = {}) => {
    loading.value = true
    clearError()
    try {
      const { outletId, orderBy = 'created_at', ascending = false } = options
      let q = supabase.from('transactions').select(SELECT_REMITTANCE).eq('transaction_type', 'remittance')
      if (outletId) q = q.eq('outlet_id', outletId)
      q = q.order(orderBy, { ascending })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      remittances.value = (data || []).map(mapRowToRemittance)
      return remittances.value
    } catch (err) {
      handleError(err, 'Failed to fetch remittances')
      return []
    } finally {
      loading.value = false
    }
  }

  // Expected = sum of completed cash sales for the branch not yet remitted.
  const computeExpected = async (outletId: number): Promise<ExpectedSummary> => {
    clearError()
    const { data, error: fetchError } = await supabase
      .from('transactions')
      .select('total_amount')
      .eq('transaction_type', 'sale')
      .eq('status', 'completed')
      .is('remittance_id', null)
      .eq('outlet_id', outletId)

    if (fetchError) {
      handleError(fetchError, 'Failed to compute expected amount')
      return { expected: 0, saleCount: 0 }
    }
    const rows = (data || []) as { total_amount: number | null }[]
    return {
      expected:  rows.reduce((sum, r) => sum + (r.total_amount ?? 0), 0),
      saleCount: rows.length,
    }
  }

  // Snapshot expected cash, create the remittance row + remittance_details, and
  // tag the swept sales (was remittance_submit). Not atomic — but the header
  // (+ remittance_details) is rolled back (deleted) on any downstream failure
  // rather than left behind: a lingering 'submitted' remittance with no tagged
  // sales would both mis-state that cash as already reconciled AND let the
  // same unremitted sales get swept into a second remittance on retry,
  // double-counting them.
  const rollbackRemittance = async (id: number) => {
    await supabase.from('remittance_details').delete().eq('transaction_id', id)
    const { error } = await supabase.from('transactions').delete().eq('id', id).eq('transaction_type', 'remittance')
    if (error) console.warn('submitRemittance: rollback of partial remittance failed — status=\'submitted\' row left behind, id:', id, error.message)
  }

  const submitRemittance = async (payload: { outletId: number; actualAmount: number; notes?: string }) => {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const { data: unremitted, error: sumError } = await supabase
      .from('transactions')
      .select('total_amount')
      .eq('transaction_type', 'sale')
      .eq('status', 'completed')
      .is('remittance_id', null)
      .eq('outlet_id', payload.outletId)

    if (sumError) {
      handleError(sumError, 'Failed to compute expected amount.')
      toast.error(sumError.message || 'Failed to compute expected amount.')
      loading.value = false
      return { success: false }
    }
    const rows = (unremitted || []) as { total_amount: number | null }[]
    if (rows.length === 0) {
      toast.error('No unremitted cash sales to remit.')
      loading.value = false
      return { success: false }
    }
    const expected = rows.reduce((sum, r) => sum + (r.total_amount ?? 0), 0)

    const year = new Date().getFullYear().toString()
    const remittanceNo = await generateNextNumber('remittance_no', `RM-${year}-`, ['reference_no'])

    const { data: created, error: insertError } = await supabase
      .from('transactions')
      .insert({
        remittance_no: remittanceNo,
        transaction_type: 'remittance',
        status: 'submitted',
        outlet_id: payload.outletId,
        total_amount: expected,
        remarks: payload.notes || null,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (insertError || !created) {
      handleError(insertError, 'Failed to submit remittance.')
      toast.error(insertError?.message || 'Failed to submit remittance.')
      loading.value = false
      return { success: false }
    }

    const { error: detailsError } = await supabase
      .from('remittance_details')
      .insert({ transaction_id: created.id, actual_amount: payload.actualAmount })
    if (detailsError) {
      handleError(detailsError, 'Failed to save remittance details.')
      toast.error(detailsError.message || 'Failed to save remittance details.')
      await rollbackRemittance(created.id)
      loading.value = false
      return { success: false }
    }

    const { error: tagError } = await supabase
      .from('transactions')
      .update({ remittance_id: created.id })
      .eq('transaction_type', 'sale')
      .eq('status', 'completed')
      .is('remittance_id', null)
      .eq('outlet_id', payload.outletId)
    if (tagError) {
      handleError(tagError, 'Failed to tag remitted sales.')
      toast.error(tagError.message || 'Failed to tag remitted sales.')
      await rollbackRemittance(created.id)
      loading.value = false
      return { success: false }
    }

    const { error: logError } = await supabase.from('logs').insert({
      action: 'remitted', description: `Remittance ${remittanceNo} submitted (${rows.length} sales)`,
      module: 'pos', created_by: user.id, transaction_id: created.id,
    })
    if (logError) console.warn('submitRemittance: activity log insert failed:', logError.message)

    toast.success('Remittance submitted.')
    await Promise.all([fetchRemittances(), salesStore.fetchSales()])
    loading.value = false
    return { success: true }
  }

  const resetStore = () => {
    remittances.value = []
    loading.value = false
    error.value = ''
  }

  return {
    remittances,
    loading,
    error,
    isLoading,
    hasError,
    isRealtimeSubscribed,
    fetchRemittances,
    computeExpected,
    submitRemittance,
    clearError,
    resetStore,
    startRealtime,
    stopRealtime,
  }
})
