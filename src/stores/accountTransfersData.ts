import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useGLDataStore } from '@/stores/glData'
import { glAccountCodeFor, useFinanceDataStore } from '@/stores/financeData'
import type { CashClassification } from '@/stores/financeData'
import { formatCurrency, generateNextNumber, getErrorMessage, insertWithDocRetry } from '@/utils/helpers'

// ─────────────────────────────────────────────────────────────────────────────
// Transfers between our own cash accounts (transaction_type = 'fund_transfer')
//
// Any account to any other: bank to bank (fund BDO from AUB), bank to cash on
// hand, cash box to bank, placing or withdrawing a time deposit. Not new money,
// so nothing touches revenue or equity. The same shape as a bank deposit
// (bankDepositsData), which stays as the dedicated cash-box -> bank flow:
//   funding_account_id = source        cash_account_id = destination
//   reference_no TRF-YYYY-###, paid_at = the value date,
//   finance_details.or_si_no = the bank's transfer / confirmation number,
//   status 'recorded' -> 'cleared' once it shows on the bank statement.
//
// GL: DR <destination> / CR <source>, posted here at record time like a
// deposit — gl_project_events has no 'fund_transfer' loop, so this cannot be
// double-booked. Two accounts on the SAME GL account (BDO and AUB are both
// 1020 Cash in Bank) post nothing: the ledger figure does not change, and an
// entry debiting and crediting one account says nothing. The document and
// both accounts' histories are the record.
//
// A bank fee is an ordinary expense paid from the source account (8030
// Service Charges), recorded through recordExpense so it lands in the expense
// reports and the projector books it like any other.
// ─────────────────────────────────────────────────────────────────────────────

/** The bank's own charge for moving money — Finance Costs, not a transfer. */
export const bankFeeAccountCode = '8030'

export type TransferStatus = 'recorded' | 'cleared'

export type AccountTransferType = {
  id: number
  created_at: string
  reference_no: string | null
  status: TransferStatus
  transfer_date: string | null
  amount: number
  from_account_id: number | null
  from_account_name: string | null
  to_account_id: number | null
  to_account_name: string | null
  confirmation_no: string | null
  remarks: string | null
  created_by: string | null
  cleared_at: string | null
}

type CashAccountLike = { classification: CashClassification; gl_account_code?: string | null }

const transferSelect = `
  *,
  to_account:cash_account_id(name),
  from_account:funding_account_id(name),
  finance_details(or_si_no)
`

