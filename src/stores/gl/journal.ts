// Journal entries: posting (system and manual drafts), approval, reversal,
// the per-account ledger drill-down, and the projection of operational
// documents into the ledger.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { nextDocNumber, insertWithDocRetry } from '@/utils/helpers'
import type { AccountLedgerLine, GLAccount, JournalEntry, JournalLineInput, ReferenceType } from './types'
import { mapEntryRow } from './helpers'
import { journal, loading, handleError, clearError } from './state'

const toast = useToast()

// Resolved lazily rather than at import time: a store factory called while
// this module is first evaluated can run before Pinia is installed.
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())

// Post a balanced journal entry: >=2 lines, each one-sided, sum(debit) =
// sum(credit), every account_code active — was gl_post_entry. Shared by this
// store's own projectEvents (was gl_project_events) and financeData.ts's
// createCashAccount (was cash_account_open, which posts the opening entry).
// The validation below runs before any insert, so a failed check never
// touches the DB; a failure after the header insert (e.g. the lines insert)
// can still leave an entry with partial/no lines — accepted trade-off,
// JS-over-RPC convention. The DB's own balanced-entry/one-sided CHECK
// constraints remain as a safety net regardless.
export async function postJournalEntry(
  entryDate: string,
  referenceType: ReferenceType,
  referenceId: number | null,
  description: string | null,
  lines: JournalLineInput[],
  userId: string | null,
): Promise<{ success: boolean; entryId?: number; error?: string }> {
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

export async function fetchJournal(options: { from?: string; to?: string; referenceType?: ReferenceType } = {}) {
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

/**
 * Every movement through one account, oldest first, with a running balance.
 *
 * Counts entries with status 'posted' OR 'reversed', never 'posted' alone: a
 * reversal leaves the original in the ledger flipped to 'reversed' AND posts
 * an offsetting entry, so both have to count for the pair to net to zero.
 * Filtering to 'posted' would drop the original and leave the account at
 * NEGATIVE it. Drafts stay out — they are not in the ledger yet.
 *
 * The closing balance is the last line's runningBalance, so the total the
 * drill-down shows is always the sum of the lines it is showing.
 */
export async function fetchAccountLedger(code: string, normalBalance: GLAccount['normal_balance']) {
  loading.value = true
  clearError()
  try {
    // Paged deliberately. PostgREST caps a response (1000 rows by default),
    // and a truncated ledger would not error -- it would render a partial
    // history AND a wrong closing balance, since the balance is accumulated
    // from these rows. A busy control account like 1030 will cross that.
    const PAGE = 1000
    const data: unknown[] = []
    for (let from = 0; ; from += PAGE) {
      const { data: page, error: e } = await supabase
        .from('journal_entry_lines')
        .select('id, debit, credit, line_memo, entry:journal_entry_id(entry_no, entry_date, status, reference_type, description)')
        .eq('account_code', code)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (e) throw e
      data.push(...(page ?? []))
      if (!page || page.length < PAGE) break
    }

    const rows = (data ?? [])
      .map((l: any) => ({
        id: l.id as number,
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
        line_memo: (l.line_memo ?? null) as string | null,
        entry_no: (l.entry?.entry_no ?? null) as string | null,
        entry_date: (l.entry?.entry_date ?? '') as string,
        status: l.entry?.status as JournalEntry['status'],
        reference_type: l.entry?.reference_type as ReferenceType,
        description: (l.entry?.description ?? null) as string | null,
      }))
      .filter((l) => l.status === 'posted' || l.status === 'reversed')
      // Oldest first so the running balance accumulates in reading order.
      // Sorted here rather than in the query: entry_date lives on the embedded
      // parent, which PostgREST cannot order a child-table select by.
      .sort((a, b) => (a.entry_date === b.entry_date ? a.id - b.id : a.entry_date.localeCompare(b.entry_date)))

    let balance = 0
    return rows.map<AccountLedgerLine>((l) => {
      balance += normalBalance === 'debit' ? l.debit - l.credit : l.credit - l.debit
      return { ...l, runningBalance: balance }
    })
  } catch (err) {
    handleError(err, 'Failed to load the account ledger')
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
export async function postManualEntry(payload: { entryDate: string; description?: string; lines: JournalLineInput[] }) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
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
export async function approveManualEntry(entryId: number) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
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
export async function reverseJournalEntry(
  entryId: number,
  userId: string | null,
  overrideReferenceType?: ReferenceType,
  overrideReferenceId?: number,
): Promise<{ success: boolean; reversalId?: number; error?: string }> {
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

/**
 * Whether reversing this entry leaves its source document out of step.
 *
 * Reversing in the General Journal touches the LEDGER ONLY. If the entry was
 * projected from a real document, that document keeps its status and any
 * cash it moved stays moved — so the ledger says it never happened while the
 * register and the cash balance say it did. That is exactly how a voided
 * supplier payment left 610 missing from a cash account.
 *
 * Returns null when there is nothing to warn about: manual and closing
 * entries have no source document, and a document already voided is in step
 * with the reversal rather than out of it.
 */
export async function describeReversalImpact(entry: JournalEntry) {
  if (!entry.reference_id) return null
  if (entry.reference_type === 'manual' || entry.reference_type === 'closing') return null

  const { data, error: lookupError } = await supabase
    .from('transactions')
    .select('id, status, transaction_type, reference_no, expense_no, sale_no, remittance_no')
    .eq('id', entry.reference_id)
    .maybeSingle()
  if (lookupError || !data) return null
  if (data.status === 'voided' || data.status === 'cancelled') return null

  const docNo = data.reference_no ?? data.expense_no ?? data.sale_no ?? data.remittance_no
    ?? `#${data.id}`
  return { docNo, status: data.status as string, transactionType: data.transaction_type as string }
}

export async function reverseEntry(entryId: number) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
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
export async function projectEvents(options: { from?: string; to?: string } = {}): Promise<number> {
  const { data, error: e } = await supabase.rpc('gl_project_events', {
    p_from: options.from ?? undefined,
    p_to: options.to ?? undefined,
  })
  if (e) throw e
  return (data as number) ?? 0
}
