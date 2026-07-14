import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { nextDocNumber, insertWithDocRetry } from '@/utils/helpers'

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

// The account-code scheme (see CLAUDE.md's "ACCOUNT-CODE SCHEME") — one
// numeric range per category. New accounts get the next free code within
// their chosen category's range (existing max + 10), so the accountant only
// ever picks WHERE a new line belongs; the code itself is derived, never typed.
export type AccountCategoryKey =
  | 'assets_current' | 'assets_noncurrent'
  | 'liabilities_current' | 'liabilities_noncurrent'
  | 'equity' | 'revenue' | 'cost_of_sales'
  | 'selling_expenses' | 'admin_expenses' | 'finance_costs'

export type AccountCategory = {
  key: AccountCategoryKey
  label: string
  floor: number
  ceiling: number
  class: GLAccount['class']
  section: GLAccount['section']
  subsection: string
  normalBalance: GLAccount['normal_balance']
}

export const ACCOUNT_CATEGORIES: AccountCategory[] = [
  { key: 'assets_current', label: 'Assets — Current (1000–1499)', floor: 1000, ceiling: 1499, class: 'asset', section: 'balance_sheet', subsection: 'Current Assets', normalBalance: 'debit' },
  { key: 'assets_noncurrent', label: 'Assets — Non-Current / PPE (1500–1999)', floor: 1500, ceiling: 1999, class: 'asset', section: 'balance_sheet', subsection: 'Non-Current Assets', normalBalance: 'debit' },
  { key: 'liabilities_current', label: 'Liabilities — Current (2000–2499)', floor: 2000, ceiling: 2499, class: 'liability', section: 'balance_sheet', subsection: 'Current Liabilities', normalBalance: 'credit' },
  { key: 'liabilities_noncurrent', label: 'Liabilities — Non-Current (2500–2999)', floor: 2500, ceiling: 2999, class: 'liability', section: 'balance_sheet', subsection: 'Non-Current Liabilities', normalBalance: 'credit' },
  { key: 'equity', label: 'Equity (3000–3999)', floor: 3000, ceiling: 3999, class: 'equity', section: 'balance_sheet', subsection: 'Equity', normalBalance: 'credit' },
  { key: 'revenue', label: 'Revenue (4000–4999)', floor: 4000, ceiling: 4999, class: 'revenue', section: 'income_statement', subsection: 'Revenue', normalBalance: 'credit' },
  { key: 'cost_of_sales', label: 'Cost of Sales (5000–5999)', floor: 5000, ceiling: 5999, class: 'cost', section: 'income_statement', subsection: 'Cost of Sales', normalBalance: 'debit' },
  { key: 'selling_expenses', label: 'Selling Expenses (6000–6999)', floor: 6000, ceiling: 6999, class: 'expense', section: 'income_statement', subsection: 'Selling Expenses', normalBalance: 'debit' },
  { key: 'admin_expenses', label: 'Administrative & Operating Expenses (7000–7999)', floor: 7000, ceiling: 7999, class: 'expense', section: 'income_statement', subsection: 'Administrative & Operating Expenses', normalBalance: 'debit' },
  { key: 'finance_costs', label: 'Finance Costs (8000–8999)', floor: 8000, ceiling: 8999, class: 'expense', section: 'income_statement', subsection: 'Finance Costs', normalBalance: 'debit' },
]

