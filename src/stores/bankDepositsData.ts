import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useGLDataStore } from '@/stores/glData'
import { glCashCode } from '@/stores/financeData'
import type { CashClassification } from '@/stores/financeData'
import { generateNextNumber, insertWithDocRetry, getErrorMessage } from '@/utils/helpers'

// ─────────────────────────────────────────────────────────────────────────────
// Bank deposits (transaction_type = 'bank_deposit')
//
// Moves money the company already holds from Cash on Hand into Cash in Bank —
// the physical trip to the bank. This is NOT new money: it is a transfer
// between two of our own asset accounts, which is why it never touches revenue
// or equity. A generic "add funds" button would have no credit side and would
// break the balance sheet; this has one by construction.
//
// It is the exact mirror of petty-cash replenishment, which already moves bank
// -> cash on hand (DR 1010 / CR 1020) using the same two FKs on the hub:
//   funding_account_id = source        cash_account_id = destination
// A deposit is DR <destination> / CR <source>.
//
// DELIBERATELY ZERO SCHEMA CHANGE. Everything reuses existing columns:
//   reference_no          DEP-YYYY-###  (per-type columns are the convention,
//                                        but a dep_no would be DDL)
//   paid_at               the bank's value date
//   created_at            when staff recorded it
//   created_by            who deposited it
//   approved_by/_at       who confirmed it against the bank statement
//   status                'recorded' -> 'cleared'
//   finance_details.or_si_no   the bank validation / deposit slip number
// The gap between paid_at and a 'cleared' status is what the bank
// reconciliation calls Deposits in Transit.
//
// GL is posted here at record time via glData.postJournalEntry rather than by
// gl_project_events, matching how createCashAccount books its opening entry.
// NOTE FOR FUTURE WORK: if a 'bank_deposit' loop is ever added to
// gl_project_events, it will double-book these — the projector has no such
// loop today, which is why posting here is safe.
// ─────────────────────────────────────────────────────────────────────────────

export type DepositStatus = 'recorded' | 'cleared'

export type BankDepositType = {
  id: number
  created_at: string
  reference_no: string | null
  status: DepositStatus
  deposit_date: string | null
  amount: number
  from_account_id: number | null
  from_account_name: string | null
  to_account_id: number | null
  to_account_name: string | null
  bank_name: string | null
  validation_no: string | null
  remarks: string | null
  created_by: string | null
  cleared_by: string | null
  cleared_at: string | null
}

const DEPOSIT_SELECT = `
  *,
  to_account:cash_account_id(name, institution, classification),
  from_account:funding_account_id(name, classification),
  finance_details(or_si_no)
`

