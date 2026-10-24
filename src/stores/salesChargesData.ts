import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { fetchAllRows, fetchAllRowsForIds } from '@/stores/shared/paging'
import { chargeToAccount, isCreditSettlement } from '@/utils/paymentMethods'
import type { ChequeDetails } from '@/utils/paymentMethods'
import { formatCurrency, getErrorMessage } from '@/utils/helpers'

// POS sales charged to a customer account (pos_sale_details.payment_method
// 'on_account'): what is still owed on them, and the payments against them.
//
// A payment is a `collections` row on the sale, the same ledger In-House and
// Ethical payments use, so gl_project_events books it (DR cash / CR 1030) and
// AR aging, the customer statement and the income statement by collections
// all read it with no special case. What is owed is DERIVED (total less the
// non-voided payments); there is no cached amount_paid on a sale.

/** A charged sale still counts while a void request on it is pending. */
const openChargeStatuses = ['completed', 'change_request']

export const useSalesChargesStore = defineStore('salesCharges', () => {
  const toast = useToast()
  const authStore = useAuthUserStore()

  const loading = ref(false)
  const error = ref('')

  /** Paid so far on each sale (non-voided payments). THROWS if unreadable. */
  async function paidBySale(saleIds: number[]): Promise<Map<number, number>> {
    const rows = await fetchAllRowsForIds<{ transaction_id: number; amount: number | null }>(saleIds, (batch) =>
      supabase.from('collections').select('id, transaction_id, amount')
        .in('transaction_id', batch).is('voided_at', null).order('id', { ascending: true }))
    const paid = new Map<number, number>()
    for (const r of rows) paid.set(Number(r.transaction_id), (paid.get(Number(r.transaction_id)) ?? 0) + Number(r.amount ?? 0))
    return paid
  }

  /**
   * What a customer still owes on all their charged sales. Null when it could
   * not be read, so the checkout says so instead of showing ₱0.00.
   */
  async function customerBalance(customerId: number): Promise<number | null> {
    try {
      const sales = await fetchAllRows<{ id: number; total_amount: number | null }>(() => supabase
        .from('transactions')
        .select('id, total_amount, pos_sale_details!inner(payment_method)')
        .eq('transaction_type', 'sale')
        .eq('customer_id', customerId)
        .in('status', openChargeStatuses)
        .eq('pos_sale_details.payment_method', chargeToAccount)
        .order('id', { ascending: true }))
      const paid = await paidBySale(sales.map((s) => s.id))
      return sales.reduce((sum, s) => sum + Math.max(0, Number(s.total_amount ?? 0) - (paid.get(s.id) ?? 0)), 0)
    } catch (err) {
      console.warn('customerBalance:', getErrorMessage(err))
      return null
    }
  }

  /**
   * A payment on a charged sale, received at the office into one of our
   * accounts. Mirrors In-House recordPayment: the collections row is the
   * record, and the receiving account's balance is credited best-effort.
   */
  async function recordPayment(payload: {
    saleId: number
    amount: number
    method?: string | null
    reference?: string | null
    remarks?: string | null
    /** Null only for a return credit (method 'return_credit'): no money moves. */
    cashAccountId: number | null
    /**
     * The cheque, when the payment was one. Written to collections.cheque_bank /
     * cheque_no / cheque_date — only when present, so a cash payment never
     * touches those columns.
     */
    cheque?: ChequeDetails | null
  }): Promise<{ success: boolean }> {
    // A return credit or a credit memo: settled by a credit, so no money moves.
    const isReturnCredit = isCreditSettlement(payload.method)
    loading.value = true
    error.value = ''
    try {
      const { user, error: authError } = await authStore.getCurrentUser()
      if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }
      if (!(payload.amount > 0)) { toast.error('Payment amount must be positive.'); return { success: false } }

      const { data: sale, error: saleError } = await supabase
        .from('transactions')
        .select('id, status, total_amount, sale_no, pos_sale_details(payment_method)')
        .eq('id', payload.saleId)
        .eq('transaction_type', 'sale')
        .maybeSingle()
      if (saleError || !sale) { toast.error('Sale not found.'); return { success: false } }
      const details = Array.isArray(sale.pos_sale_details) ? sale.pos_sale_details[0] : sale.pos_sale_details
      if ((details as { payment_method?: string | null } | null)?.payment_method !== chargeToAccount) {
        toast.error('Only a sale charged to account takes payments.')
        return { success: false }
      }
      if (sale.status === 'change_request') {
        toast.error('A void request is pending on this sale. Wait for the decision first.')
        return { success: false }
      }
      if (sale.status !== 'completed') { toast.error('This sale was voided.'); return { success: false } }

      const paid = (await paidBySale([sale.id])).get(sale.id) ?? 0
      const balance = Number(sale.total_amount ?? 0) - paid
      if (payload.amount > balance + 0.005) {
        toast.error(`Payment (${formatCurrency(payload.amount)}) is more than what is owed (${formatCurrency(balance)}).`)
        return { success: false }
      }

      // The receiving account first: a payment pointing at a missing account
      // would record money as landing nowhere. A return credit has none.
      let account: { id: number; name: string; balance: number | null } | null = null
      if (!isReturnCredit) {
        const { data, error: accountError } = payload.cashAccountId == null
          ? { data: null, error: null }
          : await supabase.from('cash_accounts').select('id, name, balance').eq('id', payload.cashAccountId).maybeSingle()
        if (accountError || !data) { toast.error('Select a valid cash account to deposit this payment into.'); return { success: false } }
        account = data
      }

      const { error: insertError } = await supabase.from('collections').insert({
        transaction_id: sale.id,
        amount: payload.amount,
        payment_method: payload.method || null,
        reference_no: payload.reference || null,
        collected_by: user.id,
        remarks: payload.remarks || null,
        cash_account_id: isReturnCredit ? null : payload.cashAccountId,
        ...(payload.cheque
          ? { cheque_bank: payload.cheque.bank, cheque_no: payload.cheque.number, cheque_date: payload.cheque.date }
          : {}),
      })
      if (insertError) throw insertError

      // Best-effort like every other balance write here (JS-over-RPC
      // convention): surfaced, not rolled back — the collections row is the record.
      if (account) {
        const { error: balanceError } = await supabase
          .from('cash_accounts')
          .update({ balance: (account.balance ?? 0) + payload.amount })
          .eq('id', account.id)
        if (balanceError) {
          console.warn('recordPayment: cash account balance update failed:', balanceError.message)
          toast.warning(`Payment recorded, but ${account.name}'s balance was not updated. Verify it manually.`)
        }
      }

      const { error: logError } = await supabase.from('logs').insert({
        created_by: user.id, action: 'payment', module: 'pos', transaction_id: sale.id,
        description: `${account ? 'Payment' : 'Returned goods credit'} of ${formatCurrency(payload.amount)} on ${sale.sale_no ?? `sale #${sale.id}`}${account ? ` into ${account.name}` : ` (${payload.reference ?? 'return'})`} (${formatCurrency(paid + payload.amount)} of ${formatCurrency(Number(sale.total_amount ?? 0))})`,
      })
      if (logError) console.warn('recordPayment: activity log insert failed:', logError.message)

      const settled = balance - payload.amount <= 0.005
      toast.success(isReturnCredit
        ? (settled ? 'Credit taken off the bill — paid in full.' : 'Credit taken off the bill.')
        : (settled ? 'Payment recorded — paid in full.' : 'Payment recorded.'))
      return { success: true }
    } catch (err) {
      error.value = getErrorMessage(err) || 'Failed to record the payment.'
      toast.error(error.value)
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  return { loading, error, paidBySale, customerBalance, recordPayment }
})
