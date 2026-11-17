// Finance appliers: expense and supplier payment. The ONE copy — both the
// Finance queue (pages/finance/stores/financeChangeRequest.ts) and the shared
// store's dispatcher (./apply.ts) call these, so the two approval routes can
// never drift apart again (they had: only one of them checked a correction
// could go through before voiding the original).

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import {
  useFinanceDataStore,
  legacyExpenseCategories,
  disbursementAccountClasses,
  glAccountCodeFor,
  expenseDebitAccount,
} from '@/stores/financeData'
import type { CashClassification } from '@/stores/financeData'
import { useGLDataStore } from '@/stores/glData'
import { toLocalISODate } from '@/utils/dateFormats'
import type { ApplyResult, ChangeRequestType, Diff } from './types'
import { prevStatusKey } from './types'
import {
  stripReservedKeys,
  toVal,
  firstStaleField,
  staleError,
  correctionDate,
  reissueReason,
  reissueRemarks,
} from './helpers'
import { reverseProjectedEntry } from './ledger'

/**
 * Where an expense correction lands in the ledger.
 *
 * true  — in the month the expense belongs to: the old entry is reversed on
 *         its own date and the corrected one posted on the expense's date, so
 *         that month's Income Statement shows the fix.
 * false — in the month it was approved (the July rule, protecting months
 *         already reported): both entries dated the approval day.
 *
 * Either way the expense keeps its number, date and voucher; only the ledger
 * dating differs. Confirm with the accountant; it is the only switch.
 */
export const correctionsBookInOriginalMonth = true

const expenseLedgerKeys = new Set(['amount', 'category', 'cash_account_id', 'paid_at'])
const expenseMemoTxKeys = new Set(['payment_method', 'remarks'])
const expenseMemoDetailKeys = new Set(['paid_to', 'department', 'or_si_no'])

/** The document's status from before the request gated it, if stashed. */
function prevStatusOf(request: ChangeRequestType): string | null {
  const from = (request.proposed_changes?.[prevStatusKey] as { from?: unknown } | undefined)?.from
  return typeof from === 'string' ? from : null
}

// Reverse the expense's projected GL entry (if booked), then soft-void the
// document and restore the cash account. The row stays, flagged.
export async function voidExpense(
  targetId: number,
  userId: string,
  reason: string | null,
): Promise<{ success: boolean; error?: string }> {
  const financeStore = useFinanceDataStore()
  const rev = await reverseProjectedEntry('disbursement', targetId, userId)
  if (!rev.ok)
    return { success: false, error: rev.error || 'Failed to reverse the expense journal entry.' }
  const result = await financeStore.voidExpense(targetId, reason)
  return result.success
    ? { success: true }
    : {
        success: false,
        error: 'Failed to void the expense (GL already reversed — please retry).',
      }
}

type CorrectionPlan = {
  debitAccount: string
  creditAccount: string
  debitAccountName: string | null
}

/**
 * Why a ledger correction cannot go through, or the accounts it will post to.
 * Runs BEFORE anything changes, so a refusal leaves the expense exactly as it
 * was: amount, expense account (active, not revenue), cash account (exists,
 * has a GL account, can cover the corrected amount once the original amount
 * goes back to the account it came from).
 */
