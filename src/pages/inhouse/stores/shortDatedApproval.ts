import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useLogsDataStore } from '@/stores/logsData'
import { getErrorMessage } from '@/utils/helpers'
import { QUALIFICATION_MONTHS } from '@/utils/qualification'

// Executive approval to deliver SHORT-DATED stock on a government order.
//
// Government contracts reject stock with less than QUALIFICATION_MONTHS of
// shelf life left, which is why deliver() blocks it. The business can still
// choose to ship it — but that is an executive's call, not the delivering
// clerk's, so it has to be asked for and recorded.
//
// Built on `change_requests` rather than a new table: it already carries a
// transaction_id, a request/approve/reject lifecycle, and an executive surface
// in ActionRequired. request_type has no CHECK constraint (verified by probe),
// so adding a value needed no schema change.
//
// SCOPE, deliberately narrow:
//   * IN-HOUSE ONLY — 18 months is a government contract term, not a property
//     of the goods. Ethical and POS keep the expired-only bar.
//   * PER ORDER, not per line — "this order may ship short-dated stock" is the
//     decision a person actually makes; approving batch-by-batch would ask an
//     executive to adjudicate something they have no way to judge separately.
//   * GATED AT DELIVERY, not at order entry — that is where govtShelfLife
//     already enforces, and a batch that qualified at agreement time may not
//     weeks later, so the check belongs at the point of shipping.

export const shortDatedRequestType = 'short_dated_sale'

export type ShortDatedBatch = {
  product_id: number
  product_name: string
  batch_no: string | null
  expiry_date: string | null
}

export type ShortDatedRequest = {
  id: number
  created_at: string
  transaction_id: number
  summary: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  batches: ShortDatedBatch[]
  created_by: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  /** The order's own document number, for the approver's list. */
  order_no: string | null
  customer_name: string | null
}

function mapRow(row: any): ShortDatedRequest {
  const proposed = (row.proposed_changes ?? {}) as { batches?: ShortDatedBatch[] }
  return {
    id: row.id,
    created_at: row.created_at,
    transaction_id: row.transaction_id,
    summary: row.summary ?? null,
    reason: row.reason ?? null,
    status: row.status,
    batches: proposed.batches ?? [],
    created_by: row.created_by ?? null,
    resolved_by: row.resolved_by ?? null,
    resolved_at: row.resolved_at ?? null,
    resolution_note: row.resolution_note ?? null,
    order_no: row.transactions?.inhouse_no ?? row.transactions?.reference_no ?? null,
    customer_name: row.transactions?.customer?.name ?? null,
  }
}

const requestSelect = `
  id, created_at, transaction_id, request_type, proposed_changes,
  summary, reason, status, created_by, resolved_by, resolved_at, resolution_note,
  transactions!inner ( inhouse_no, reference_no, transaction_type, customer:customer_id ( name ) )
`

