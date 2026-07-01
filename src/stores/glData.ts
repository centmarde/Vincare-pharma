import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'

const toast = useToast()

// The General Ledger is its own domain, separate from financeData.ts (which
// owns the existing cash-basis reporting). gl_* RPCs are the only writers;
// this store is the only layer allowed to call them. See FINANCE_GL_PLAN.md.

export type GLAccount = {
  code: string
  name: string
  class: 'asset' | 'liability' | 'equity' | 'revenue' | 'cost' | 'expense'
  section: 'income_statement' | 'balance_sheet'
  subsection: string
  normal_balance: 'debit' | 'credit'
  is_contra: boolean
  is_active: boolean
}

export type JournalLineInput = {
  account_code: string
  debit: number
  credit: number
  memo?: string
}

export type JournalEntryLine = {
  id: number
  account_code: string
  account_name?: string | null
  debit: number
  credit: number
  line_memo: string | null
}

export type ReferenceType =
  | 'sales_invoice' | 'sales_return' | 'payment' | 'collection' | 'purchase_invoice'
  | 'disbursement' | 'pdc' | 'payroll' | 'accrual' | 'depreciation' | 'loan'
  | 'bank_recon' | 'manual' | 'closing'

export type JournalEntry = {
  id: number
  entry_no: string | null
  entry_date: string
  reference_type: ReferenceType
  reference_id: number | null
  description: string | null
  status: 'draft' | 'posted' | 'reversed'
  reverses_entry: number | null
  posted_at: string | null
  posted_by: string | null
  created_by: string | null
  created_at: string
  lines?: JournalEntryLine[]
}

export type TrialBalanceRow = {
  account_code: string
  account_name: string
  class: string
  debit_balance: number
  credit_balance: number
}

export type StatementAccountRow = { code: string; name: string; amount: number }
export type IncomeStatementSection = { subsection: string; accounts: StatementAccountRow[]; subtotal: number }
export type IncomeStatement = {
  from: string
  to: string
  sections: IncomeStatementSection[]
  netSales: number
  cogs: number
  grossProfit: number
  sellingExpenses: number
  adminExpenses: number
  operatingIncome: number
  otherIncome: number
  financeCosts: number
  netIncome: number
}

export type BalanceSheetSection = { class: string; subsection: string; accounts: StatementAccountRow[]; subtotal: number }
export type BalanceSheet = {
  asOf: string
  sections: BalanceSheetSection[]
  currentYearEarnings: number
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  tiesOut: boolean
}

function mapEntryRow(row: any): JournalEntry {
  return {
    id: row.id,
    entry_no: row.entry_no,
    entry_date: row.entry_date,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    description: row.description,
    status: row.status,
    reverses_entry: row.reverses_entry,
    posted_at: row.posted_at,
    posted_by: row.posted_by,
    created_by: row.created_by,
    created_at: row.created_at,
    lines: (row.journal_entry_lines ?? []).map((l: any) => ({
      id: l.id,
      account_code: l.account_code,
      account_name: l.account?.name ?? null,
      debit: l.debit,
      credit: l.credit,
      line_memo: l.line_memo,
    })),
  }
}

