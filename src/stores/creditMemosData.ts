import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useFinanceDataStore } from '@/stores/financeData'
import type { ARSource } from '@/stores/financeData'
import { useEthicalDataStore } from '@/stores/ethicalData'
import { useInhouseDataStore } from '@/stores/inhouseData'
import { useSalesChargesStore } from '@/stores/salesChargesData'
import { useSalesReturnsDataStore } from '@/stores/salesReturnsData'
import { creditMemo, returnCredit } from '@/utils/paymentMethods'
import { formatCurrency, generateNextNumber, getErrorMessage } from '@/utils/helpers'

// Credit memos — a numbered document (CM-YYYY-###) that reduces what a customer
// owes: for returned / expired goods, or for an allowance (a price correction,
// a short or damaged delivery, an agreed allowance).
//
// A `transactions` row of type 'credit_memo' (schema 20261024_credit_memos):
// customer, amount, reason, the bill it applies to (applies_to_id) and, for
// returned goods, the return it came from (sales_return_id). Staff REQUEST one;
// an executive APPROVES it in Action Required, and only then does it get its
// number and take effect — so a rejected request leaves no gap in the series.
//
// Its effect on the bill is a `collections` row on that bill, recorded through
// the module that owns it (Ethical recordCollection, In-House recordPayment,
// POS charge recordPayment), so the balance, status, aging and statement move
// exactly as for a payment. payment_method says how the ledger books it:
//   'credit_memo'   allowance        DR 4020 / CR 1030
//   'return_credit' returned goods   DR 2065 / CR 1030 (the return booked 4020)
// reference_no on that row is the CM number.

export type CreditMemoStatus = 'pending_approval' | 'issued' | 'rejected'

export type CreditMemoReason =
  | 'returned_goods' | 'price_correction' | 'short_delivery' | 'damaged_goods' | 'allowance' | 'other'

/** Why a credit memo is issued. 'returned_goods' only comes from a sales return. */
export const creditMemoReasons: { value: CreditMemoReason; title: string }[] = [
  { value: 'returned_goods', title: 'Returned / expired goods' },
  { value: 'price_correction', title: 'Price correction / overbilling' },
  { value: 'short_delivery', title: 'Short delivery' },
  { value: 'damaged_goods', title: 'Damaged goods (not returned)' },
  { value: 'allowance', title: 'Agreed allowance / discount' },
  { value: 'other', title: 'Other' },
]

export function creditMemoReasonLabel(code: string | null | undefined): string {
  return creditMemoReasons.find((r) => r.value === code)?.title ?? (code || '—')
}

export type CreditMemoType = {
  id: number
  cm_no: string | null
  status: CreditMemoStatus
  created_at: string
  created_by: string | null
  approved_at: string | null
  approved_by: string | null
  customer_id: number | null
  customer_name: string | null
  customer_address: string | null
  customer_tin: string | null
  amount: number
  reason_code: CreditMemoReason | null
  /** The explanation staff wrote. */
  reason: string | null
  applies_to_id: number | null
  applies_to_type: ARSource | null
  applies_to_no: string | null
  sales_return_id: number | null
  sales_return_no: string | null
}

const memoSelect = `
  id, status, created_at, created_by, approved_at, approved_by, credit_memo_no, total_amount, remarks,
  customer_id, applies_to_id, sales_return_id,
  customer:customer_id ( name, address, tin_number ),
  finance_details ( category ),
  applies_to:applies_to_id ( id, transaction_type, ethical_no, inhouse_no, sale_no ),
  sales_return:sales_return_id ( id, sales_return_no )
`

function mapRow(row: any): CreditMemoType {
  const fd = Array.isArray(row.finance_details) ? row.finance_details[0] : row.finance_details
  const target = Array.isArray(row.applies_to) ? row.applies_to[0] : row.applies_to
  const ret = Array.isArray(row.sales_return) ? row.sales_return[0] : row.sales_return
  return {
    id: row.id,
    cm_no: row.credit_memo_no ?? null,
    status: row.status,
    created_at: row.created_at,
    created_by: row.created_by ?? null,
    approved_at: row.approved_at ?? null,
    approved_by: row.approved_by ?? null,
    customer_id: row.customer_id ?? null,
    customer_name: row.customer?.name ?? null,
    customer_address: row.customer?.address ?? null,
    customer_tin: row.customer?.tin_number ?? null,
    amount: Number(row.total_amount ?? 0),
    reason_code: (fd?.category ?? null) as CreditMemoReason | null,
    reason: row.remarks ?? null,
    applies_to_id: row.applies_to_id ?? null,
    applies_to_type: (target?.transaction_type ?? null) as ARSource | null,
    applies_to_no: target?.ethical_no ?? target?.inhouse_no ?? target?.sale_no ?? null,
    sales_return_id: row.sales_return_id ?? null,
    sales_return_no: ret?.sales_return_no ?? null,
  }
}

