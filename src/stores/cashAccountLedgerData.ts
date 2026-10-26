import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/utils/helpers'
import { fetchAllRows, fetchAllRowsForIds } from '@/stores/shared/paging'

// ─────────────────────────────────────────────────────────────────────────────
// One cash account's money in / money out.
//
// WHY NOT THE GENERAL LEDGER
// Several cash accounts post to one GL account — all five bank accounts are
// 1020 Cash in Bank — so the ledger can say what 1020 did but never what BDO
// VP 2290 did. The operational documents can: every flow that moves an
// account's balance records which account it touched. This store reads those
// documents back, so the history is the same set of events that built the
// balance on the card, and the two can be compared.
//
// WHAT COUNTS (each one is a place that writes cash_accounts.balance)
//   in   opening balance                 cash_accounts.opening_balance
//   in   collection                      collections.cash_account_id
//   in   remittance                      transactions.cash_account_id
//   in   bank deposit (destination)      transactions.cash_account_id
//   in   petty-cash replenishment        transactions.cash_account_id (approved)
//   out  expense                         transactions.cash_account_id
//   out  supplier payment                transactions.cash_account_id
//   out  bank deposit (source)           transactions.funding_account_id
//   out  replenishment funding           transactions.funding_account_id (approved)
//   out  rebate payout                   ethical_details.rebate_cash_account_id
//   ±    Record Transaction entry        journal line memo, see cashLineMemo
//
// Disbursement vouchers are deliberately NOT read: recording one produces the
// expense / supplier-payment rows above, which carry the same account, so
// reading both would count the money twice.
//
// Voided documents are listed but not counted — voiding puts the money back.
// ─────────────────────────────────────────────────────────────────────────────

export type CashMovement = {
  /** Unique within one history, for list keys. */
  key: string
  /** The date the money moved, 'YYYY-MM-DD'. */
  date: string
  /** When it was recorded, to order same-day movements. */
  recordedAt: string
  source: string
  reference: string | null
  description: string
  moneyIn: number
  moneyOut: number
  /** Listed for the trail, excluded from the balance. */
  voided: boolean
  /**
   * The document is live but its ledger entry was reversed by hand in General
   * Journal — the cash moved, the ledger says it didn't. Counted here (this is
   * the account's balance, and the balance did move) but flagged, because the
   * document needs voiding to bring the two back in step.
   */
  ledgerReversed?: boolean
  /** Balance after this movement; equals the previous one for voided rows. */
  runningBalance: number
}

export type CashAccountHistory = {
  movements: CashMovement[]
  totalIn: number
  totalOut: number
  /** Opening balance plus every counted movement. */
  computedBalance: number
}

/**
 * The memo written on the cash line of a Record Transaction entry. Book entries
 * have no document of their own, so this is the only place that says which
 * account the money went through. The " —" after the id keeps account 1 from
 * matching account 12's memo.
 */
export const cashLineMemo = (cashAccountId: number, name: string) =>
  `Cash account #${cashAccountId} — ${name}`

/** The account a cashLineMemo names, or null for any other memo. */
export function parseCashLineMemo(memo: string | null | undefined): { id: number; name: string } | null {
  const match = /^Cash account #(\d+) — (.*)$/.exec(memo ?? '')
  return match ? { id: Number(match[1]), name: match[2] } : null
}

type AccountLike = { id: number; name: string; opening_balance: number | null; created_at?: string | null }

const dateOf = (value: string | null | undefined) => (value ?? '').slice(0, 10)
const money = (value: unknown) => Number(value) || 0