export const useShortDatedApprovalStore = defineStore('shortDatedApproval', () => {
  const toast = useToast()
  const authStore = useAuthUserStore()
  const logsStore = useLogsDataStore()

  const requests: Ref<ShortDatedRequest[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const pendingRequests = computed(() => requests.value.filter((r) => r.status === 'pending'))
  const pendingCount = computed(() => pendingRequests.value.length)

  function handleError(err: unknown, fallback: string) {
    console.error(err)
    error.value = getErrorMessage(err) || fallback
  }

  function clearError() {
    error.value = ''
  }

  async function fetchRequests(options: { status?: ShortDatedRequest['status'] } = {}) {
    loading.value = true
    clearError()
    try {
      let query = supabase
        .from('change_requests')
        .select(requestSelect)
        .eq('request_type', shortDatedRequestType)
        // Scoped the same way the PR store scopes itself: this table is shared
        // by every module, and an unscoped read would sweep in all of them.
        .eq('transactions.transaction_type', 'inhouse_order')
        .order('created_at', { ascending: false })

      if (options.status) query = query.eq('status', options.status)

      const { data, error: fetchError } = await query
      if (fetchError) throw fetchError
      requests.value = (data ?? []).map(mapRow)
      return requests.value
    } catch (err) {
      handleError(err, 'Failed to load short-dated approval requests')
      return []
    } finally {
      loading.value = false
    }
  }

  /**
   * Whether this order may ship short-dated stock.
   *
   * Read at the moment of delivery rather than cached: an approval can be
   * granted while the order sits waiting, and a stale `false` would block a
   * delivery the executive has already signed off.
   */
  async function hasApproval(orderId: number): Promise<boolean> {
    const { data, error: lookupError } = await supabase
      .from('change_requests')
      .select('id')
      .eq('transaction_id', orderId)
      .eq('request_type', shortDatedRequestType)
      .eq('status', 'approved')
      .limit(1)
    if (lookupError) {
      // Fails CLOSED: an unreadable approval is not an approval. Shipping
      // short-dated stock on a failed lookup is the one outcome that cannot be
      // undone once the goods are with the client.
      handleError(lookupError, 'Failed to check short-dated approval')
      return false
    }
    return !!data?.length
  }

  /** The current request for an order, if any — drives the button's state. */
  async function requestFor(orderId: number): Promise<ShortDatedRequest | null> {
    const { data, error: lookupError } = await supabase
      .from('change_requests')
      .select(requestSelect)
      .eq('transaction_id', orderId)
      .eq('request_type', shortDatedRequestType)
      .order('created_at', { ascending: false })
      .limit(1)
    if (lookupError) {
      handleError(lookupError, 'Failed to load the approval request')
      return null
    }
    const row = (data ?? [])[0]
    return row ? mapRow(row) : null
  }

  async function requestApproval(payload: {
    orderId: number
    orderNo: string | null
    batches: ShortDatedBatch[]
    reason?: string | null
  }): Promise<{ success: boolean }> {
    loading.value = true
    clearError()

    const { orderId, orderNo, batches, reason = null } = payload

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    try {
      // One open request per order. A second would give the executive two
      // identical decisions to make and leave whichever they ignore pending
      // for ever.
      const { data: existing, error: existingError } = await supabase
        .from('change_requests')
        .select('id')
        .eq('transaction_id', orderId)
        .eq('request_type', shortDatedRequestType)
        .eq('status', 'pending')
        .limit(1)
      if (existingError) throw existingError
      if (existing?.length) {
        toast.info('An approval request for this order is already awaiting a decision.')
        loading.value = false
        return { success: false }
      }

      const summary = `Deliver ${batches.length} short-dated line(s) on ${orderNo ?? `order #${orderId}`}`
        + ` — under ${QUALIFICATION_MONTHS} months of shelf life`

      const { error: insertError } = await supabase.from('change_requests').insert({
        transaction_id: orderId,
        request_type: shortDatedRequestType,
        status: 'pending',
        summary,
        reason,
        // The batches are recorded so the executive sees WHAT they are
        // approving — which products, which expiry — rather than a bare count.
        proposed_changes: { batches },
        created_by: user.id,
      })
      if (insertError) throw insertError

      try {
        await logsStore.createLog({
          action: 'short_dated_approval_requested',
          description: summary,
          module: 'inhouse',
          transaction_id: orderId,
        })
      } catch (logErr) {
        console.error('[Logging] Failed to log approval request:', logErr)
      }

      toast.success('Sent to the executives for approval.')
      return { success: true }
    } catch (err) {
      handleError(err, 'Failed to request approval')
      toast.error(error.value || 'Failed to request approval.')
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  async function resolve(
    requestId: number,
    status: 'approved' | 'rejected',
    note?: string | null,
  ): Promise<{ success: boolean }> {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    try {
      // Guarded on 'pending' so a second click, or two approvers acting at
      // once, cannot re-resolve a decided request.
      const { data: updated, error: updateError } = await supabase
        .from('change_requests')
        .update({
          status,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          resolution_note: note ?? null,
        })
        .eq('id', requestId)
        .eq('request_type', shortDatedRequestType)
        .eq('status', 'pending')
        .select('id, transaction_id')
      if (updateError) throw updateError

      if (!updated?.length) {
        toast.warning('That request has already been decided.')
        await fetchRequests({ status: 'pending' })
        loading.value = false
        return { success: false }
      }

      try {
        await logsStore.createLog({
          action: status === 'approved' ? 'short_dated_approved' : 'short_dated_rejected',
          description: `Short-dated delivery ${status}${note ? ` — ${note}` : ''}`,
          module: 'inhouse',
          transaction_id: updated[0].transaction_id,
        })
      } catch (logErr) {
        console.error('[Logging] Failed to log approval decision:', logErr)
      }

      toast.success(status === 'approved' ? 'Approved.' : 'Rejected.')
      await fetchRequests({ status: 'pending' })
      return { success: true }
    } catch (err) {
      handleError(err, 'Failed to resolve the request')
      toast.error(error.value || 'Failed to resolve the request.')
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  return {
    requests, pendingRequests, pendingCount, loading, error,
    fetchRequests, hasApproval, requestFor, requestApproval, resolve,
    clearError,
  }
})