export const useCreditMemosStore = defineStore('creditMemos', () => {
  const toast = useToast()
  const authStore = useAuthUserStore()

  const memos: Ref<CreditMemoType[]> = ref([])
  const loading = ref(false)
  const error = ref('')

  const pendingMemos = computed(() => memos.value.filter((m) => m.status === 'pending_approval'))

  function handleError(err: unknown, fallback: string) {
    console.error(err)
    error.value = getErrorMessage(err) || fallback
  }

  async function fetchCreditMemos(options: { status?: CreditMemoStatus; customerId?: number } = {}) {
    loading.value = true
    error.value = ''
    try {
      let q = supabase.from('transactions').select(memoSelect).eq('transaction_type', 'credit_memo')
      if (options.status) q = q.eq('status', options.status)
      if (options.customerId != null) q = q.eq('customer_id', options.customerId)
      const { data, error: e } = await q.order('created_at', { ascending: false })
      if (e) throw e
      memos.value = (data ?? []).map(mapRow)
      return memos.value
    } catch (err) {
      handleError(err, 'Failed to load credit memos')
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchCreditMemoById(id: number): Promise<CreditMemoType | null> {
    const { data, error: e } = await supabase
      .from('transactions').select(memoSelect).eq('transaction_type', 'credit_memo').eq('id', id).maybeSingle()
    if (e) { handleError(e, 'Failed to load the credit memo'); return null }
    return data ? mapRow(data) : null
  }

  /** Pending (not yet approved) credit on a bill — kept out of what can still be credited. */
  async function pendingOnBill(billId: number, exceptId?: number): Promise<number> {
    const { data, error: e } = await supabase
      .from('transactions').select('id, total_amount')
      .eq('transaction_type', 'credit_memo').eq('status', 'pending_approval').eq('applies_to_id', billId)
    if (e) throw e
    return ((data ?? []) as any[]).filter((r) => r.id !== exceptId).reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0)
  }

  /** What is still owed on a bill, or null if it is not an open receivable of this customer. */
  async function billBalance(customerId: number, target: { source: ARSource; id: number }): Promise<number | null> {
    const rows = await useFinanceDataStore().fetchCustomerReceivables(customerId)
    if (rows == null) throw new Error('Could not read the bill.')
    const row = rows.find((r) => r.source === target.source && r.id === target.id)
    return row ? row.balance : null
  }

  /**
   * Staff ask for a credit memo; nothing changes on the bill until an
   * executive approves it.
   */
  async function requestCreditMemo(payload: {
    target: { source: ARSource; id: number }
    amount: number
    reasonCode: CreditMemoReason
    reason: string
    salesReturnId?: number | null
  }): Promise<{ success: boolean; id?: number }> {
    const amount = Math.round(payload.amount * 100) / 100
    const reason = payload.reason.trim()
    if (!(amount > 0)) { toast.warning('Enter the amount to credit.'); return { success: false } }
    if (!reason) { toast.warning('Say why the customer is being credited.'); return { success: false } }
    if (payload.reasonCode === 'returned_goods' && payload.salesReturnId == null) {
      toast.warning('A credit memo for returned goods is issued from the return itself (Sales → Returns).')
      return { success: false }
    }

    loading.value = true
    try {
      const { user, error: authError } = await authStore.getCurrentUser()
      if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }

      const { data: bill, error: billError } = await supabase
        .from('transactions').select('id, customer_id, transaction_type')
        .eq('id', payload.target.id).eq('transaction_type', payload.target.source).maybeSingle()
      if (billError) throw billError
      if (!bill?.customer_id) { toast.error('That bill could not be found.'); return { success: false } }

      // Never more than the bill still owes, counting credit memos already
      // waiting for approval on it.
      const balance = await billBalance(bill.customer_id, payload.target)
      if (balance == null) { toast.error('That bill is not open — nothing is owed on it.'); return { success: false } }
      const available = Math.round((balance - await pendingOnBill(bill.id)) * 100) / 100
      if (amount > available + 0.005) {
        toast.error(`Only ${formatCurrency(Math.max(0, available))} can still be credited on this bill`
          + (available < balance ? ' (other credit memos on it are awaiting approval).' : '.'))
        return { success: false }
      }

      // From a return: same customer, and within what is left of its credit.
      if (payload.salesReturnId != null) {
        const ret = await useSalesReturnsDataStore().fetchReturnById(payload.salesReturnId)
        if (!ret) { toast.error('Return not found.'); return { success: false } }
        if (ret.customer_id !== bill.customer_id) {
          toast.error(`That bill belongs to another customer, not ${ret.customer_name ?? 'this one'}.`)
          return { success: false }
        }
        if (ret.credit_remaining == null) { toast.error('Could not check how much of this credit is left. Try again.'); return { success: false } }
        if (amount > ret.credit_remaining + 0.005) {
          toast.error(`Only ${formatCurrency(ret.credit_remaining)} of this return's credit is left.`)
          return { success: false }
        }
      }

      const { data: created, error: insertError } = await supabase
        .from('transactions')
        .insert({
          transaction_type: 'credit_memo',
          status: 'pending_approval',
          customer_id: bill.customer_id,
          total_amount: amount,
          subtotal: amount,
          remarks: reason,
          applies_to_id: bill.id,
          sales_return_id: payload.salesReturnId ?? null,
          created_by: user.id,
        })
        .select('id')
        .single()
      if (insertError || !created) throw insertError ?? new Error('Failed to save the credit memo.')

      const { error: detailError } = await supabase
        .from('finance_details').insert({ transaction_id: created.id, category: payload.reasonCode })
      if (detailError) {
        // A credit memo with no reason is not one an executive can judge.
        await supabase.from('transactions').delete().eq('id', created.id)
        throw detailError
      }

      await supabase.from('logs').insert({
        created_by: user.id, action: 'credit_memo_requested', module: 'finance', transaction_id: created.id,
        description: `Credit memo requested: ${formatCurrency(amount)} on ${payload.target.source} #${bill.id} — ${creditMemoReasonLabel(payload.reasonCode)}: ${reason}`,
      })

      toast.success('Credit memo sent to the executives for approval.')
      return { success: true, id: created.id }
    } catch (err) {
      handleError(err, 'Failed to request the credit memo')
      toast.error(error.value || 'Failed to request the credit memo.')
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  /**
   * Approves a credit memo: numbers it and takes it off the bill.
   *
   * Claimed first (guarded on 'pending_approval', so two approvers cannot both
   * apply it), then numbered, then applied. If applying fails — the bill was
   * paid or voided in the meantime — the claim is undone and it goes back to
   * pending, number released.
   */
  async function approveCreditMemo(id: number): Promise<{ success: boolean }> {
    loading.value = true
    try {
      const { user, error: authError } = await authStore.getCurrentUser()
      if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }

      const memo = await fetchCreditMemoById(id)
      if (!memo || memo.status !== 'pending_approval') {
        toast.warning('That credit memo has already been decided.')
        return { success: false }
      }
      if (memo.applies_to_id == null || !memo.applies_to_type) {
        toast.error('This credit memo has no bill to apply to.')
        return { success: false }
      }

      const nowIso = new Date().toISOString()
      const { data: claimed, error: claimError } = await supabase
        .from('transactions')
        .update({ status: 'issued', approved_by: user.id, approved_at: nowIso, updated_at: nowIso })
        .eq('id', id).eq('transaction_type', 'credit_memo').eq('status', 'pending_approval')
        .select('id')
      if (claimError) throw claimError
      if (!claimed?.length) { toast.warning('That credit memo has already been decided.'); return { success: false } }

      // Puts the claim back. Says whether that worked: if it did not, the memo
      // reads as issued with nothing applied, and the approver must be told
      // rather than shown "back to pending".
      const stuck = 'The credit memo could not be put back to pending either — it shows as issued without being applied. Check it in Credit memos before trying again.'
      const release = async (): Promise<boolean> => {
        const { error: releaseError } = await supabase.from('transactions')
          .update({ status: 'pending_approval', approved_by: null, approved_at: null, credit_memo_no: null, reference_no: null })
          .eq('id', id)
        if (releaseError) {
          console.error('approveCreditMemo: could not reset to pending:', releaseError.message)
          toast.error(stuck)
          return false
        }
        return true
      }

      // The number, retried past a collision with a concurrent approval.
      const year = new Date().getFullYear()
      let cmNo: string | null = null
      for (let attempt = 0; attempt < 3 && !cmNo; attempt++) {
        const next = await generateNextNumber('credit_memo_no', `CM-${year}-`, ['reference_no'])
        const { error: numError } = await supabase.from('transactions')
          .update({ credit_memo_no: next, reference_no: next }).eq('id', id)
        if (!numError) cmNo = next
        else if ((numError as { code?: string }).code !== '23505') { await release(); throw numError }
      }
      if (!cmNo) { await release(); throw new Error('Could not assign a credit memo number. Try again.') }

      const method = memo.sales_return_id != null ? returnCredit : creditMemo
      const remarks = `Credit memo ${cmNo} — ${creditMemoReasonLabel(memo.reason_code)}`
      const target = memo.applies_to_id
      const applied = memo.applies_to_type === 'ethical_order'
        ? await useEthicalDataStore().recordCollection({ orderId: target, amount: memo.amount, method, reference: cmNo, remarks, cashAccountId: null })
        : memo.applies_to_type === 'inhouse_order'
          ? await useInhouseDataStore().recordPayment({ orderId: target, amount: memo.amount, method, reference: cmNo, remarks, cashAccountId: null })
          : await useSalesChargesStore().recordPayment({ saleId: target, amount: memo.amount, method, reference: cmNo, remarks, cashAccountId: null })
      if (!applied.success) {
        if (await release()) toast.error('The credit could not be applied to the bill, so the credit memo was not issued. It is back to pending.')
        return { success: false }
      }

      await supabase.from('logs').insert({
        created_by: user.id, action: 'credit_memo_issued', module: 'finance', transaction_id: id,
        description: `${cmNo} issued — ${formatCurrency(memo.amount)} off ${memo.applies_to_no ?? `#${target}`}`,
      })
      toast.success(`Credit memo ${cmNo} issued.`)
      await fetchCreditMemos({ status: 'pending_approval' })
      return { success: true }
    } catch (err) {
      handleError(err, 'Failed to approve the credit memo')
      toast.error(error.value || 'Failed to approve the credit memo.')
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  async function rejectCreditMemo(id: number, note: string): Promise<{ success: boolean }> {
    loading.value = true
    try {
      const { user, error: authError } = await authStore.getCurrentUser()
      if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }
      const memo = await fetchCreditMemoById(id)
      const { data: updated, error: e } = await supabase
        .from('transactions')
        .update({
          status: 'rejected', approved_by: user.id, approved_at: new Date().toISOString(),
          remarks: [memo?.reason, note.trim() ? `Rejected: ${note.trim()}` : 'Rejected'].filter(Boolean).join(' | '),
        })
        .eq('id', id).eq('transaction_type', 'credit_memo').eq('status', 'pending_approval')
        .select('id')
      if (e) throw e
      if (!updated?.length) { toast.warning('That credit memo has already been decided.'); return { success: false } }
      await supabase.from('logs').insert({
        created_by: user.id, action: 'credit_memo_rejected', module: 'finance', transaction_id: id,
        description: `Credit memo request rejected${note.trim() ? ` — ${note.trim()}` : ''}`,
      })
      toast.success('Rejected.')
      await fetchCreditMemos({ status: 'pending_approval' })
      return { success: true }
    } catch (err) {
      handleError(err, 'Failed to reject the credit memo')
      toast.error(error.value || 'Failed to reject the credit memo.')
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  return {
    memos, pendingMemos, loading, error,
    fetchCreditMemos, fetchCreditMemoById, requestCreditMemo, approveCreditMemo, rejectCreditMemo,
  }
})