export const useCashAccountLedgerStore = defineStore('cashAccountLedger', () => {
  const history = ref<CashAccountHistory | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Moves one cash account's balance by `delta` (positive = money in), for a
   * ledger entry posted by hand that touched that account.
   *
   * Every operational screen keeps `cash_accounts.balance` in step with what it
   * posts; an entry posted straight to the GL did not, so the account card and
   * the voucher form's funds check never saw it. Reads the balance fresh rather
   * than trusting a cached list, so two entries in a row don't overwrite each
   * other.
   */
  async function adjustCashAccountBalance(cashAccountId: number, delta: number) {
    const { data, error: fetchError } = await supabase.from('cash_accounts')
      .select('balance').eq('id', cashAccountId).single()
    if (fetchError || !data) return { success: false, error: fetchError?.message ?? 'Cash account not found.' }
    const { error: updateError } = await supabase.from('cash_accounts')
      .update({ balance: money(data.balance) + delta }).eq('id', cashAccountId)
    if (updateError) return { success: false, error: updateError.message }
    return { success: true, error: null }
  }

  /**
   * Marks live documents whose ledger entry was reversed by hand. Disbursements
   * reference a transactions id and collections a collections id, so the two
   * are looked up separately — the ids are not interchangeable.
   */
  async function flagLedgerReversals(movements: Omit<CashMovement, 'runningBalance'>[]) {
    const idsFor = (prefix: string) => movements
      .filter((m) => !m.voided && m.key.startsWith(prefix))
      .map((m) => Number(m.key.slice(prefix.length)))
    const checks: [string, string, number[]][] = [
      ['disbursement', 'tx-', idsFor('tx-')],
      ['collection', 'col-', idsFor('col-')],
    ]
    for (const [referenceType, prefix, ids] of checks) {
      if (!ids.length) continue
      // The marker is a hint on top of the history, so a failed read skips it
      // rather than taking the whole history down with it.
      let data: { reference_id: number }[]
      try {
        data = await fetchAllRowsForIds(ids, (batch) => supabase.from('journal_entries')
          .select('id, reference_id').eq('reference_type', referenceType).eq('status', 'reversed')
          .in('reference_id', batch).order('id', { ascending: true }))
      } catch (err) {
        console.warn('flagLedgerReversals: could not read reversed entries:', getErrorMessage(err))
        continue
      }
      const reversed = new Set(data.map((e) => e.reference_id as number))
      for (const m of movements) {
        if (m.key.startsWith(prefix) && reversed.has(Number(m.key.slice(prefix.length)))) m.ledgerReversed = true
      }
    }
  }

  // Newest request wins. Open account A, close it, open B before A's reads
  // finish: without this, A's late answer lands under B's header and the
  // variance check compares B's card with A's movements.
  let historyRequest = 0

  async function fetchCashAccountHistory(account: AccountLike) {
    const request = ++historyRequest
    loading.value = true
    error.value = null
    history.value = null
    try {
      const id = account.id
      // Paged: a busy account (Cash on Hand takes every collection and
      // remittance) passes PostgREST's row cap, which cuts a response off
      // without an error — and a short history shows a false variance.
      const [direct, funding, collections, rebates, bookLines] = await Promise.all([
        fetchAllRows(() => supabase.from('transactions')
          .select('id, transaction_type, status, total_amount, created_at, paid_at, approved_at, reference_no, expense_no, remittance_no, remarks, finance_details(paid_to, category), remittance_details(actual_amount)')
          .eq('cash_account_id', id)
          .in('transaction_type', ['expense', 'supplier_payment', 'remittance', 'bank_deposit', 'fund_transfer', 'petty_cash_replenishment'])
          .order('id', { ascending: true })),
        fetchAllRows(() => supabase.from('transactions')
          .select('id, transaction_type, status, total_amount, created_at, paid_at, approved_at, reference_no, remarks')
          .eq('funding_account_id', id)
          .in('transaction_type', ['bank_deposit', 'fund_transfer', 'petty_cash_replenishment'])
          .order('id', { ascending: true })),
        fetchAllRows(() => supabase.from('collections')
          .select('id, created_at, amount, reference_no, payment_method, voided_at')
          .eq('cash_account_id', id)
          .order('id', { ascending: true })),
        fetchAllRows(() => supabase.from('ethical_details')
          .select('id, rebate_amount, rebate_paid_at, rebate_reference, rebate_paid_to')
          .eq('rebate_cash_account_id', id)
          .eq('rebate_status', 'paid')
          .order('id', { ascending: true })),
        fetchAllRows(() => supabase.from('journal_entry_lines')
          .select('id, debit, credit, entry:journal_entry_id(entry_no, entry_date, status, description, created_at)')
          .like('line_memo', `Cash account #${id} —%`)
          .order('id', { ascending: true })),
      ])

      const movements: Omit<CashMovement, 'runningBalance'>[] = []
      const push = (m: Omit<CashMovement, 'runningBalance'>) => movements.push(m)

      if (money(account.opening_balance) !== 0) {
        push({
          key: 'opening', date: dateOf(account.created_at), recordedAt: account.created_at ?? '',
          source: 'Opening balance', reference: null, description: 'Balance when the account was opened',
          moneyIn: Math.max(money(account.opening_balance), 0), moneyOut: Math.max(-money(account.opening_balance), 0),
          voided: false,
        })
      }

      for (const t of direct) {
        const details = (Array.isArray(t.finance_details) ? t.finance_details[0] : t.finance_details) as { paid_to?: string | null } | null
        const remit = (Array.isArray(t.remittance_details) ? t.remittance_details[0] : t.remittance_details) as { actual_amount?: number | null } | null
        const voided = t.status === 'voided'
        if (t.transaction_type === 'expense') {
          push({
            key: `tx-${t.id}`, date: dateOf(t.paid_at ?? t.created_at), recordedAt: t.created_at,
            source: 'Expense', reference: t.expense_no ?? t.reference_no,
            description: [details?.paid_to, t.remarks].filter(Boolean).join(' — ') || 'Expense',
            moneyIn: 0, moneyOut: money(t.total_amount), voided,
          })
        } else if (t.transaction_type === 'supplier_payment') {
          push({
            key: `tx-${t.id}`, date: dateOf(t.paid_at ?? t.created_at), recordedAt: t.created_at,
            source: 'Supplier payment', reference: t.reference_no, description: t.remarks || 'Supplier payment',
            moneyIn: 0, moneyOut: money(t.total_amount), voided,
          })
        } else if (t.transaction_type === 'remittance') {
          // What physically arrived, not what was expected — the same figure
          // submitRemittance credits.
          push({
            key: `tx-${t.id}`, date: dateOf(t.created_at), recordedAt: t.created_at,
            source: 'Remittance', reference: t.remittance_no ?? t.reference_no, description: t.remarks || 'Sales remittance',
            moneyIn: money(remit?.actual_amount ?? t.total_amount), moneyOut: 0, voided,
          })
        } else if (t.transaction_type === 'bank_deposit') {
          push({
            key: `tx-${t.id}`, date: dateOf(t.paid_at ?? t.created_at), recordedAt: t.created_at,
            source: 'Deposit in', reference: t.reference_no, description: t.remarks || 'Bank deposit',
            moneyIn: money(t.total_amount), moneyOut: 0, voided,
          })
        } else if (t.transaction_type === 'fund_transfer') {
          push({
            key: `tx-${t.id}`, date: dateOf(t.paid_at ?? t.created_at), recordedAt: t.created_at,
            source: 'Transfer in', reference: t.reference_no, description: t.remarks || 'Transfer from another account',
            moneyIn: money(t.total_amount), moneyOut: 0, voided,
          })
        } else if (t.transaction_type === 'petty_cash_replenishment' && t.status === 'approved') {
          // Pending and rejected requests never moved any money.
          push({
            key: `tx-${t.id}`, date: dateOf(t.approved_at ?? t.created_at), recordedAt: t.created_at,
            source: 'Replenishment', reference: t.reference_no, description: t.remarks || 'Petty cash replenished',
            moneyIn: money(t.total_amount), moneyOut: 0, voided: false,
          })
        }
      }

      for (const t of funding) {
        if (t.transaction_type === 'petty_cash_replenishment' && t.status !== 'approved') continue
        const isDeposit = t.transaction_type === 'bank_deposit'
        const isTransfer = t.transaction_type === 'fund_transfer'
        push({
          key: `fund-${t.id}`,
          date: dateOf(isDeposit || isTransfer ? (t.paid_at ?? t.created_at) : (t.approved_at ?? t.created_at)),
          recordedAt: t.created_at,
          source: isTransfer ? 'Transfer out' : isDeposit ? 'Deposit out' : 'Funded replenishment',
          reference: t.reference_no,
          description: t.remarks || (isDeposit || isTransfer ? 'Moved to another account' : 'Replenished a petty cash fund'),
          moneyIn: 0, moneyOut: money(t.total_amount), voided: t.status === 'voided',
        })
      }

      for (const c of collections) {
        push({
          key: `col-${c.id}`, date: dateOf(c.created_at), recordedAt: c.created_at,
          source: 'Collection', reference: c.reference_no,
          description: c.payment_method ? `Customer payment (${c.payment_method})` : 'Customer payment',
          moneyIn: money(c.amount), moneyOut: 0, voided: !!c.voided_at,
        })
      }

      for (const r of rebates) {
        push({
          key: `reb-${r.id}`, date: dateOf(r.rebate_paid_at), recordedAt: r.rebate_paid_at ?? '',
          source: 'Rebate payout', reference: r.rebate_reference,
          description: r.rebate_paid_to ? `Rebate paid to ${r.rebate_paid_to}` : 'Rebate paid',
          moneyIn: 0, moneyOut: money(r.rebate_amount), voided: false,
        })
      }

      for (const line of bookLines) {
        const entry = (Array.isArray(line.entry) ? line.entry[0] : line.entry) as
          { entry_no: string | null; entry_date: string; status: string; description: string | null; created_at: string } | null
        if (!entry || entry.status === 'draft') continue
        push({
          key: `je-${line.id}`, date: dateOf(entry.entry_date), recordedAt: entry.created_at,
          source: 'Recorded transaction', reference: entry.entry_no, description: entry.description || 'Ledger entry',
          moneyIn: money(line.debit), moneyOut: money(line.credit), voided: false,
        })
      }

      await flagLedgerReversals(movements)
      if (request !== historyRequest) return null

      // Oldest first to accumulate, so each row carries the balance AS AT it.
      movements.sort((a, b) => a.date.localeCompare(b.date) || a.recordedAt.localeCompare(b.recordedAt))
      let running = 0
      let totalIn = 0
      let totalOut = 0
      const withBalance = movements.map((m) => {
        if (!m.voided) {
          running += m.moneyIn - m.moneyOut
          totalIn += m.moneyIn
          totalOut += m.moneyOut
        }
        return { ...m, runningBalance: running }
      })

      history.value = { movements: withBalance, totalIn, totalOut, computedBalance: running }
      return history.value
    } catch (err) {
      if (request !== historyRequest) return null
      error.value = getErrorMessage(err)
      console.error('fetchCashAccountHistory failed:', err)
      return null
    } finally {
      if (request === historyRequest) loading.value = false
    }
  }

  return { history, loading, error, adjustCashAccountBalance, fetchCashAccountHistory }
})
