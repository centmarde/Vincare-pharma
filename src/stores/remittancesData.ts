import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useSalesDataStore } from '@/stores/salesData'
import type { OutletType } from '@/stores/outletsData'

const toast = useToast()

// ─── Types ──────────────────────────────────────────────────────────────────

export type RemittanceType = {
  id: number
  created_at: string
  remittance_no: string | null
  outlet_id: number | null
  remittance_date: string | null
  expected_amount: number | null
  actual_amount: number | null
  discrepancy: number | null
  status: string | null
  remitted_by: string | null
  notes: string | null
  // Joined FK data
  outlet?: OutletType | null
}

// Result of computing what the outlet *should* be remitting right now.
export type ExpectedSummary = {
  expected: number
  saleCount: number
  saleIds: number[]
}

type FetchRemittancesOptions = {
  outlet_id?: number
  orderBy?: keyof Pick<RemittanceType, 'created_at' | 'remittance_date'>
  ascending?: boolean
}

export const useRemittancesDataStore = defineStore('remittancesData', () => {
  const authStore = useAuthUserStore()
  const salesStore = useSalesDataStore()

  // ─── State ──────────────────────────────────────────────────────────────────

  const remittances: Ref<RemittanceType[]> = ref([])
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

  async function getLatestRemittanceNo(prefix: string): Promise<number> {
    const { data } = await supabase
      .from('remittances')
      .select('remittance_no')
      .ilike('remittance_no', `${prefix}%`)
      .order('remittance_no', { ascending: false })
      .limit(1)

    const latest = (data as { remittance_no: string }[] | null)?.[0]?.remittance_no
    return latest ? parseInt(latest.split('-')[2], 10) : 0
  }

  async function generateRemittanceNumber(): Promise<string> {
    const year   = new Date().getFullYear()
    const prefix = `RM-${year}-`
    const last   = await getLatestRemittanceNo(prefix)
    return `${prefix}${String(last + 1).padStart(3, '0')}`
  }

  // ─── Realtime ────────────────────────────────────────────────────────────────

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value

    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel('remittances-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'remittances' }, async () => {
        await fetchRemittances()
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

  const fetchRemittances = async (options: FetchRemittancesOptions = {}) => {
    loading.value = true
    clearError()

    try {
      const { outlet_id, orderBy = 'created_at', ascending = false } = options

      let q = supabase.from('remittances').select('*, outlet:outlet_id(*)')

      if (typeof outlet_id === 'number') q = q.eq('outlet_id', outlet_id)

      q = q.order(orderBy as string, { ascending })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError

      remittances.value = (data || []) as unknown as RemittanceType[]
      return remittances.value

    } catch (err) {
      handleError(err, 'Failed to fetch remittances')
      return []
    } finally {
      loading.value = false
    }
  }

  // Expected = sum of completed cash sales for the outlet not yet tied to a remittance.
  const computeExpected = async (outletId: number): Promise<ExpectedSummary> => {
    clearError()

    const { data, error: fetchError } = await supabase
      .from('sales')
      .select('id, total_amount')
      .eq('outlet_id', outletId)
      .eq('status', 'completed')
      .is('remittance_id', null)

    if (fetchError) {
      handleError(fetchError, 'Failed to compute expected amount')
      return { expected: 0, saleCount: 0, saleIds: [] }
    }

    const rows = (data || []) as { id: number; total_amount: number | null }[]
    return {
      expected:  rows.reduce((sum, r) => sum + (r.total_amount ?? 0), 0),
      saleCount: rows.length,
      saleIds:   rows.map(r => r.id),
    }
  }

  const submitRemittance = async (payload: {
    outletId: number
    actualAmount: number
    notes?: string
  }) => {
    loading.value = true
    clearError()

    const { outletId, actualAmount, notes } = payload

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const { expected, saleCount, saleIds } = await computeExpected(outletId)
    if (saleCount === 0) {
      toast.warning('No unremitted cash sales to remit.')
      loading.value = false
      return { success: false }
    }

    const remittanceNo = await generateRemittanceNumber()

    const { data: remitData, error: remitError } = await supabase
      .from('remittances')
      .insert({
        remittance_no:   remittanceNo,
        outlet_id:       outletId,
        expected_amount: expected,
        actual_amount:   actualAmount,
        discrepancy:     actualAmount - expected,
        status:          'submitted',
        remitted_by:     user.id,
        notes:           notes ?? null,
      })
      .select('id')
      .single()

    if (remitError || !remitData) {
      handleError(remitError, 'Failed to submit remittance.')
      toast.error('Failed to submit remittance.')
      loading.value = false
      return { success: false }
    }

    // Tag the counted sales so they are excluded from the next remittance batch.
    const { error: tagError } = await supabase
      .from('sales')
      .update({ remittance_id: remitData.id })
      .in('id', saleIds)

    if (tagError) {
      handleError(tagError, 'Remittance saved but failed to tag sales.')
      toast.error('Remittance saved but failed to link sales.')
      loading.value = false
      return { success: false }
    }

    toast.success(`Remittance ${remittanceNo} submitted.`)
    await Promise.all([fetchRemittances(), salesStore.fetchSales()])
    loading.value = false
    return { success: true }
  }

  const resetStore = () => {
    remittances.value = []
    loading.value = false
    error.value = ''
  }

  // ─── Expose ───────────────────────────────────────────────────────────────────

  return {
    // State
    remittances,
    loading,
    error,

    // Computed
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Actions
    fetchRemittances,
    computeExpected,
    submitRemittance,
    generateRemittanceNumber,
    clearError,
    resetStore,

    // Realtime
    startRealtime,
    stopRealtime,
  }
})
