// Cash accounts: listing, opening one (with its opening-balance journal entry),
// and the two ways to retire one — deactivate, or delete after reversing the
// opening entry.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useGLDataStore } from '@/stores/glData'
import { getErrorMessage, formatCurrency } from '@/utils/helpers'
// Value import, but cashAccountTypes only imports TYPES back from the store,
// and type imports are erased at build -- so this is not a runtime cycle.
import { isCashGLAccount } from '@/utils/cashAccountTypes'
import type { CashAccountType, CashClassification } from './types'
import { glCashCode } from './helpers'
import { cashAccounts, loading, handleError, clearError } from './state'

const toast = useToast()

// Resolved lazily rather than at import time: a store factory called while
// this module is first evaluated can run before Pinia is installed.
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())
let glStore: ReturnType<typeof useGLDataStore> | null = null
const getGLStore = () => (glStore ??= useGLDataStore())

export async function fetchCashAccounts() {
  loading.value = true
  clearError()
  try {
    const { data, error: fetchError } = await supabase.from('cash_accounts')
      .select('*').eq('is_active', true).order('account_type', { ascending: true })
    if (fetchError) throw fetchError
    cashAccounts.value = (data || []) as CashAccountType[]
    return cashAccounts.value
  } catch (err) {
    handleError(err, 'Failed to fetch cash accounts')
    return []
  } finally {
    loading.value = false
  }
}

/**
 * Everything that would be orphaned by removing a cash account.
 *
 * Checked across BOTH FK roles on transactions — an account can be the one
 * paid from (cash_account_id) or the one replenishing it
 * (funding_account_id) — plus the three other tables that point at it.
 */
export async function cashAccountReferences(cashAccountId: number) {
  const head = { count: 'exact' as const, head: true }
  const [tx, fund, coll, det, rebate] = await Promise.all([
    supabase.from('transactions').select('id', head).eq('cash_account_id', cashAccountId),
    supabase.from('transactions').select('id', head).eq('funding_account_id', cashAccountId),
    supabase.from('collections').select('id', head).eq('cash_account_id', cashAccountId),
    supabase.from('finance_details').select('id', head).eq('cash_account_id', cashAccountId),
    supabase.from('ethical_details').select('id', head).eq('rebate_cash_account_id', cashAccountId),
  ])
  const failed = [tx, fund, coll, det, rebate].some((r) => r.error)
  return {
    failed,
    total: (tx.count ?? 0) + (fund.count ?? 0) + (coll.count ?? 0) + (det.count ?? 0) + (rebate.count ?? 0),
  }
}

/**
 * The journal entry createCashAccount posted for an opening balance, or null
 * if the account had none.
 *
 * reference_type/reference_id ALONE IS NOT ENOUGH. gl_project_events books
 * petty-cash replenishments as 'manual' too, with reference_id set to a
 * TRANSACTION id — and transaction 4 and cash account 4 both exist. Matching
 * on that pair alone could therefore reverse a completely unrelated entry,
 * so the description createCashAccount writes is required as well.
 *
 * Returns 'ambiguous' rather than guessing when more than one still matches.
 */
export async function findCashOpeningEntry(cashAccountId: number, name: string) {
  const { data, error: lookupError } = await supabase
    .from('journal_entries')
    .select('id, entry_no, description')
    .eq('reference_type', 'manual')
    .eq('reference_id', cashAccountId)
    .eq('status', 'posted')
  if (lookupError) return 'ambiguous' as const
  const matches = (data ?? []).filter((e) => e.description === `Opening balance: ${name}`)
  if (matches.length > 1) return 'ambiguous' as const
  return matches.length === 1 ? matches[0] : null
}

/** Retire an account without deleting it — keeps every document that used it
 *  readable while removing it from pickers and from the active totals. */