async function planExpenseCorrection(
  payload: { amount: number; category: string; cashAccountId: number },
  original: { amount: number; cashAccountId: number | null },
): Promise<{ error: string } | CorrectionPlan> {
  if (!(payload.amount > 0)) return { error: 'The corrected amount must be greater than zero.' }
  if (!payload.category) return { error: 'The corrected expense needs an expense account.' }

  let isChartCode = false
  if (!legacyExpenseCategories.some((c) => c.value === payload.category)) {
    const { data: account, error: lookupError } = await supabase
      .from('accounts').select('class, is_active').eq('code', payload.category).maybeSingle()
    if (lookupError) return { error: 'Could not verify the expense account. Nothing was changed — try again.' }
    if (!account || !account.is_active) return { error: `${payload.category} is not an active account.` }
    if (!(disbursementAccountClasses as readonly string[]).includes(account.class)) {
      return { error: `${payload.category} is a revenue account — a disbursement cannot be charged to it.` }
    }
    isChartCode = true
  }

  if (!payload.cashAccountId) {
    return { error: 'This expense has no cash account on record. Void it and record the corrected expense instead.' }
  }
  const { data: cash } = await supabase
    .from('cash_accounts').select('balance, classification, gl_account_code')
    .eq('id', payload.cashAccountId).maybeSingle()
  if (!cash) return { error: 'The cash account for this expense no longer exists. Void it and record the corrected expense instead.' }
  const returnedByCorrection = original.cashAccountId === payload.cashAccountId ? original.amount : 0
  const available = Number(cash.balance ?? 0) + returnedByCorrection
  if (payload.amount > available + 0.005) {
    return { error: `Not enough in the cash account for the corrected amount (available after the correction: ${available}).` }
  }

  const debitAccount = expenseDebitAccount(payload.category, isChartCode)
  const creditAccount = glAccountCodeFor({
    classification: cash.classification as CashClassification,
    gl_account_code: cash.gl_account_code,
  })
  // Both must be live chart accounts, or the corrected entry would be refused
  // after the old one was already reversed.
  const { data: live, error: chartError } = await supabase
    .from('accounts').select('code, name').in('code', [debitAccount, creditAccount]).eq('is_active', true)
  if (chartError) return { error: 'Could not check the chart of accounts. Nothing was changed — try again.' }
  const liveCodes = new Set((live ?? []).map((a: { code: string }) => a.code))
  for (const code of [debitAccount, creditAccount]) {
    if (!liveCodes.has(code)) return { error: `Account ${code} is not active in the chart of accounts.` }
  }
  const debitAccountName = (live ?? []).find((a: { code: string; name: string }) => a.code === debitAccount)?.name ?? null
  return { debitAccount, creditAccount, debitAccountName }
}

/** Cash moves with the correction: the old amount back, the new amount out. */
async function moveCash(
  from: { accountId: number | null; amount: number },
  to: { accountId: number; amount: number },
) {
  const deltas = new Map<number, number>()
  if (from.accountId) deltas.set(from.accountId, (deltas.get(from.accountId) ?? 0) + from.amount)
  deltas.set(to.accountId, (deltas.get(to.accountId) ?? 0) - to.amount)
  for (const [accountId, delta] of deltas) {
    if (Math.abs(delta) < 0.005) continue
    const { data: account } = await supabase
      .from('cash_accounts').select('name, balance').eq('id', accountId).maybeSingle()
    const { error: e } = account
      ? await supabase.from('cash_accounts').update({ balance: Number(account.balance ?? 0) + delta }).eq('id', accountId)
      : { error: { message: 'cash account not found' } }
    if (e) {
      // Best-effort like every balance write (JS-over-RPC; the GL is the
      // authority, cash_accounts.balance an operational cache) — but never
      // silent: the document and ledger are already corrected, so name the
      // exact adjustment still owed instead of leaving it to a later recon.
      console.warn('applyExpenseChange: cash account balance update failed:', e.message)
      const sign = delta > 0 ? 'add' : 'take off'
      useToast().warning(
        `The expense was corrected, but ${account?.name ?? `cash account #${accountId}`}'s balance was not updated — ${sign} ${Math.abs(delta).toFixed(2)} by hand.`,
        { timeout: 20000 },
      )
    }
  }
}

/**
 * EDIT an expense. Always the SAME document — it keeps its number, its voucher
 * and its history; nothing is voided.
 *
 * - Memo fields (payee, department, OR/SI no., payment method, remarks): updated
 *   in place.
 * - Ledger fields (amount, account, cash account, date): updated in place AND
 *   the ledger corrected — the old entry reversed, the corrected one posted by
 *   the app (the projector never re-books a document that has had an entry),
 *   dated per `correctionsBookInOriginalMonth`. Cash moves with it.
 *
 * Order, chosen so a failure part-way can be retried by approving again:
 * reverse → post → update the document → move cash. Until the document is
 * updated the request stays pending and the stale check still passes; cash
 * moves last, once, after which the request resolves.
 *
 * (This replaces reverse + reissue, which voided the expense and recorded a
 * copy under a new number dated the approval day — staff saw only VOIDED, the
 * voucher lost its link, and the expense left its month in every report.)
 */