// Numeric max within the category's range, +10 — never lexical (same bug class
// documented elsewhere in this file's doc-number helpers: codes are zero-width
// strings, so string sort would break once a range needs a 5th digit).
export function nextAccountCode(category: AccountCategory, existing: GLAccount[]): number {
  const codesInRange = existing
    .map((a) => parseInt(a.code, 10))
    .filter((n) => !isNaN(n) && n >= category.floor && n <= category.ceiling)
  const max = codesInRange.length ? Math.max(...codesInRange) : category.floor
  return codesInRange.length ? max + 10 : category.floor + 10
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

  // The accountant only picks WHERE (category) + a name; the code is derived
  // (next free slot in that category's range) and never typed. `code` is the
  // primary key, so a same-instant collision is a safe-fail 23505 — retried
  // via a fresh re-scan of the whole (tiny) chart, same convention as every
  // other doc-number generator in this app.
  const createAccount = async (payload: { category: AccountCategory; name: string; isContra: boolean }) => {
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

  // Post a balanced journal entry: >=2 lines, each one-sided, sum(debit) =
  // sum(credit), every account_code active — was gl_post_entry. Shared by this
  // store's own projectEvents (was gl_project_events) and financeData.ts's
  // createCashAccount (was cash_account_open, which posts the opening entry).
  // The validation below runs before any insert, so a failed check never
  // touches the DB; a failure after the header insert (e.g. the lines insert)
  // can still leave an entry with partial/no lines — accepted trade-off,
  // JS-over-RPC convention. The DB's own balanced-entry/one-sided CHECK
  // constraints remain as a safety net regardless.
  const postJournalEntry = async (
    entryDate: string,
    referenceType: ReferenceType,
    referenceId: number | null,
    description: string | null,
    lines: JournalLineInput[],
    userId: string | null,
  ): Promise<{ success: boolean; entryId?: number; error?: string }> => {
    if (!lines || lines.length < 2) {
      return { success: false, error: 'A journal entry needs at least 2 lines' }
    }
    let sumDebit = 0
    let sumCredit = 0
    for (const line of lines) {
      const debit = line.debit ?? 0
      const credit = line.credit ?? 0
      if (debit < 0 || credit < 0) return { success: false, error: 'Journal line amounts cannot be negative' }
      if (debit > 0 && credit > 0) return { success: false, error: 'Journal line must be one-sided (debit XOR credit), not both' }
      if (debit === 0 && credit === 0) return { success: false, error: 'Journal line must have a non-zero debit or credit' }
      const { data: account } = await supabase.from('accounts').select('code').eq('code', line.account_code).eq('is_active', true).maybeSingle()
      if (!account) return { success: false, error: `Unknown or inactive account_code: ${line.account_code}` }
      sumDebit += debit
      sumCredit += credit
    }
    if (Math.abs(sumDebit - sumCredit) > 0.01) {
      return { success: false, error: `Entry not balanced: debits ${sumDebit} <> credits ${sumCredit}` }
    }

    const year = new Date().getFullYear().toString()
    const nowIso = new Date().toISOString()
    const { data: entry, error: entryError } = await insertWithDocRetry<{ id: number }>(
      async () => {
        const { data: existingEntries } = await supabase
          .from('journal_entries')
          .select('entry_no')
          .like('entry_no', `JE-${year}-%`)
        return nextDocNumber((existingEntries ?? []).map(r => r.entry_no), `JE-${year}-`, 5)
      },
      async (docNo) => supabase
        .from('journal_entries')
        .insert({
          entry_no: docNo, entry_date: entryDate, reference_type: referenceType, reference_id: referenceId,
          description, status: 'posted', posted_at: nowIso, posted_by: userId, created_by: userId,
        })
        .select('id')
        .single(),
    )
    if (entryError || !entry) return { success: false, error: entryError?.message || 'Failed to post journal entry' }

    const { error: linesError } = await supabase.from('journal_entry_lines').insert(
      lines.map(l => ({ journal_entry_id: entry.id, account_code: l.account_code, debit: l.debit ?? 0, credit: l.credit ?? 0, line_memo: l.memo ?? null })),
    )
    if (linesError) return { success: false, error: linesError.message, entryId: entry.id }

    return { success: true, entryId: entry.id }
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
  // ledger (manager-approval requirement from the accounting directive). Was
  // gl_post_manual_entry. Inserting a fresh 'draft' row never touches the
  // immutability trigger (it only blocks updates where the OLD status is
  // already 'posted'), so — unlike reverseEntry below — this is safe to do as
  // plain sequential JS calls. The balance/one-sidedness/account-existence
  // checks below run before any insert, so a validation failure never touches
  // the DB; a failure after the header insert (the lines insert) can still
  // leave an entry with partial/no lines (accepted trade-off, JS-over-RPC
  // convention). The DB's own CHECK constraints remain as a safety net.
  const postManualEntry = async (payload: { entryDate: string; description?: string; lines: JournalLineInput[] }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    if (!payload.lines || payload.lines.length < 2) {
      toast.error('A journal entry needs at least 2 lines.'); loading.value = false; return { success: false }
    }
    let sumDebit = 0
    let sumCredit = 0
    for (const line of payload.lines) {
      const debit = line.debit ?? 0
      const credit = line.credit ?? 0
      if (debit < 0 || credit < 0) {
        toast.error('Journal line amounts cannot be negative.'); loading.value = false; return { success: false }
      }
      if (debit > 0 && credit > 0) {
        toast.error('Journal line must be one-sided (debit XOR credit), not both.'); loading.value = false; return { success: false }
      }
      if (debit === 0 && credit === 0) {
        toast.error('Journal line must have a non-zero debit or credit.'); loading.value = false; return { success: false }
      }
      const { data: account } = await supabase.from('accounts').select('code').eq('code', line.account_code).eq('is_active', true).maybeSingle()
      if (!account) {
        toast.error(`Unknown or inactive account_code: ${line.account_code}`); loading.value = false; return { success: false }
      }
      sumDebit += debit
      sumCredit += credit
    }
    if (Math.abs(sumDebit - sumCredit) > 0.01) {
      toast.error(`Entry not balanced: debits ${sumDebit} <> credits ${sumCredit}`); loading.value = false; return { success: false }
    }

    const year = new Date().getFullYear().toString()
    const { data: entry, error: entryError } = await insertWithDocRetry<{ id: number }>(
      async () => {
        const { data: existingEntries } = await supabase
          .from('journal_entries')
          .select('entry_no')
          .like('entry_no', `JE-${year}-%`)
        return nextDocNumber((existingEntries ?? []).map(r => r.entry_no), `JE-${year}-`, 5)
      },
      async (docNo) => supabase
        .from('journal_entries')
        .insert({
          entry_no: docNo, entry_date: payload.entryDate, reference_type: 'manual', reference_id: null,
          description: payload.description || null, status: 'draft', created_by: user.id,
        })
        .select('id')
        .single(),
    )
    if (entryError || !entry) {
      handleError(entryError, 'Failed to post manual entry.')
      toast.error(entryError?.message || 'Failed to post manual entry.')
      loading.value = false
      return { success: false }
    }

    const { error: linesError } = await supabase.from('journal_entry_lines').insert(
      payload.lines.map(l => ({ journal_entry_id: entry.id, account_code: l.account_code, debit: l.debit ?? 0, credit: l.credit ?? 0, line_memo: l.memo ?? null })),
    )
    if (linesError) {
      handleError(linesError, 'Failed to save entry lines.')
      toast.error(linesError.message || 'Failed to save entry lines.')
      loading.value = false
      return { success: false }
    }

    toast.success('Manual entry drafted — awaiting approval.')
    loading.value = false
    return { success: true, entryId: entry.id }
  }

  // Draft→posted status flip — done in JS per the "no RPC under ~10 round-trips"
  // convention (was gl_approve_manual_entry, no balance re-check in SQL). The
  // .eq('status','draft').eq('reference_type','manual') guards reproduce the RPC's
  // validation and mean an already-posted entry is a no-op. Immutability is now
  // enforced here in JS only — the DB guard trigger/function were dropped
  // (20260704000003) so this is the sole gate keeping posted entries unedited.
  const approveManualEntry = async (entryId: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: updated, error: updateError } = await supabase
      .from('journal_entries')
      .update({ status: 'posted', posted_at: new Date().toISOString(), posted_by: user.id })
      .eq('id', entryId)
      .eq('reference_type', 'manual')
      .eq('status', 'draft')
      .select('id')

    if (updateError) {
      handleError(updateError, 'Failed to approve entry.')
      toast.error(updateError.message || 'Failed to approve entry.')
      loading.value = false
      return { success: false }
    }
    if (!updated || updated.length === 0) {
      toast.error('Entry is not a pending manual draft.')
      loading.value = false
      return { success: false }
    }
    toast.success('Entry approved and posted.')
    loading.value = false
    return { success: true }
  }

  // Was gl_reverse_entry. Immutability used to be a DB trigger, so flipping a
  // posted row's status needed either a SECURITY DEFINER RPC or a
  // transaction-scoped session GUC to satisfy the guard. That guard
  // (gl_guard_posted_immutable + its two triggers) was dropped in
  // 20260704000003 — the DB no longer blocks the update, and the invariant
  // "only posted->reversed, and never edit a posted entry's content" is
  // enforced entirely by the checks in this function (status must be 'posted',
  // no duplicate reversal, .eq('status','posted') on the flip).
  // Best-effort, not atomic: a failure after the reversal entry+lines insert
  // but before the original's status flip can leave a posted reversal
  // pointing at an original that's still 'posted' (accepted trade-off,
  // JS-over-RPC convention) — the caller should retry the flip if this
  // happens, since re-running reverseJournalEntry would otherwise create a
  // duplicate reversal (guarded against by the reverses_entry check below).
  const reverseJournalEntry = async (
    entryId: number,
    userId: string | null,
    overrideReferenceType?: ReferenceType,
    overrideReferenceId?: number,
  ): Promise<{ success: boolean; reversalId?: number; error?: string }> => {
    const { data: original, error: fetchError } = await supabase
      .from('journal_entries')
      .select('id, entry_no, status, reference_type, reference_id, description')
      .eq('id', entryId)
      .maybeSingle()
    if (fetchError || !original) return { success: false, error: `Journal entry ${entryId} not found` }
    if (original.status !== 'posted') {
      return { success: false, error: `Only posted entries can be reversed (entry ${entryId} is ${original.status})` }
    }

    const { count: alreadyReversedCount } = await supabase
      .from('journal_entries').select('id', { count: 'exact', head: true }).eq('reverses_entry', entryId)
    if ((alreadyReversedCount ?? 0) > 0) {
      return { success: false, error: `Entry ${entryId} has already been reversed` }
    }

    const { data: originalLines } = await supabase
      .from('journal_entry_lines').select('account_code, debit, credit, line_memo').eq('journal_entry_id', entryId)

    const year = new Date().getFullYear().toString()
    const nowIso = new Date().toISOString()
    const { data: reversal, error: reversalError } = await insertWithDocRetry<{ id: number }>(
      async () => {
        const { data: existingEntries } = await supabase
          .from('journal_entries').select('entry_no').like('entry_no', `JE-${year}-%`)
        return nextDocNumber((existingEntries ?? []).map(r => r.entry_no), `JE-${year}-`, 5)
      },
      async (docNo) => supabase
        .from('journal_entries')
        .insert({
          entry_no: docNo, entry_date: new Date().toISOString().slice(0, 10),
          reference_type: overrideReferenceType ?? original.reference_type,
          reference_id: overrideReferenceId ?? original.reference_id,
          description: `Reversal of ${original.entry_no}${original.description ? ' — ' + original.description : ''}`,
          status: 'posted', reverses_entry: entryId, posted_at: nowIso, posted_by: userId, created_by: userId,
        })
        .select('id')
        .single(),
    )
    if (reversalError || !reversal) return { success: false, error: reversalError?.message || 'Failed to create reversal entry' }

    const { error: linesError } = await supabase.from('journal_entry_lines').insert(
      (originalLines ?? []).map(l => ({
        journal_entry_id: reversal.id, account_code: l.account_code, debit: l.credit ?? 0, credit: l.debit ?? 0, line_memo: l.line_memo,
      })),
    )
    if (linesError) return { success: false, error: linesError.message, reversalId: reversal.id }

    const { error: statusError } = await supabase
      .from('journal_entries').update({ status: 'reversed' }).eq('id', entryId).eq('status', 'posted')
    if (statusError) return { success: false, error: statusError.message, reversalId: reversal.id }

    return { success: true, reversalId: reversal.id }
  }

  const reverseEntry = async (entryId: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const result = await reverseJournalEntry(entryId, user.id)
    if (!result.success) {
      handleError(result.error, 'Failed to reverse entry.')
      toast.error(result.error || 'Failed to reverse entry.')
      loading.value = false
      return { success: false }
    }
    toast.success('Entry reversed.')
    loading.value = false
    return { success: true, reversalId: result.reversalId }
  }

  // Catch up the ledger on any operational events not yet booked. Now a thin
  // wrapper over the gl_project_events RPC (2026-07-07): the whole per-event-type
  // catch-up runs in ONE SECURITY DEFINER call instead of ~10 queries + a
  // sumCost/post write-set per row. Kept as a public store action because the
  // General Journal page calls it directly before listing entries; the three
  // statement RPCs also project internally, so fetchTrialBalance/IncomeStatement/
  // BalanceSheet no longer call this separately. Returns the count posted.
  const projectEvents = async (options: { from?: string; to?: string } = {}): Promise<number> => {
    const { data, error: e } = await supabase.rpc('gl_project_events', {
      p_from: options.from ?? undefined,
      p_to: options.to ?? undefined,
    })
    if (e) throw e
    return (data as number) ?? 0
  }

  // The three statements are now single SECURITY DEFINER RPC calls (2026-07-07):
  // each RPC runs gl_project_events internally then computes the statement in
  // one round-trip, replacing ~30–50 client queries per page. The returned jsonb
  // is shaped to match the view-model types, so no mapping is needed.
  const fetchTrialBalance = async (asOf?: string) => {
    loading.value = true
    clearError()
    try {
      const { data, error: e } = await supabase.rpc('gl_trial_balance', { p_as_of: asOf ?? undefined })
      if (e) throw e
      trialBalance.value = (data as TrialBalanceRow[]) ?? []
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
      const { data, error: e } = await supabase.rpc('gl_income_statement', { p_from: from ?? undefined, p_to: to ?? undefined })
      if (e) throw e
      incomeStatement.value = (data as IncomeStatement) ?? null
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
      const { data, error: e } = await supabase.rpc('gl_balance_sheet', { p_as_of: asOf ?? undefined })
      if (e) throw e
      balanceSheet.value = (data as BalanceSheet) ?? null
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
    fetchAccounts, createAccount, fetchJournal, postJournalEntry, postManualEntry, approveManualEntry, reverseEntry,
    projectEvents, fetchTrialBalance, fetchIncomeStatement, fetchBalanceSheet,
    clearError, resetStore,
  }
})