export async function deactivateCashAccount(cashAccountId: number) {
  loading.value = true
  clearError()
  const { user } = await getAuthStore().getCurrentUser()
  const { error: updateError } = await supabase
    .from('cash_accounts').update({ is_active: false }).eq('id', cashAccountId)
  if (updateError) {
    handleError(updateError, 'Failed to deactivate the cash account.')
    toast.error(getErrorMessage(updateError) || 'Failed to deactivate the cash account.')
    loading.value = false
    return { success: false as const }
  }
  // Logged like create and delete: retiring an account a document points at
  // is a change someone may need to explain later.
  if (user) {
    await supabase.from('logs').insert({
      created_by: user.id, action: 'cash_account_deactivate',
      description: `cash account ${cashAccountId}`, module: 'finance', transaction_id: null,
    })
  }

  toast.success('Cash account deactivated.')
  await fetchCashAccounts()
  loading.value = false
  return { success: true as const }
}

/**
 * Delete a cash account created by mistake, reversing its opening entry first.
 *
 * ORDER IS THE WHOLE POINT. journal_entries.reference_id is a plain bigint,
 * not a foreign key, so deleting the row does NOT cascade or error — the
 * opening entry just stays in the ledger with nothing behind it, overstating
 * cash permanently. That has already happened once, for 9.27M.
 *
 * Refuses outright when anything references the account: those documents are
 * real history, and deactivation is the right answer for them.
 */
export async function removeCashAccount(cashAccountId: number) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) {
    toast.error('User not authenticated.'); loading.value = false; return { success: false as const }
  }

  const { data: account } = await supabase
    .from('cash_accounts').select('id, name, opening_balance').eq('id', cashAccountId).maybeSingle()
  if (!account) {
    toast.error('Cash account not found.'); loading.value = false; return { success: false as const }
  }

  const refs = await cashAccountReferences(cashAccountId)
  if (refs.failed) {
    toast.error('Could not verify what uses this account. Nothing was changed.')
    loading.value = false
    return { success: false as const }
  }
  if (refs.total > 0) {
    toast.error(
      `${account.name} is used by ${refs.total} record${refs.total === 1 ? '' : 's'} and cannot be deleted. `
      + 'Deactivate it instead — that hides it without breaking its history.',
    )
    loading.value = false
    return { success: false as const }
  }

  const opening = await findCashOpeningEntry(cashAccountId, account.name)
  if (opening === 'ambiguous') {
    toast.error(
      'Could not identify the opening entry for this account with certainty. '
      + 'Reverse it by hand in General Journal, then delete the account.',
    )
    loading.value = false
    return { success: false as const }
  }

  // An account opened WITH money must have an opening entry. Finding none
  // means the description did not match, so there is an entry out there this
  // code cannot see — deleting now would strand it, which is the exact
  // failure this action exists to prevent. Refuse instead of guessing.
  if (!opening && Number(account.opening_balance ?? 0) !== 0) {
    toast.error(
      `${account.name} has an opening balance of ${formatCurrency(Number(account.opening_balance))} `
      + 'but no matching ledger entry could be found. Reverse it by hand in General Journal, '
      + 'then delete the account.',
    )
    loading.value = false
    return { success: false as const }
  }

  // Reverse BEFORE deleting: once the row is gone the entry is unreachable
  // from this page and easy to forget about entirely.
  if (opening) {
    const reversed = await getGLStore().reverseJournalEntry(opening.id, user.id)
    if (!reversed.success) {
      toast.error(`${reversed.error ?? 'Could not reverse the opening entry.'} The account was not deleted.`)
      loading.value = false
      return { success: false as const }
    }
  }

  const { error: deleteError } = await supabase
    .from('cash_accounts').delete().eq('id', cashAccountId)
  if (deleteError) {
    handleError(deleteError, 'Failed to delete the cash account.')
    toast.error(
      `${getErrorMessage(deleteError)} The opening entry was already reversed — `
      + 'delete the account, or re-post the entry, so the two agree.',
    )
    loading.value = false
    return { success: false as const }
  }

  await supabase.from('logs').insert({
    created_by: user.id,
    action: 'cash_account_delete',
    description: `${account.name} | opening ${account.opening_balance ?? 0}`
      + (opening ? ` | reversed ${opening.entry_no}` : ' | no opening entry'),
    module: 'finance',
    transaction_id: null,
  })

  toast.success(
    opening ? `${account.name} deleted and ${opening.entry_no} reversed.` : `${account.name} deleted.`,
  )
  await fetchCashAccounts()
  loading.value = false
  return { success: true as const }
}