export async function applyExpenseChange(
  request: ChangeRequestType,
  userId: string,
): Promise<ApplyResult> {
  if (request.request_type === 'void') {
    const v = await voidExpense(request.transaction_id, userId, request.reason)
    return v.success ? { success: true, resultRef: request.from_transaction_no ?? undefined } : v
  }

  const changes = stripReservedKeys(request.proposed_changes ?? {})
  const { data: cur } = await supabase
    .from('transactions')
    .select(
      'total_amount, cash_account_id, paid_at, created_at, payment_method, remarks, status, finance_details(category, paid_to, department, or_si_no)',
    )
    .eq('id', request.transaction_id)
    .eq('transaction_type', 'expense')
    .maybeSingle()
  if (!cur) return { success: false, error: 'Expense not found.' }
  if (cur.status === 'voided') return { success: false, error: 'This expense has already been voided.' }
  const fd = ((Array.isArray(cur.finance_details)
    ? cur.finance_details[0]
    : cur.finance_details) ?? {}) as Record<string, unknown>
  const current: Record<string, unknown> = {
    amount: cur.total_amount,
    cash_account_id: cur.cash_account_id,
    paid_at: (cur.paid_at ?? '').slice(0, 10),
    payment_method: cur.payment_method,
    remarks: cur.remarks,
    category: fd.category,
    paid_to: fd.paid_to,
    department: fd.department,
    or_si_no: fd.or_si_no,
  }
  // A field already at its new value passes: an earlier approval that
  // stopped part-way applied it. Re-running is safe — the ledger is reversed
  // and re-posted from the live figures, and cash moves from the live figures
  // (nothing, once the document already shows the corrected amount/account).
  const stale = firstStaleField(changes, current, true)
  if (stale) return staleError(stale)

  // What the document becomes. The gate set at propose time is lifted here:
  // nothing else in this path sets a status.
  const txUpdate: Record<string, unknown> = {}
  const detailUpdate: Record<string, unknown> = {}
  for (const [key, diff] of Object.entries(changes)) {
    const to = (diff as Diff).to
    if (expenseMemoTxKeys.has(key)) txUpdate[key] = to
    else if (expenseMemoDetailKeys.has(key)) detailUpdate[key] = to
  }
  const isLedgerEdit = Object.keys(changes).some((k) => expenseLedgerKeys.has(k))
  const original = {
    amount: Number(cur.total_amount ?? 0),
    cashAccountId: cur.cash_account_id == null ? null : Number(cur.cash_account_id),
    date: ((cur.paid_at ?? cur.created_at) as string).slice(0, 10),
  }
  const corrected = {
    amount: Number(toVal(changes, 'amount') ?? cur.total_amount ?? 0),
    category: String(toVal(changes, 'category') ?? fd.category ?? ''),
    cashAccountId: Number(toVal(changes, 'cash_account_id') ?? cur.cash_account_id),
    date: String(toVal(changes, 'paid_at') ?? original.date).slice(0, 10),
  }

  if (isLedgerEdit) {
    const plan = await planExpenseCorrection(corrected, original)
    if ('error' in plan) return { success: false, error: plan.error }

    const gl = useGLDataStore()
    const today = toLocalISODate(new Date())

    // 1. Reverse the live entry, if the expense was ever booked.
    const { data: liveEntry, error: entryLookupError } = await supabase
      .from('journal_entries')
      .select('id, entry_date')
      .eq('reference_type', 'disbursement')
      .eq('reference_id', request.transaction_id)
      .eq('status', 'posted')
      .is('reverses_entry', null)
      .maybeSingle()
    if (entryLookupError) return { success: false, error: 'Could not read the expense\'s ledger entry. Nothing was changed — try again.' }
    if (liveEntry) {
      const reversed = await gl.reverseJournalEntry(
        liveEntry.id, userId, undefined, undefined,
        correctionsBookInOriginalMonth ? liveEntry.entry_date : today,
      )
      if (!reversed.success) {
        return { success: false, error: reversed.error || 'Could not reverse the expense\'s ledger entry. Nothing was changed.' }
      }
    }

    // 2. Post the corrected entry on the same document.
    const posted = await gl.postJournalEntry(
      correctionsBookInOriginalMonth ? corrected.date : today,
      'disbursement',
      request.transaction_id,
      `Expense: ${plan.debitAccountName ?? plan.debitAccount} (corrected via change request #${request.id})`,
      [
        { account_code: plan.debitAccount, debit: corrected.amount, credit: 0 },
        { account_code: plan.creditAccount, debit: 0, credit: corrected.amount },
      ],
      userId,
    )
    if (!posted.success) {
      return {
        success: false,
        error: liveEntry
          ? `The old ledger entry was reversed, but the corrected one could not be posted (${posted.error ?? 'unknown error'}). Approve the request again to finish.`
          : `The corrected ledger entry could not be posted (${posted.error ?? 'unknown error'}). Nothing else was changed — approve the request again.`,
      }
    }

    if ('amount' in changes) {
      txUpdate.total_amount = corrected.amount
      txUpdate.subtotal = corrected.amount
    }
    if ('cash_account_id' in changes) txUpdate.cash_account_id = corrected.cashAccountId
    if ('paid_at' in changes) txUpdate.paid_at = corrected.date
    if ('category' in changes) detailUpdate.category = corrected.category
  }

  const prevStatus = prevStatusOf(request)
  if (prevStatus) txUpdate.status = prevStatus
  else console.warn('applyExpenseChange: no __prev_status stashed — document may stay gated on change_request.')

  // 3. The document itself — details first, the header (amount, account,
  // and the status lift) last, so a failure part-way leaves the amount and
  // account as they were and a retry still moves the cash from the right place.
  if (Object.keys(detailUpdate).length) {
    const { error: e } = await supabase
      .from('finance_details').update(detailUpdate).eq('transaction_id', request.transaction_id)
    if (e) {
      return {
        success: false,
        error: isLedgerEdit
          ? `The ledger was corrected, but the expense's details could not be updated (${e.message}). Approve the request again to finish.`
          : e.message,
      }
    }
  }
  if (Object.keys(txUpdate).length) {
    const { error: e } = await supabase.from('transactions').update(txUpdate).eq('id', request.transaction_id)
    if (e) {
      return {
        success: false,
        error: isLedgerEdit
          ? `The ledger was corrected, but the expense itself could not be updated (${e.message}). Approve the request again to finish.`
          : e.message,
      }
    }
  }

  // 4. Cash, last and once.
  if (isLedgerEdit) {
    await moveCash(
      { accountId: original.cashAccountId, amount: original.amount },
      { accountId: corrected.cashAccountId, amount: corrected.amount },
    )
  }

  return { success: true, resultRef: request.from_transaction_no ?? undefined }
}