export const useAccountTransfersStore = defineStore('accountTransfers', () => {
  const toast = useToast()
  const authStore = useAuthUserStore()
  const glStore = useGLDataStore()
  const financeStore = useFinanceDataStore()

  const transfers: Ref<AccountTransferType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  function mapTransfer(row: any): AccountTransferType {
    const details = Array.isArray(row.finance_details) ? row.finance_details[0] : row.finance_details
    return {
      id: row.id,
      created_at: row.created_at,
      reference_no: row.reference_no,
      status: (row.status ?? 'recorded') as TransferStatus,
      transfer_date: row.paid_at,
      amount: Number(row.total_amount ?? 0),
      from_account_id: row.funding_account_id,
      from_account_name: row.from_account?.name ?? null,
      to_account_id: row.cash_account_id,
      to_account_name: row.to_account?.name ?? null,
      confirmation_no: details?.or_si_no ?? null,
      remarks: row.remarks,
      created_by: row.created_by,
      cleared_at: row.approved_at,
    }
  }

  async function fetchTransfers() {
    loading.value = true
    error.value = ''
    try {
      const { data, error: fetchError } = await supabase
        .from('transactions')
        .select(transferSelect)
        .eq('transaction_type', 'fund_transfer')
        .order('created_at', { ascending: false })
      if (fetchError) throw fetchError
      transfers.value = (data ?? []).map(mapTransfer)
      return transfers.value
    } catch (err) {
      error.value = getErrorMessage(err) || 'Failed to fetch transfers'
      return []
    } finally {
      loading.value = false
    }
  }

  async function recordTransfer(payload: {
    fromAccountId: number
    toAccountId: number
    amount: number
    /** The bank's charge, taken from the source on top of the amount. 0 for none. */
    fee: number
    transferDate: string
    confirmationNo?: string
    remarks?: string
  }): Promise<{ success: boolean; transferNo?: string }> {
    loading.value = true
    error.value = ''
    try {
      const { user, error: authError } = await authStore.getCurrentUser()
      if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }
      if (!(payload.amount > 0)) { toast.error('Transfer amount must be positive.'); return { success: false } }
      if (payload.fee < 0) { toast.error('The bank fee cannot be negative.'); return { success: false } }
      if (payload.fromAccountId === payload.toAccountId) {
        toast.error('Choose two different accounts.'); return { success: false }
      }

      const { data: accounts, error: accountsError } = await supabase
        .from('cash_accounts')
        .select('id, name, institution, balance, classification, gl_account_code, is_active')
        .in('id', [payload.fromAccountId, payload.toAccountId])
      if (accountsError || !accounts || accounts.length !== 2) {
        toast.error('Could not load both accounts.'); return { success: false }
      }
      const from = accounts.find((a) => a.id === payload.fromAccountId)!
      const to = accounts.find((a) => a.id === payload.toAccountId)!
      if (!from.is_active || !to.is_active) { toast.error('Both accounts must be active.'); return { success: false } }

      // The amount and the fee both leave the source.
      const leaving = payload.amount + payload.fee
      if (leaving > Number(from.balance ?? 0) + 0.005) {
        toast.error(`${from.name} holds ${formatCurrency(Number(from.balance ?? 0))}; this transfer needs ${formatCurrency(leaving)}.`)
        return { success: false }
      }

      const year = new Date().getFullYear().toString()
      const { data: created, docNo, error: insertError } = await insertWithDocRetry<{ id: number }>(
        () => generateNextNumber('reference_no', `TRF-${year}-`),
        async (transferNo) => supabase
          .from('transactions')
          .insert({
            reference_no: transferNo,
            transaction_type: 'fund_transfer',
            status: 'recorded',
            funding_account_id: from.id,
            cash_account_id: to.id,
            subtotal: payload.amount,
            total_amount: payload.amount,
            paid_at: payload.transferDate,
            remarks: payload.remarks || null,
            created_by: user.id,
          })
          .select('id')
          .single(),
      )
      if (insertError || !created) throw insertError ?? new Error('Failed to record the transfer.')

      // The bank's reference is what ties this to a line on both statements.
      if (payload.confirmationNo) {
        const { error: detailsError } = await supabase.from('finance_details').insert({
          transaction_id: created.id, or_si_no: payload.confirmationNo,
        })
        if (detailsError) console.warn('recordTransfer: confirmation number not saved:', detailsError.message)
      }

      // Both balances move. Best-effort like every balance write here
      // (JS-over-RPC convention): surfaced, not rolled back.
      const { error: fromError } = await supabase
        .from('cash_accounts').update({ balance: Number(from.balance ?? 0) - payload.amount }).eq('id', from.id)
      const { error: toError } = await supabase
        .from('cash_accounts').update({ balance: Number(to.balance ?? 0) + payload.amount }).eq('id', to.id)
      if (fromError || toError) {
        console.warn('recordTransfer: balance update failed:', fromError?.message ?? toError?.message)
        toast.warning('Transfer recorded, but an account balance did not update. Verify both accounts.')
      }

      // DR destination / CR source — unless both sit on the same GL account,
      // where there is nothing for the ledger to move (see the header).
      const toCode = glAccountCodeFor(to as CashAccountLike)
      const fromCode = glAccountCodeFor(from as CashAccountLike)
      if (toCode !== fromCode) {
        const glResult = await glStore.postJournalEntry(
          payload.transferDate,
          'manual',
          created.id,
          `Transfer ${docNo}: ${from.name} to ${to.name}`,
          [
            { account_code: toCode, debit: payload.amount, credit: 0 },
            { account_code: fromCode, debit: 0, credit: payload.amount },
          ],
          user.id,
        )
        if (!glResult.success) {
          console.warn('recordTransfer: journal entry failed:', glResult.error)
          toast.warning('Transfer recorded, but its journal entry failed to post. Post it manually.')
        }
      }

      // The fee: an expense out of the source, through the normal path.
      if (payload.fee > 0) {
        const fee = await financeStore.recordExpense({
          category: bankFeeAccountCode,
          amount: payload.fee,
          cashAccountId: from.id,
          valueDate: payload.transferDate,
          paidTo: from.institution || from.name,
          remarks: `Bank fee on transfer ${docNo}`,
        })
        if (fee.success) {
          const note = `Bank fee ${formatCurrency(payload.fee)} — ${fee.expenseNo}`
          await supabase.from('transactions')
            .update({ remarks: payload.remarks ? `${payload.remarks} · ${note}` : note })
            .eq('id', created.id)
        } else {
          toast.warning(`Transfer ${docNo} recorded, but its ${formatCurrency(payload.fee)} bank fee was not. Record it as an expense from ${from.name}.`)
        }
      }

      const { error: logError } = await supabase.from('logs').insert({
        created_by: user.id, action: 'fund_transfer', module: 'finance', transaction_id: created.id,
        description: `${docNo} | ${formatCurrency(payload.amount)} | ${from.name} -> ${to.name}${payload.fee > 0 ? ` | fee ${formatCurrency(payload.fee)}` : ''}`,
      })
      if (logError) console.warn('recordTransfer: activity log insert failed:', logError.message)

      toast.success(`Transfer ${docNo} recorded.`)
      await Promise.all([fetchTransfers(), financeStore.fetchCashAccounts()])
      return { success: true, transferNo: docNo ?? undefined }
    } catch (err) {
      error.value = getErrorMessage(err) || 'Failed to record the transfer.'
      toast.error(error.value)
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  /** Confirmed against the bank statement; until then it is in transit. */
  async function markCleared(transferId: number) {
    loading.value = true
    error.value = ''
    try {
      const { user, error: authError } = await authStore.getCurrentUser()
      if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }
      const { data, error: updateError } = await supabase
        .from('transactions')
        .update({ status: 'cleared', approved_by: user.id, approved_at: new Date().toISOString() })
        .eq('id', transferId)
        .eq('transaction_type', 'fund_transfer')
        .eq('status', 'recorded')
        .select('id')
      if (updateError) throw updateError
      if (!data?.length) { toast.info('This transfer was already marked cleared.'); return { success: false } }
      toast.success('Transfer confirmed against the bank statement.')
      await fetchTransfers()
      return { success: true }
    } catch (err) {
      error.value = getErrorMessage(err) || 'Failed to mark the transfer cleared.'
      toast.error(error.value)
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  return { transfers, loading, error, fetchTransfers, recordTransfer, markCleared }
})