export const useGLDataStore = defineStore('glData', () => {
  const authStore = useAuthUserStore()

  const accounts: Ref<GLAccount[]> = ref([])
  const journal: Ref<JournalEntry[]> = ref([])
  const trialBalance: Ref<TrialBalanceRow[]> = ref([])
  const incomeStatement: Ref<IncomeStatement | null> = ref(null)
  const balanceSheet: Ref<BalanceSheet | null> = ref(null)

  const loading = ref(false)
  const error: Ref<string> = ref('')

  const handleError = (err: unknown, msg: string) => { error.value = err instanceof Error ? err.message : msg }
  const clearError = () => { error.value = '' }

  const fetchAccounts = async () => {
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

  const fetchJournal = async (options: { from?: string; to?: string; referenceType?: ReferenceType } = {}) => {
    loading.value = true
    clearError()
    try {
      let q = supabase.from('journal_entries')
        .select('*, journal_entry_lines(id, account_code, debit, credit, line_memo, account:account_code(name))')
      if (options.from) q = q.gte('entry_date', options.from)
      if (options.to) q = q.lte('entry_date', options.to)
      if (options.referenceType) q = q.eq('reference_type', options.referenceType)
      q = q.order('entry_date', { ascending: false }).order('id', { ascending: false })

      const { data, error: e } = await q
      if (e) throw e
      journal.value = (data || []).map(mapEntryRow)
      return journal.value
    } catch (err) {
      handleError(err, 'Failed to fetch journal')
      return []
    } finally {
      loading.value = false
    }
  }

  // Draft manual entry — requires a separate approval before it posts to the
  // ledger (manager-approval requirement from the accounting directive).
  const postManualEntry = async (payload: { entryDate: string; description?: string; lines: JournalLineInput[] }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: entryId, error: rpcError } = await supabase.rpc('gl_post_manual_entry', {
      p_entry_date: payload.entryDate,
      p_description: payload.description ?? null,
      p_lines: payload.lines,
      p_user: user.id,
    })
    if (rpcError || !entryId) {
      handleError(rpcError, 'Failed to post manual entry.')
      toast.error(rpcError?.message || 'Failed to post manual entry.')
      loading.value = false
      return { success: false }
    }
    toast.success('Manual entry drafted — awaiting approval.')
    loading.value = false
    return { success: true, entryId }
  }

  const approveManualEntry = async (entryId: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { error: rpcError } = await supabase.rpc('gl_approve_manual_entry', { p_entry_id: entryId, p_user: user.id })
    if (rpcError) {
      handleError(rpcError, 'Failed to approve entry.')
      toast.error(rpcError.message || 'Failed to approve entry.')
      loading.value = false
      return { success: false }
    }
    toast.success('Entry approved and posted.')
    loading.value = false
    return { success: true }
  }

  const reverseEntry = async (entryId: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: reversalId, error: rpcError } = await supabase.rpc('gl_reverse_entry', {
      p_entry_id: entryId, p_user: user.id,
    })
    if (rpcError || !reversalId) {
      handleError(rpcError, 'Failed to reverse entry.')
      toast.error(rpcError?.message || 'Failed to reverse entry.')
      loading.value = false
      return { success: false }
    }
    toast.success('Entry reversed.')
    loading.value = false
    return { success: true, reversalId }
  }

  // Catch up the ledger on any operational events not yet booked. Cheap and
  // idempotent (keyed on reference_type+reference_id) — safe to call before
  // every statement render, mirroring fetchPnL's backfill-then-read pattern.
  const projectEvents = async (options: { from?: string; to?: string } = {}) => {
    const { data, error: e } = await supabase.rpc('gl_project_events', {
      p_date_from: options.from ?? null,
      p_date_to: options.to ?? null,
    })
    if (e) { handleError(e, 'Failed to sync ledger'); return 0 }
    return (data as number) ?? 0
  }

  const fetchTrialBalance = async (asOf?: string) => {
    loading.value = true
    clearError()
    try {
      await projectEvents({ to: asOf })
      const { data, error: e } = await supabase.rpc('gl_trial_balance', { p_as_of: asOf ?? null })
      if (e) throw e
      trialBalance.value = (data || []) as TrialBalanceRow[]
      return trialBalance.value
    } catch (err) {
      handleError(err, 'Failed to compute trial balance')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchIncomeStatement = async (from?: string, to?: string) => {
    loading.value = true
    clearError()
    try {
      await projectEvents({ from, to })
      const { data, error: e } = await supabase.rpc('gl_income_statement', {
        p_from: from ?? null, p_to: to ?? null,
      })
      if (e) throw e
      incomeStatement.value = data as IncomeStatement
      return incomeStatement.value
    } catch (err) {
      handleError(err, 'Failed to compute income statement')
      return null
    } finally {
      loading.value = false
    }
  }

  const fetchBalanceSheet = async (asOf?: string) => {
    loading.value = true
    clearError()
    try {
      await projectEvents({ to: asOf })
      const { data, error: e } = await supabase.rpc('gl_balance_sheet', { p_as_of: asOf ?? null })
      if (e) throw e
      balanceSheet.value = data as BalanceSheet
      return balanceSheet.value
    } catch (err) {
      handleError(err, 'Failed to compute balance sheet')
      return null
    } finally {
      loading.value = false
    }
  }

  const resetStore = () => {
    accounts.value = []
    journal.value = []
    trialBalance.value = []
    incomeStatement.value = null
    balanceSheet.value = null
    loading.value = false
    error.value = ''
  }

  return {
    accounts, journal, trialBalance, incomeStatement, balanceSheet, loading, error,
    fetchAccounts, fetchJournal, postManualEntry, approveManualEntry, reverseEntry,
    projectEvents, fetchTrialBalance, fetchIncomeStatement, fetchBalanceSheet,
    clearError, resetStore,
  }
})