// ── Supplier payment ──────────────────────────────────────────────────────
// Projects as 'disbursement' (DR AP / CR cash). Void reverses that, restores
// the cash account, and gives suppliers.balance back only when this payment
// lowered it. Memo edits in place; an amount edit voids and re-records.
export async function voidSupplierPayment(
  targetId: number,
  userId: string,
  reason: string | null,
): Promise<{ success: boolean; error?: string }> {
  const { data: pay } = await supabase
    .from('transactions')
    .select('supplier_id, total_amount, status, cash_account_id')
    .eq('id', targetId)
    .eq('transaction_type', 'supplier_payment')
    .maybeSingle()
  if (!pay) return { success: false, error: 'Supplier payment not found.' }
  if (pay.status === 'voided') return { success: false, error: 'This payment has already been voided.' }
  const voidedCashAccountId = pay.cash_account_id as number | null
  const voidedAmount = (pay.total_amount ?? 0) as number

  // Only give back what the payment took. reissueSupplierPayment lowers the
  // cached suppliers.balance; a payment raised from a disbursement voucher
  // never touches it. Looked up BEFORE anything changes, and a failed lookup
  // stops the void: read as "not from a voucher", it would restore a balance
  // that was never lowered, on a payment already voided that no retry could reach.
  const { count: voucherLines, error: voucherLookupError } = await supabase
    .from('disbursement_voucher_items')
    .select('id', { count: 'exact', head: true })
    .eq('expense_transaction_id', targetId)
  if (voucherLookupError) {
    return { success: false, error: `Could not check whether this payment came from a voucher (${voucherLookupError.message}). Nothing was voided.` }
  }
  const fromVoucher = (voucherLines ?? 0) > 0

  const rev = await reverseProjectedEntry('disbursement', targetId, userId)
  if (!rev.ok)
    return { success: false, error: rev.error || 'Failed to reverse the payment journal entry.' }

  // Void marker first: it is what excludes the payment from every AP read, so
  // it must land before the compensating balance restores.
  const { error: voidErr } = await supabase
    .from('transactions')
    .update({ status: 'voided' })
    .eq('id', targetId)
    .eq('transaction_type', 'supplier_payment')
    .neq('status', 'voided')
  if (voidErr) return { success: false, error: voidErr.message }

  if (pay.supplier_id && !fromVoucher) {
    const { data: s } = await supabase
      .from('suppliers').select('balance').eq('id', pay.supplier_id).maybeSingle()
    if (s) {
      const { error: e } = await supabase
        .from('suppliers')
        .update({ balance: (s.balance ?? 0) + (pay.total_amount ?? 0) })
        .eq('id', pay.supplier_id)
      if (e) console.warn('voidSupplierPayment: suppliers.balance restore failed:', e.message)
    }
  }

  // Put the cash back — voucher-raised payments deducted it. Mirrors voidExpense.
  if (voidedCashAccountId && voidedAmount > 0) {
    const { data: account } = await supabase
      .from('cash_accounts').select('balance').eq('id', voidedCashAccountId).maybeSingle()
    if (account) {
      const { error: e } = await supabase
        .from('cash_accounts')
        .update({ balance: (account.balance ?? 0) + voidedAmount })
        .eq('id', voidedCashAccountId)
      if (e) console.warn('voidSupplierPayment: cash account balance restore failed:', e.message)
    }
  }
  return { success: true }
}

