// Chart of accounts: the active list every picker reads, the full list used
// only for labels, and creating a new account in the right code range.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { insertWithDocRetry } from '@/utils/helpers'
import type { AccountCategory, GLAccount } from './types'
import { nextAccountCode } from './helpers'
import { accounts, allAccounts, loading, handleError, clearError } from './state'

const toast = useToast()

/** The chart including inactive accounts. Labels only — never picker options. */
export async function fetchAllAccounts() {
  clearError()
  try {
    const { data, error: e } = await supabase.from('accounts').select('*').order('code')
    if (e) throw e
    allAccounts.value = (data || []) as GLAccount[]
    return allAccounts.value
  } catch (err) {
    handleError(err, 'Failed to fetch the full chart of accounts')
    return []
  }
}

export async function fetchAccounts() {
  loading.value = true
  clearError()
  try {
    const { data, error: e } = await supabase.from('accounts').select('*').eq('is_active', true).order('code')
    if (e) throw e
    accounts.value = (data || []) as GLAccount[]
    return accounts.value
  } catch (err) {
    handleError(err, 'Failed to fetch chart of accounts')
    return []
  } finally {
    loading.value = false
  }
}

// The accountant only picks WHERE (category) + a name; the code is derived
// (next free slot in that category's range) and never typed. `code` is the
// primary key, so a same-instant collision is a safe-fail 23505 — retried
// via a fresh re-scan of the whole (tiny) chart, same convention as every
// other doc-number generator in this app.
export async function createAccount(payload: { category: AccountCategory; name: string; isContra: boolean }) {
  loading.value = true
  clearError()

  const normalBalance: GLAccount['normal_balance'] = payload.isContra
    ? (payload.category.normalBalance === 'debit' ? 'credit' : 'debit')
    : payload.category.normalBalance

  const { data, docNo, error: insertError } = await insertWithDocRetry<{ code: string }>(
    async () => {
      const { data: existing } = await supabase.from('accounts').select('*')
      return String(nextAccountCode(payload.category, (existing ?? []) as GLAccount[]))
    },
    async (code) => supabase
      .from('accounts')
      .insert({
        code,
        name: payload.name,
        class: payload.category.class,
        section: payload.category.section,
        subsection: payload.category.subsection,
        normal_balance: normalBalance,
        is_contra: payload.isContra,
        is_active: true,
      })
      .select('code')
      .single(),
  )

  loading.value = false
  if (insertError || !data || !docNo) {
    handleError(insertError, 'Failed to create account.')
    toast.error(insertError?.message || 'Failed to create account.')
    return { success: false }
  }
  toast.success(`Account ${docNo} — ${payload.name} created.`)
  await fetchAccounts()
  return { success: true, code: docNo }
}