export const useBankDepositsStore = defineStore('bankDeposits', () => {
  const toast = useToast()
  const authStore = useAuthUserStore()
  const glStore = useGLDataStore()

  const deposits: Ref<BankDepositType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')

  function handleError(err: unknown, defaultMessage: string) {
    error.value = getErrorMessage(err) || defaultMessage
  }
  function clearError() { error.value = '' }

  function mapDeposit(row: any): BankDepositType {
    return {
      id: row.id,
      created_at: row.created_at,
      reference_no: row.reference_no,
      status: (row.status ?? 'recorded') as DepositStatus,
      deposit_date: row.paid_at,
      amount: Number(row.total_amount ?? 0),
      from_account_id: row.funding_account_id,
      from_account_name: row.from_account?.name ?? null,
      to_account_id: row.cash_account_id,
      to_account_name: row.to_account?.name ?? null,
      bank_name: row.to_account?.institution ?? null,
      validation_no: row.finance_details?.or_si_no ?? null,
      remarks: row.remarks,
      created_by: row.created_by,
      cleared_by: row.approved_by,
      cleared_at: row.approved_at,
    }
  }

  async function fetchDeposits() {
    loading.value = true
    clearError()
    try {
      const { data, error: fetchError } = await supabase
        .from('transactions')
        .select(DEPOSIT_SELECT)
        .eq('transaction_type', 'bank_deposit')
        .order('created_at', { ascending: false })
      if (fetchError) throw fetchError
      deposits.value = (data ?? []).map(mapDeposit)
      return deposits.value
    } catch (err) {
      handleError(err, 'Failed to fetch bank deposits')
      return []
    } finally {
      loading.value = false
    }
  }

  async function recordDeposit(payload: {
    fromAccountId: number
    toAccountId: number
    amount: number
    depositDate: string
    validationNo: string
    remarks?: string
    /**
     * Remittances this deposit banks the cash for. Recorded as `logs` rows
     * rather than a join table — the connector-is-logs convention — so one
     * deposit can cover several days, which a single FK could not express.
     */
    remittanceIds?: number[]
  }) {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    if (payload.amount <= 0) {
      toast.error('Deposit amount must be positive.'); loading.value = false; return { success: false }
    }
    if (payload.fromAccountId === payload.toAccountId) {
      toast.error('A deposit must move money between two different accounts.')
      loading.value = false; return { success: false }
    }

    const { data: accounts, error: accountsError } = await supabase
      .from('cash_accounts')
      .select('id, name, balance, classification')
      .in('id', [payload.fromAccountId, payload.toAccountId])
    if (accountsError || !accounts || accounts.length !== 2) {
      toast.error('Could not load both cash accounts.'); loading.value = false; return { success: false }
    }
    const from = accounts.find((a) => a.id === payload.fromAccountId)!
    const to = accounts.find((a) => a.id === payload.toAccountId)!

    // You cannot bank more cash than you are holding. This is the check that
    // makes the Cash on Hand balance mean something.
    if (payload.amount > (from.balance ?? 0) + 0.005) {
      toast.error(`${from.name} only holds ${from.balance ?? 0}. You cannot deposit more than that.`)
      loading.value = false; return { success: false }
    }

    const year = new Date().getFullYear().toString()
    const { data: created, docNo, error: insertError } = await insertWithDocRetry<{ id: number }>(
      () => generateNextNumber('reference_no', `DEP-${year}-`),
      async (depNo) => supabase
        .from('transactions')
        .insert({
          reference_no: depNo,
          transaction_type: 'bank_deposit',
          status: 'recorded',
          funding_account_id: payload.fromAccountId,
          cash_account_id: payload.toAccountId,
          subtotal: payload.amount,
          total_amount: payload.amount,
          paid_at: payload.depositDate,
          remarks: payload.remarks || null,
          created_by: user.id,
        })
        .select('id')
        .single(),
    )
    if (insertError || !created) {
      handleError(insertError, 'Failed to record deposit.')
      toast.error(getErrorMessage(insertError) || 'Failed to record deposit.')
      loading.value = false
      return { success: false }
    }

    // The bank's validation / slip number is the proof that ties this record to
    // a line on the bank statement.
    const { error: detailsError } = await supabase.from('finance_details').insert({
      transaction_id: created.id,
      or_si_no: payload.validationNo || null,
    })
    if (detailsError) console.warn('recordDeposit: validation number not saved:', detailsError.message)

    // Both balances move. Best-effort, matching every other balance write in
    // the app (JS-over-RPC convention) — surfaced rather than rolled back.
    const { error: fromError } = await supabase
      .from('cash_accounts').update({ balance: (from.balance ?? 0) - payload.amount }).eq('id', from.id)
    const { error: toError } = await supabase
      .from('cash_accounts').update({ balance: (to.balance ?? 0) + payload.amount }).eq('id', to.id)
    if (fromError || toError) {
      console.warn('recordDeposit: balance update failed:', fromError?.message ?? toError?.message)
      toast.warning('Deposit recorded, but a cash account balance did not update. Verify both accounts.')
    }

    // DR destination / CR source — a transfer between two asset accounts, so
    // nothing hits revenue or equity.
    const glResult = await glStore.postJournalEntry(
      payload.depositDate,
      'manual',
      created.id,
      `Bank deposit ${docNo}: ${from.name} to ${to.name}`,
      [
        { account_code: glCashCode(to.classification as CashClassification), debit: payload.amount, credit: 0 },
        { account_code: glCashCode(from.classification as CashClassification), debit: 0, credit: payload.amount },
      ],
      user.id,
    )
    if (!glResult.success) {
      console.warn('recordDeposit: journal entry failed:', glResult.error)
      toast.warning('Deposit recorded, but its journal entry failed to post. Resync the ledger or post it manually.')
    }

    // Which days' collections this deposit banks — drives the "cash collected
    // but not yet deposited" view.
    for (const remittanceId of payload.remittanceIds ?? []) {
      const { error: linkError } = await supabase.from('logs').insert({
        created_by: user.id, action: 'deposit_covers_remittance',
        description: `Banked by ${docNo} into ${to.name}`,
        module: 'finance', transaction_id: remittanceId,
      })
      if (linkError) console.warn('recordDeposit: remittance link failed:', linkError.message)
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'bank_deposit',
      description: `${docNo} | ${payload.amount} | ${from.name} -> ${to.name}`,
      module: 'finance', transaction_id: created.id,
    })
    if (logError) console.warn('recordDeposit: activity log insert failed:', logError.message)

    toast.success(`Deposit ${docNo} recorded.`)
    await fetchDeposits()
    loading.value = false
    return { success: true, depositId: created.id, depositNo: docNo }
  }

  // Confirmed against the bank statement. Until this happens the deposit is a
  // Deposit in Transit for reconciliation purposes.
  async function markCleared(depositId: number) {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'cleared', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', depositId)
      .eq('transaction_type', 'bank_deposit')
      .eq('status', 'recorded')
    if (updateError) {
      handleError(updateError, 'Failed to mark the deposit as cleared.')
      toast.error(getErrorMessage(updateError) || 'Failed to mark the deposit as cleared.')
      loading.value = false
      return { success: false }
    }

    toast.success('Deposit confirmed against the bank statement.')
    await fetchDeposits()
    loading.value = false
    return { success: true }
  }

  return {
    deposits, loading, error, isLoading, hasError,
    fetchDeposits, recordDeposit, markCleared,
    clearError,
  }
})