export async function applySupplierPaymentChange(
  request: ChangeRequestType,
  userId: string,
): Promise<ApplyResult> {
  if (request.request_type === 'void') {
    const v = await voidSupplierPayment(request.transaction_id, userId, request.reason)
    return v.success ? { success: true, resultRef: request.from_transaction_no ?? undefined } : v
  }

  const changes = stripReservedKeys(request.proposed_changes ?? {})
  const { data: cur } = await supabase
    .from('transactions')
    .select('supplier_id, total_amount, payment_method, paid_at, remarks, status, cash_account_id')
    .eq('id', request.transaction_id)
    .eq('transaction_type', 'supplier_payment')
    .maybeSingle()
  if (!cur) return { success: false, error: 'Supplier payment not found.' }
  if (cur.status === 'voided') return { success: false, error: 'This payment has already been voided.' }
  const current: Record<string, unknown> = {
    amount: cur.total_amount,
    payment_method: cur.payment_method,
    remarks: cur.remarks,
  }
  const stale = firstStaleField(changes, current)
  if (stale) return staleError(stale)

  // Memo-only (method/remarks) → in place, lifting the propose-time gate.
  if (!('amount' in changes)) {
    const txUpdate: Record<string, unknown> = {}
    for (const [key, diff] of Object.entries(changes)) {
      if (key === 'payment_method' || key === 'remarks') txUpdate[key] = (diff as Diff).to
    }
    const prevStatus = prevStatusOf(request)
    if (prevStatus) txUpdate.status = prevStatus
    else console.warn('applySupplierPaymentChange: no __prev_status stashed — document may stay gated on change_request.')
    if (Object.keys(txUpdate).length) {
      const { error: e } = await supabase
        .from('transactions').update(txUpdate).eq('id', request.transaction_id)
      if (e) return { success: false, error: e.message }
    }
    return { success: true, resultRef: request.from_transaction_no ?? undefined }
  }

  // Amount edit → reverse + reissue, dated at the correction date.
  const financeStore = useFinanceDataStore()
  const valueDate = correctionDate()
  const merged = {
    supplierId: Number(cur.supplier_id),
    amount: Number(toVal(changes, 'amount') ?? cur.total_amount ?? 0),
    paymentMethod:
      ((toVal(changes, 'payment_method') ?? cur.payment_method) as string | undefined) ||
      undefined,
    valueDate,
    // Carried forward or the replacement loses its cash account, and the GL
    // credits 1020 instead of whatever actually paid.
    cashAccountId: cur.cash_account_id ?? null,
    remarks: reissueRemarks(request, toVal(changes, 'remarks') ?? cur.remarks),
  }
  const v = await voidSupplierPayment(request.transaction_id, userId, reissueReason(request))
  if (!v.success) return v
  const res = await financeStore.reissueSupplierPayment(merged)
  if (!res.success)
    return {
      success: false,
      error:
        'Old payment voided, but reissuing the corrected payment failed — please re-record it manually.',
    }
  // Book the replacement now rather than at the next statement view, so the
  // ledger never sits with the old payment reversed and nothing in its place.
  try {
    await useGLDataStore().projectEvents({ from: valueDate, to: valueDate })
  } catch (err) {
    console.warn('applySupplierPaymentChange: ledger projection failed (it books on the next statement view):', err)
  }
  return { success: true, resultId: res.paymentId, resultRef: res.paymentNo ?? undefined }
}
