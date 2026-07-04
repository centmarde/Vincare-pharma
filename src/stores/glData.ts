import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { nextDocNumber } from '@/utils/helpers'

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
    const { data: existingEntries } = await supabase
      .from('journal_entries')
      .select('entry_no')
      .like('entry_no', `JE-${year}-%`)
    const entryNo = nextDocNumber((existingEntries ?? []).map(r => r.entry_no), `JE-${year}-`, 5)

    const nowIso = new Date().toISOString()
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        entry_no: entryNo, entry_date: entryDate, reference_type: referenceType, reference_id: referenceId,
        description, status: 'posted', posted_at: nowIso, posted_by: userId, created_by: userId,
      })
      .select('id')
      .single()
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
    const { data: existingEntries } = await supabase
      .from('journal_entries')
      .select('entry_no')
      .like('entry_no', `JE-${year}-%`)
    const entryNo = nextDocNumber((existingEntries ?? []).map(r => r.entry_no), `JE-${year}-`, 5)

    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        entry_no: entryNo, entry_date: payload.entryDate, reference_type: 'manual', reference_id: null,
        description: payload.description || null, status: 'draft', created_by: user.id,
      })
      .select('id')
      .single()
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
  // validation and mean an already-posted entry is a no-op (the GL immutability
  // trigger only blocks updating rows whose OLD status is already 'posted').
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

  // Was gl_reverse_entry. Previously kept as an RPC because flipping a posted
  // row's status was blocked by the immutability trigger unless a
  // transaction-scoped session GUC was set in the same statement — impossible
  // across separate sequential JS/PostgREST calls. Migration
  // 20260704000000_gl_reverse_entry_to_js.sql replaced that GUC escape hatch
  // with a narrow, hardcoded trigger exception that allows ONLY the exact
  // transition status:'posted'->'reversed' with no other column changed
  // (every other mutation to a posted row is still blocked, same as before).
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
    const { data: existingEntries } = await supabase
      .from('journal_entries').select('entry_no').like('entry_no', `JE-${year}-%`)
    const entryNo = nextDocNumber((existingEntries ?? []).map(r => r.entry_no), `JE-${year}-`, 5)

    const nowIso = new Date().toISOString()
    const { data: reversal, error: reversalError } = await supabase
      .from('journal_entries')
      .insert({
        entry_no: entryNo, entry_date: new Date().toISOString().slice(0, 10),
        reference_type: overrideReferenceType ?? original.reference_type,
        reference_id: overrideReferenceId ?? original.reference_id,
        description: `Reversal of ${original.entry_no}${original.description ? ' — ' + original.description : ''}`,
        status: 'posted', reverses_entry: entryId, posted_at: nowIso, posted_by: userId, created_by: userId,
      })
      .select('id')
      .single()
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

  const EXPENSE_CATEGORY_ACCOUNTS: Record<string, string> = {
    rent: '7130', utilities: '7270', supplies: '7080', maintenance: '7150', transportation: '7250',
    taxes_fees: '7240', taxes_licenses: '7240', representation: '6040', fuel_lubricants: '7050',
    labor_services: '7070', freight_handling: '5030',
  }

  // Catch up the ledger on any operational events not yet booked. Cheap and
  // idempotent (keyed on reference_type+reference_id) — safe to call before
  // every statement render, mirroring fetchPnL's backfill-then-read pattern.
  // Was gl_project_events. A per-event-type loop over every unposted
  // transaction, each isolated in its own try/catch so one bad row doesn't
  // stop the rest (mirrors the RPC's per-row `exception when others` blocks).
  // The two reversal cases (POS void, Ethical cancellation) still go through
  // the gl_reverse_entry RPC — see reverseEntry above for why that one can't
  // move to JS.
  const projectEvents = async (options: { from?: string; to?: string } = {}) => {
    const from = options.from ?? '1970-01-01'
    const to = options.to ?? new Date().toISOString().slice(0, 10)
    const fromTs = `${from}T00:00:00`
    const toTs = `${to}T23:59:59.999`
    let posted = 0

    // Existing (entry_type, entry_id) pairs, regardless of status — mirrors
    // the RPC's status-agnostic `not exists` idempotency guard.
    const { data: existingRefs } = await supabase.from('journal_entries').select('reference_type, reference_id')
    const postedKeys = new Set((existingRefs ?? []).map(r => `${r.reference_type}:${r.reference_id}`))
    const isPosted = (refType: string, refId: number) => postedKeys.has(`${refType}:${refId}`)
    const markPosted = (refType: string, refId: number) => postedKeys.add(`${refType}:${refId}`)

    // Line values (qty/delivered_qty/cost_price) live in the 1:1
    // transaction_item_details extension table now.
    const sumCost = async (transactionId: number, qtyField: 'qty' | 'delivered_qty', costField?: 'cost_price') => {
      const { data: items } = await supabase
        .from('transaction_items')
        .select('transaction_item_details(qty, delivered_qty, cost_price), product:product_id(cost_price)')
        .eq('transaction_id', transactionId)
      return (items ?? []).reduce((sum: number, i: any) => {
        const d = i.transaction_item_details ?? {}
        const qty = d[qtyField] ?? 0
        const cost = (costField ? d[costField] : null) ?? i.product?.cost_price ?? 0
        return sum + qty * cost
      }, 0)
    }

    // ── POS sale (completed, not voided) ────────────────────────────────────
    const { data: posSales } = await supabase
      .from('transactions')
      .select('id, created_at, total_amount, pos_sale_details(payment_method, voided_at)')
      .eq('transaction_type', 'sale').eq('status', 'completed')
      .gte('created_at', fromTs).lte('created_at', toTs)
    for (const sale of posSales ?? []) {
      const details = sale.pos_sale_details as unknown as { payment_method: string | null; voided_at: string | null } | null
      if (details?.voided_at) continue
      if (isPosted('sales_invoice', sale.id)) continue
      try {
        const cogs = await sumCost(sale.id, 'qty')
        const cashAccount = ['cash', 'petty_cash'].includes(details?.payment_method ?? '') ? '1010' : '1020'
        const lines: JournalLineInput[] = [
          { account_code: cashAccount, debit: sale.total_amount ?? 0, credit: 0 },
          { account_code: '4010', debit: 0, credit: sale.total_amount ?? 0 },
        ]
        if (cogs > 0) lines.push({ account_code: '5010', debit: cogs, credit: 0 }, { account_code: '1040', debit: 0, credit: cogs })
        const result = await postJournalEntry(sale.created_at.slice(0, 10), 'sales_invoice', sale.id, 'POS sale', lines, null)
        if (result.success) { posted++; markPosted('sales_invoice', sale.id) }
        else console.warn(`projectEvents: skipped sale ${sale.id} (sales_invoice):`, result.error)
      } catch (err) {
        console.warn(`projectEvents: skipped sale ${sale.id} (sales_invoice):`, err)
      }
    }

    // ── POS void: reverse the sale's entry ──────────────────────────────────
    const { data: voidedSales } = await supabase
      .from('transactions')
      .select('id, pos_sale_details!inner(voided_at)')
      .eq('transaction_type', 'sale')
      .not('pos_sale_details.voided_at', 'is', null)
      .gte('pos_sale_details.voided_at', fromTs).lte('pos_sale_details.voided_at', toTs)
    for (const sale of voidedSales ?? []) {
      if (isPosted('sales_return', sale.id)) continue
      const { data: orig } = await supabase
        .from('journal_entries').select('id').eq('reference_type', 'sales_invoice').eq('reference_id', sale.id).eq('status', 'posted').maybeSingle()
      if (!orig) continue
      const result = await reverseJournalEntry(orig.id, null, 'sales_return', sale.id)
      if (result.success) { posted++; markPosted('sales_return', sale.id) }
      else console.warn(`projectEvents: skipped void reversal for sale ${sale.id}:`, result.error)
    }

    // ── Ethical order (not cancelled): DR AR / CR Revenue ───────────────────
    const { data: ethicalOrders } = await supabase
      .from('transactions')
      .select('id, created_at, total_amount, ethical_details(discount_amount, rebate_amount)')
      .eq('transaction_type', 'ethical_order').neq('status', 'cancelled')
      .gte('created_at', fromTs).lte('created_at', toTs)
    for (const order of ethicalOrders ?? []) {
      if (isPosted('sales_invoice', order.id)) continue
      try {
        const details = order.ethical_details as unknown as { discount_amount: number | null; rebate_amount: number | null } | null
        const discount = details?.discount_amount ?? 0
        const rebate = details?.rebate_amount ?? 0
        const subtotal = (order.total_amount ?? 0) + discount + rebate
        const cogs = await sumCost(order.id, 'delivered_qty')
        const lines: JournalLineInput[] = [
          { account_code: '1030', debit: order.total_amount ?? 0, credit: 0 },
          { account_code: '4010', debit: 0, credit: subtotal },
        ]
        if (rebate > 0) lines.push({ account_code: '6030', debit: rebate, credit: 0 })
        if (discount > 0) lines.push({ account_code: '6020', debit: discount, credit: 0 })
        if (cogs > 0) lines.push({ account_code: '5010', debit: cogs, credit: 0 }, { account_code: '1040', debit: 0, credit: cogs })
        const result = await postJournalEntry(order.created_at.slice(0, 10), 'sales_invoice', order.id, 'Ethical order invoice', lines, null)
        if (result.success) { posted++; markPosted('sales_invoice', order.id) }
        else console.warn(`projectEvents: skipped ethical order ${order.id} (sales_invoice):`, result.error)
      } catch (err) {
        console.warn(`projectEvents: skipped ethical order ${order.id} (sales_invoice):`, err)
      }
    }

    // ── Ethical order cancellation ───────────────────────────────────────────
    const { data: cancelledEthical } = await supabase
      .from('transactions')
      .select('id, created_at, updated_at')
      .eq('transaction_type', 'ethical_order').eq('status', 'cancelled')
    for (const order of cancelledEthical ?? []) {
      const eventAt = order.updated_at ?? order.created_at
      if (eventAt < fromTs || eventAt > toTs) continue
      if (isPosted('sales_return', order.id)) continue
      const { data: orig } = await supabase
        .from('journal_entries').select('id').eq('reference_type', 'sales_invoice').eq('reference_id', order.id).eq('status', 'posted').maybeSingle()
      if (!orig) continue
      const result = await reverseJournalEntry(orig.id, null, 'sales_return', order.id)
      if (result.success) { posted++; markPosted('sales_return', order.id) }
      else console.warn(`projectEvents: skipped cancellation reversal for ethical order ${order.id}:`, result.error)
    }

    // ── Collections: DR Cash / CR AR ─────────────────────────────────────────
    const { data: collections } = await supabase
      .from('collections').select('id, created_at, amount, payment_method')
      .gte('created_at', fromTs).lte('created_at', toTs)
    for (const c of collections ?? []) {
      if (isPosted('collection', c.id)) continue
      try {
        const cashAccount = ['cash', 'petty_cash'].includes(c.payment_method ?? '') ? '1010' : '1020'
        const lines: JournalLineInput[] = [
          { account_code: cashAccount, debit: c.amount ?? 0, credit: 0 },
          { account_code: '1030', debit: 0, credit: c.amount ?? 0 },
        ]
        const result = await postJournalEntry(c.created_at.slice(0, 10), 'collection', c.id, 'Collection received', lines, null)
        if (result.success) { posted++; markPosted('collection', c.id) }
        else console.warn(`projectEvents: skipped collection ${c.id} (collection):`, result.error)
      } catch (err) {
        console.warn(`projectEvents: skipped collection ${c.id} (collection):`, err)
      }
    }

    // ── In-house order revenue (delivered/paid): DR AR / CR Revenue ─────────
    const { data: inhouseOrders } = await supabase
      .from('transactions')
      .select('id, created_at, updated_at, total_amount')
      .eq('transaction_type', 'inhouse_order').in('status', ['delivered', 'paid'])
    for (const order of inhouseOrders ?? []) {
      const eventAt = order.updated_at ?? order.created_at
      if (eventAt < fromTs || eventAt > toTs) continue
      if (isPosted('sales_invoice', order.id)) continue
      try {
        const cogs = await sumCost(order.id, 'delivered_qty', 'cost_price')
        const lines: JournalLineInput[] = [
          { account_code: '1030', debit: order.total_amount ?? 0, credit: 0 },
          { account_code: '4010', debit: 0, credit: order.total_amount ?? 0 },
        ]
        if (cogs > 0) lines.push({ account_code: '5010', debit: cogs, credit: 0 }, { account_code: '1040', debit: 0, credit: cogs })
        const result = await postJournalEntry(eventAt.slice(0, 10), 'sales_invoice', order.id, 'In-house order delivered', lines, null)
        if (result.success) { posted++; markPosted('sales_invoice', order.id) }
        else console.warn(`projectEvents: skipped in-house order ${order.id} (sales_invoice):`, result.error)
      } catch (err) {
        console.warn(`projectEvents: skipped in-house order ${order.id} (sales_invoice):`, err)
      }
    }

    // ── Stock-in received: DR Inventory / CR AP ──────────────────────────────
    const { data: stockIns } = await supabase
      .from('transactions').select('id, created_at, updated_at, total_amount').eq('transaction_type', 'stock_in')
    for (const t of stockIns ?? []) {
      const eventAt = t.updated_at ?? t.created_at
      if (eventAt < fromTs || eventAt > toTs) continue
      if (isPosted('purchase_invoice', t.id)) continue
      const lines: JournalLineInput[] = [
        { account_code: '1040', debit: t.total_amount ?? 0, credit: 0 },
        { account_code: '2010', debit: 0, credit: t.total_amount ?? 0 },
      ]
      const result = await postJournalEntry(eventAt.slice(0, 10), 'purchase_invoice', t.id, 'Stock received', lines, null)
      if (result.success) { posted++; markPosted('purchase_invoice', t.id) }
      else console.warn(`projectEvents: skipped stock-in ${t.id} (purchase_invoice):`, result.error)
    }

    // ── Supplier payment: DR AP / CR Cash ────────────────────────────────────
    const { data: supplierPayments } = await supabase
      .from('transactions')
      .select('id, created_at, paid_at, total_amount, cash_account:cash_account_id(account_type)')
      .eq('transaction_type', 'supplier_payment')
    for (const t of supplierPayments ?? []) {
      const eventAt = t.paid_at ?? t.created_at
      if (eventAt < fromTs || eventAt > toTs) continue
      if (isPosted('disbursement', t.id)) continue
      const accountType = (t.cash_account as unknown as { account_type: string | null } | null)?.account_type
      const cashAccount = accountType === 'petty_cash' ? '1010' : '1020'
      const lines: JournalLineInput[] = [
        { account_code: '2010', debit: t.total_amount ?? 0, credit: 0 },
        { account_code: cashAccount, debit: 0, credit: t.total_amount ?? 0 },
      ]
      const result = await postJournalEntry(eventAt.slice(0, 10), 'disbursement', t.id, 'Supplier payment', lines, null)
      if (result.success) { posted++; markPosted('disbursement', t.id) }
      else console.warn(`projectEvents: skipped supplier payment ${t.id} (disbursement):`, result.error)
    }

    // ── Expense: DR <category account> / CR <cash account> ──────────────────
    const { data: expenseRows } = await supabase
      .from('transactions')
      .select('id, created_at, paid_at, total_amount, finance_details(category), cash_account:cash_account_id(account_type)')
      .eq('transaction_type', 'expense')
    for (const t of expenseRows ?? []) {
      const eventAt = t.paid_at ?? t.created_at
      if (eventAt < fromTs || eventAt > toTs) continue
      if (isPosted('disbursement', t.id)) continue
      const category = (t.finance_details as unknown as { category: string | null } | null)?.category ?? undefined
      const accountType = (t.cash_account as unknown as { account_type: string | null } | null)?.account_type
      const cashAccount = accountType === 'petty_cash' ? '1010' : '1020'
      const debitAccount = (category && EXPENSE_CATEGORY_ACCOUNTS[category]) || '7080'
      const lines: JournalLineInput[] = [
        { account_code: debitAccount, debit: t.total_amount ?? 0, credit: 0 },
        { account_code: cashAccount, debit: 0, credit: t.total_amount ?? 0 },
      ]
      const result = await postJournalEntry(eventAt.slice(0, 10), 'disbursement', t.id, `Expense: ${category ?? 'other'}`, lines, null)
      if (result.success) { posted++; markPosted('disbursement', t.id) }
      else console.warn(`projectEvents: skipped expense ${t.id} (disbursement):`, result.error)
    }

    // ── Petty-cash replenishment (approved): DR Petty Cash / CR Bank ────────
    const { data: replenishments } = await supabase
      .from('transactions')
      .select('id, created_at, approved_at, total_amount')
      .eq('transaction_type', 'petty_cash_replenishment').eq('status', 'approved')
    for (const t of replenishments ?? []) {
      const eventAt = t.approved_at ?? t.created_at
      if (eventAt < fromTs || eventAt > toTs) continue
      if (isPosted('manual', t.id)) continue
      const lines: JournalLineInput[] = [
        { account_code: '1010', debit: t.total_amount ?? 0, credit: 0 },
        { account_code: '1020', debit: 0, credit: t.total_amount ?? 0 },
      ]
      const result = await postJournalEntry(eventAt.slice(0, 10), 'manual', t.id, 'Petty cash replenishment', lines, null)
      if (result.success) { posted++; markPosted('manual', t.id) }
      else console.warn(`projectEvents: skipped petty cash replenishment ${t.id} (manual):`, result.error)
    }

    return posted
  }

  // ─── Date helpers (pure string arithmetic — every date here is YYYY-MM-DD,
  // so this avoids timezone drift from doing month/day math via JS Date except
  // where day-level arithmetic genuinely needs calendar awareness) ───────────
  function monthStartOf(dateStr: string): string { return dateStr.slice(0, 7) + '-01' }
  function yearStartOf(dateStr: string): string { return dateStr.slice(0, 4) + '-01-01' }
  function addMonthsToMonthStart(monthStr: string, n: number): string {
    const [y, m] = monthStr.split('-').map(Number)
    const total = y * 12 + (m - 1) + n
    const newY = Math.floor(total / 12)
    const newM = (total % 12) + 1
    return `${newY}-${String(newM).padStart(2, '0')}-01`
  }
  function addDaysToDate(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  function minDateStr(a: string, b: string): string { return a < b ? a : b }
  function todayDateStr(): string { return new Date().toISOString().slice(0, 10) }

  async function sumLines(
    query: ReturnType<typeof supabase.from>,
  ): Promise<Map<string, { debit: number; credit: number }>> {
    const { data } = await (query as any)
    const map = new Map<string, { debit: number; credit: number }>()
    for (const row of (data ?? []) as { account_code: string; debit: number | null; credit: number | null }[]) {
      const cur = map.get(row.account_code) ?? { debit: 0, credit: 0 }
      cur.debit += row.debit ?? 0
      cur.credit += row.credit ?? 0
      map.set(row.account_code, cur)
    }
    return map
  }

  // ─── GL period-balance cache (was gl_refresh_period_balances /
  // gl_backfill_period_balances) — a monthly snapshot so the 3 statements
  // below never rescan full ledger history. Closed months (strictly before
  // the current month) are immutable once posted, so caching them is safe;
  // the current month and any partial boundary month are always computed
  // live instead. ──────────────────────────────────────────────────────────
  //
  // Balance queries count status IN ('posted','reversed') — NOT 'posted' only.
  // Reversal is done the accounting way: the original stays in the ledger
  // (flipped to 'reversed' for audit/UI) and an offsetting reversal entry
  // (swapped debits/credits, status 'posted') is added, so the two NET TO ZERO.
  // If 'reversed' were excluded, only the offsetting entry would count and the
  // account would read NEGATIVE the original instead of zero (double-negation).
  // Draft (unapproved manual) entries are still excluded — they never took
  // effect. This also makes reverseJournalEntry's best-effort gap harmless:
  // whether or not the final status-flip lands, both entries are counted → net
  // zero. NOTE (flagged for the accountant): this corrects behaviour the old
  // gl_reverse_entry RPC + the FINANCE_GL balance query shared — confirm this
  // reversing-entry model is the intended one before reversals are used in anger.
  const refreshPeriodBalances = async (monthStart: string) => {
    const { data: allAccounts } = await supabase.from('accounts').select('code')
    const monthEndInclusive = addDaysToDate(addMonthsToMonthStart(monthStart, 1), -1)
    const sums = await sumLines(
      supabase
        .from('journal_entry_lines')
        .select('account_code, debit, credit, journal_entries!inner(entry_date, status)')
        .in('journal_entries.status', ['posted', 'reversed'])
        .gte('journal_entries.entry_date', monthStart)
        .lte('journal_entries.entry_date', monthEndInclusive) as any,
    )

    const nowIso = new Date().toISOString()
    const rows = (allAccounts ?? []).map(a => {
      const s = sums.get(a.code) ?? { debit: 0, credit: 0 }
      return { period_month: monthStart, account_code: a.code, debit: s.debit, credit: s.credit, updated_at: nowIso }
    })
    if (rows.length) {
      await supabase.from('gl_period_account_balances').upsert(rows, { onConflict: 'period_month,account_code' })
    }
  }

  const backfillPeriodBalances = async (from: string | null, to: string) => {
    const lastClosedMonth = addMonthsToMonthStart(monthStartOf(todayDateStr()), -1)
    const fromMonth = from ? monthStartOf(from) : '1970-01-01'
    const toMonth = minDateStr(to ? monthStartOf(to) : lastClosedMonth, lastClosedMonth)
    if (toMonth < fromMonth) return

    const { data: entries } = await supabase
      .from('journal_entries').select('entry_date').in('status', ['posted', 'reversed'])
      .gte('entry_date', fromMonth).lte('entry_date', toMonth)
    const activeMonths = new Set((entries ?? []).map(e => monthStartOf(e.entry_date)))

    const { data: cachedMonths } = await supabase.from('gl_period_account_balances').select('period_month')
    const cachedSet = new Set((cachedMonths ?? []).map(r => r.period_month as string))

    for (const m of activeMonths) {
      if (!cachedSet.has(m)) await refreshPeriodBalances(m)
    }
  }

  const fetchCachedSums = (uptoMonth: string) =>
    sumLines(supabase.from('gl_period_account_balances').select('account_code, debit, credit').lte('period_month', uptoMonth) as any)

  const fetchLiveSumsCumulative = (uptoDate: string, afterMonth: string) => {
    const fromDate = addMonthsToMonthStart(afterMonth, 1)
    return sumLines(
      supabase
        .from('journal_entry_lines')
        .select('account_code, debit, credit, journal_entries!inner(entry_date, status)')
        .in('journal_entries.status', ['posted', 'reversed'])
        .gte('journal_entries.entry_date', fromDate)
        .lte('journal_entries.entry_date', uptoDate) as any,
    )
  }

  const fetchLiveSumsRanged = (from: string, to: string, cacheFrom: string | null, cacheTo: string | null) => {
    let q = supabase
      .from('journal_entry_lines')
      .select('account_code, debit, credit, journal_entries!inner(entry_date, status)')
      .eq('journal_entries.status', 'posted')
      .gte('journal_entries.entry_date', from)
      .lte('journal_entries.entry_date', to)
    if (cacheFrom && cacheTo && cacheFrom <= cacheTo) {
      const cacheToMonthEnd = addDaysToDate(addMonthsToMonthStart(cacheTo, 1), -1)
      q = q.or(`entry_date.lt.${cacheFrom},entry_date.gt.${cacheToMonthEnd}`, { foreignTable: 'journal_entries' })
    }
    return sumLines(q as any)
  }

  // ─── Trial Balance — every active account's raw own-side balance (was
  // gl_trial_balance). No contra sign-flip: a contra account's normal_balance
  // is already the opposite of its class's typical side. ────────────────────
  const computeTrialBalance = async (pAsOf?: string): Promise<TrialBalanceRow[]> => {
    const asOf = pAsOf ?? todayDateStr()
    const cacheTo = minDateStr(
      addMonthsToMonthStart(monthStartOf(asOf), -1),
      addMonthsToMonthStart(monthStartOf(todayDateStr()), -1),
    )
    await backfillPeriodBalances(null, cacheTo)

    const cached = await fetchCachedSums(cacheTo)
    const live = await fetchLiveSumsCumulative(asOf, cacheTo)
    const { data: activeAccounts } = await supabase.from('accounts').select('code, name, class').eq('is_active', true)

    const rows: TrialBalanceRow[] = []
    for (const a of activeAccounts ?? []) {
      const c = cached.get(a.code) ?? { debit: 0, credit: 0 }
      const l = live.get(a.code) ?? { debit: 0, credit: 0 }
      const totalDebit = c.debit + l.debit
      const totalCredit = c.credit + l.credit
      if (totalDebit === 0 && totalCredit === 0) continue
      rows.push({
        account_code: a.code, account_name: a.name, class: a.class,
        debit_balance: totalDebit - totalCredit > 0 ? totalDebit - totalCredit : 0,
        credit_balance: totalCredit - totalDebit > 0 ? totalCredit - totalDebit : 0,
      })
    }
    rows.sort((x, y) => x.account_code.localeCompare(y.account_code))
    return rows
  }

  const INCOME_STATEMENT_SORT_ORDER: Record<string, number> = {
    Revenue: 1, 'Cost of Sales': 2, 'Selling Expenses': 3,
    'Administrative & Operating Expenses': 4, 'Other Income': 5, 'Finance Costs': 6,
  }

  // ─── Income Statement — bounded by [from, to] (was gl_income_statement).
  // Subsection sums apply an is_contra sign-flip on each account's own-side
  // net (e.g. Sales Returns, normal_balance='debit', flips to NEGATIVE so
  // summing it into Revenue alongside Sales Revenue nets to Net Sales). Any
  // whole, CLOSED month fully inside the range reads from the cache; partial
  // boundary months (and the current month, if in range) are computed live,
  // bounded to just that slice — never the full history. ────────────────────
  const computeIncomeStatement = async (pFrom?: string, pTo?: string): Promise<IncomeStatement> => {
    const from = pFrom ?? yearStartOf(todayDateStr())
    const to = pTo ?? todayDateStr()
    const fromMonthStart = monthStartOf(from)
    const toMonthStart = monthStartOf(to)
    const toMonthEnd = addDaysToDate(addMonthsToMonthStart(toMonthStart, 1), -1)
    const currentMonthStart = monthStartOf(todayDateStr())

    const cacheFrom = from === fromMonthStart ? fromMonthStart : addMonthsToMonthStart(fromMonthStart, 1)
    let cacheTo = (to === toMonthEnd && toMonthStart < currentMonthStart)
      ? toMonthStart
      : addMonthsToMonthStart(toMonthStart, -1)
    cacheTo = minDateStr(cacheTo, addMonthsToMonthStart(currentMonthStart, -1))
    const hasCacheRange = cacheFrom <= cacheTo

    if (hasCacheRange) await backfillPeriodBalances(cacheFrom, cacheTo)

    const cached = hasCacheRange
      ? await sumLines(
          supabase.from('gl_period_account_balances').select('account_code, debit, credit')
            .gte('period_month', cacheFrom).lte('period_month', cacheTo) as any,
        )
      : new Map<string, { debit: number; credit: number }>()
    const live = await fetchLiveSumsRanged(from, to, hasCacheRange ? cacheFrom : null, hasCacheRange ? cacheTo : null)

    const { data: accounts } = await supabase
      .from('accounts').select('code, name, subsection, normal_balance, is_contra')
      .eq('section', 'income_statement').eq('is_active', true)

    const balances = (accounts ?? []).map(a => {
      const c = cached.get(a.code) ?? { debit: 0, credit: 0 }
      const l = live.get(a.code) ?? { debit: 0, credit: 0 }
      const totalDebit = c.debit + l.debit
      const totalCredit = c.credit + l.credit
      const raw = a.normal_balance === 'credit' ? totalCredit - totalDebit : totalDebit - totalCredit
      return { code: a.code, name: a.name, subsection: a.subsection as string, amount: raw * (a.is_contra ? -1 : 1) }
    })

    const sumBySubsection = (name: string) => balances.filter(b => b.subsection === name).reduce((s, b) => s + b.amount, 0)
    const netSales = sumBySubsection('Revenue')
    const cogs = sumBySubsection('Cost of Sales')
    const selling = sumBySubsection('Selling Expenses')
    const admin = sumBySubsection('Administrative & Operating Expenses')
    const otherIncome = sumBySubsection('Other Income')
    const financeCosts = sumBySubsection('Finance Costs')

    const grossProfit = netSales - cogs
    const operatingIncome = grossProfit - selling - admin
    const netIncome = operatingIncome + otherIncome - financeCosts

    const nonZero = balances.filter(b => b.amount !== 0)
    const subsectionNames = Array.from(new Set(nonZero.map(b => b.subsection)))
    const sections: IncomeStatementSection[] = subsectionNames
      .map(subsection => {
        const rows = nonZero.filter(b => b.subsection === subsection).sort((a, b) => a.code.localeCompare(b.code))
        return {
          subsection,
          accounts: rows.map(r => ({ code: r.code, name: r.name, amount: r.amount })),
          subtotal: rows.reduce((s, r) => s + r.amount, 0),
        }
      })
      .sort((a, b) => (INCOME_STATEMENT_SORT_ORDER[a.subsection] ?? 7) - (INCOME_STATEMENT_SORT_ORDER[b.subsection] ?? 7))

    return {
      from, to, sections, netSales, cogs, grossProfit,
      sellingExpenses: selling, adminExpenses: admin, operatingIncome,
      otherIncome, financeCosts, netIncome,
    }
  }

  const BALANCE_SHEET_SORT_ORDER: Record<string, number> = {
    'Current Assets': 1, 'Non-Current Assets': 2,
    'Current Liabilities': 3, 'Non-Current Liabilities': 4, Equity: 5,
  }

  // ─── Balance Sheet — cumulative to asOf (was gl_balance_sheet). Injects
  // Current Year Earnings (3030) = Net Income from computeIncomeStatement
  // (fiscal-year-start, asOf) — 3030 is never posted to directly, so it's
  // excluded from the ledger scan and added back in here. Throws if
  // Assets <> Liabilities + Equity — every operational entry is balanced by
  // construction (postJournalEntry/reverseJournalEntry both validate this
  // before inserting), so a mismatch here is a real corruption signal. ──────
  const computeBalanceSheet = async (pAsOf?: string): Promise<BalanceSheet> => {
    const asOf = pAsOf ?? todayDateStr()
    const fiscalYearStart = yearStartOf(asOf)
    const cacheTo = minDateStr(
      addMonthsToMonthStart(monthStartOf(asOf), -1),
      addMonthsToMonthStart(monthStartOf(todayDateStr()), -1),
    )
    await backfillPeriodBalances(null, cacheTo)

    const netIncome = (await computeIncomeStatement(fiscalYearStart, asOf)).netIncome

    const cached = await fetchCachedSums(cacheTo)
    const live = await fetchLiveSumsCumulative(asOf, cacheTo)

    const { data: accounts } = await supabase
      .from('accounts').select('code, name, class, subsection, normal_balance, is_contra')
      .eq('section', 'balance_sheet').eq('is_active', true).neq('code', '3030')

    const balances = (accounts ?? []).map(a => {
      const c = cached.get(a.code) ?? { debit: 0, credit: 0 }
      const l = live.get(a.code) ?? { debit: 0, credit: 0 }
      const totalDebit = c.debit + l.debit
      const totalCredit = c.credit + l.credit
      const raw = a.normal_balance === 'credit' ? totalCredit - totalDebit : totalDebit - totalCredit
      return {
        code: a.code, name: a.name, class: a.class as string, subsection: a.subsection as string,
        amount: raw * (a.is_contra ? -1 : 1),
      }
    })

    const sumByClass = (cls: string) => balances.filter(b => b.class === cls).reduce((s, b) => s + b.amount, 0)
    const totalAssets = sumByClass('asset')
    const totalLiabilities = sumByClass('liability')
    const equityExclCYE = sumByClass('equity')
    const tiesOut = Math.abs(totalAssets - (totalLiabilities + equityExclCYE + netIncome)) < 0.01

    const nonZero = balances.filter(b => b.amount !== 0)
    const groupKeys = Array.from(new Set(nonZero.map(b => `${b.class}::${b.subsection}`)))
    const sections: BalanceSheetSection[] = groupKeys
      .map(key => {
        const [cls, subsection] = key.split('::')
        const rows = nonZero.filter(b => b.class === cls && b.subsection === subsection).sort((a, b) => a.code.localeCompare(b.code))
        return {
          class: cls, subsection,
          accounts: rows.map(r => ({ code: r.code, name: r.name, amount: r.amount })),
          subtotal: rows.reduce((s, r) => s + r.amount, 0),
        }
      })
      .sort((a, b) => (BALANCE_SHEET_SORT_ORDER[a.subsection] ?? 6) - (BALANCE_SHEET_SORT_ORDER[b.subsection] ?? 6))

    if (!tiesOut) {
      throw new Error(
        `GL out of balance: Assets ${totalAssets} <> Liabilities ${totalLiabilities} + Equity ${equityExclCYE} (incl. Current Year Earnings ${netIncome})`,
      )
    }

    return {
      asOf, sections, currentYearEarnings: netIncome,
      totalAssets, totalLiabilities, totalEquity: equityExclCYE + netIncome, tiesOut,
    }
  }

  const fetchTrialBalance = async (asOf?: string) => {
    loading.value = true
    clearError()
    try {
      await projectEvents({ to: asOf })
      trialBalance.value = await computeTrialBalance(asOf)
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
      incomeStatement.value = await computeIncomeStatement(from, to)
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
      balanceSheet.value = await computeBalanceSheet(asOf)
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
    fetchAccounts, fetchJournal, postJournalEntry, postManualEntry, approveManualEntry, reverseEntry,
    projectEvents, fetchTrialBalance, fetchIncomeStatement, fetchBalanceSheet,
    clearError, resetStore,
  }
})