// Booking an account posts its opening balance to the GL (DR cash / CR
// Owner's Capital) — an opening balance is an accounting event (was
// cash_account_open). Best-effort, not atomic: a failure after the account
// insert can leave an account with no opening journal entry (accepted
// trade-off, JS-over-RPC convention). See 20260702000006_cash_account_opening_gl.sql.
export async function createCashAccount(payload: {
  name: string
  classification: CashClassification
  openingBalance: number
  isActive: boolean
  /**
   * Which chart-of-accounts asset account this cash sits in. Optional: when
   * omitted it falls back to the classification map, which is what every
   * caller did before the link was recordable.
   */
  glAccountCode?: string | null
}) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

  const name = payload.name.trim()
  if (!name) { toast.error('Account name is required.'); loading.value = false; return { success: false } }

  // Resolved once, then used for BOTH the stored link and the opening entry,
  // so the account a row claims to post to and the account its opening
  // balance actually landed in can never disagree.
  const glAccountCode = payload.glAccountCode || glCashCode(payload.classification)

  // Validated HERE, not just in the form's dropdown. The picker only filters
  // what is offered; this store persists whatever it is handed and the
  // journal API accepts any active code -- so without this a caller could
  // link a cash account to, say, 4010 Sales Revenue and route its opening
  // balance and every later cash posting into revenue.
  if (!isCashGLAccount(glAccountCode)) {
    toast.error('That GL account cannot hold cash. Pick a cash, revolving fund or investment account.')
    loading.value = false
    return { success: false }
  }
  const { data: glAccount } = await supabase
    .from('accounts').select('code, is_active').eq('code', glAccountCode).maybeSingle()
  if (!glAccount?.is_active) {
    toast.error('That GL account does not exist or is inactive.')
    loading.value = false
    return { success: false }
  }
  if (!['CASA', 'TIME_INVESTMENT', 'PETTY_CASH'].includes(payload.classification)) {
    toast.error(`Invalid classification: ${payload.classification}`); loading.value = false; return { success: false }
  }
  const openingBalance = payload.openingBalance ?? 0
  if (openingBalance < 0) { toast.error('Opening balance cannot be negative.'); loading.value = false; return { success: false } }

  const accountType = payload.classification === 'PETTY_CASH' ? 'petty_cash' : 'bank'
  const floatAmount = payload.classification === 'PETTY_CASH' ? openingBalance : null

  const { data: created, error: insertError } = await supabase
    .from('cash_accounts')
    .insert({
      name, account_type: accountType, classification: payload.classification,
      float_amount: floatAmount, opening_balance: openingBalance, balance: openingBalance,
      is_active: payload.isActive ?? true,
      gl_account_code: glAccountCode,
    })
    .select('*')
    .single()
  if (insertError || !created) {
    handleError(insertError, 'Failed to add cash account.')
    toast.error(insertError?.message || 'Failed to add cash account.')
    loading.value = false
    return { success: false }
  }

  if (openingBalance !== 0) {
    const result = await getGLStore().postJournalEntry(
      new Date().toISOString().slice(0, 10), 'manual', created.id, `Opening balance: ${name}`,
      [
        { account_code: glAccountCode, debit: openingBalance, credit: 0 },
        { account_code: '3010', debit: 0, credit: openingBalance },
      ],
      user.id,
    )
    if (!result.success) console.warn('createCashAccount: opening journal entry failed:', result.error)
  }

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'cash_account_open',
    description: `${name} | ${payload.classification} | opening ${openingBalance}`, module: 'finance', transaction_id: null,
  })
  if (logError) console.warn('createCashAccount: activity log insert failed:', logError.message)

  cashAccounts.value.push(created as CashAccountType)
  toast.success('Cash account added.')
  loading.value = false
  return { success: true }
}
