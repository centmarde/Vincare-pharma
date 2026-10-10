// Opening balances: drafts one balanced journal entry that brings each balance
// sheet account to its stated target, plugging the difference to Opening
// Balance Equity.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { openingBalanceEquityCode } from './types'
import type { JournalLineInput, OpeningBalanceInput } from './types'
import { accounts, error, loading, handleError, clearError } from './state'
import { fetchAccounts } from './accounts'
import { postManualEntry } from './journal'
import { fetchTrialBalance } from './statements'

const toast = useToast()

// Resolved lazily rather than at import time: a store factory called while
// this module is first evaluated can run before Pinia is installed.
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())

/**
 * Draft opening balances for the balance sheet as ONE balanced journal entry.
 *
 * The entry is created as a DRAFT and reaches the ledger only once a manager
 * approves it in General Journal — manual entries may not post themselves.
 *
 * Why this exists: the accountant found the General Journal impractical for
 * this, because every line has to be paired with its own contra. Here they
 * state what each account should read and the contra is derived once, for
 * the whole sheet, into `openingBalanceEquityCode`. Double-entry is intact —
 * this posts a single balanced multi-line entry through the same
 * postJournalEntry path as everything else.
 *
 * `target` is the balance the account should END UP with, not a movement.
 * Each line posts only the DIFFERENCE from what the ledger already holds,
 * which makes the screen safe to re-run: posting the same targets twice
 * produces no second entry instead of doubling the balance sheet. It also
 * means the cash accounts, whose opening balances createCashAccount already
 * booked, need no special-casing — they're simply already at target.
 *
 * Amounts sit on each account's own normal side, so contra accounts behave
 * without the caller thinking about it: a positive target on 1590
 * Accumulated Depreciation is a CREDIT because that account's normal balance
 * is credit. A negative target posts to the opposite side.
 */
export async function postOpeningBalances(payload: {
  entryDate: string
  rows: OpeningBalanceInput[]
  description?: string
}) {
  loading.value = true
  clearError()
  try {
    const { user, error: authError } = await getAuthStore().getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return { success: false as const } }

    if (!accounts.value.length) await fetchAccounts()
    const byCode = new Map(accounts.value.map((a) => [a.code, a]))

    const equity = byCode.get(openingBalanceEquityCode)
    if (!equity) {
      toast.error(
        `Account ${openingBalanceEquityCode} (Opening Balance Equity) does not exist. `
        + 'Add it in Chart of Accounts before loading opening balances.',
      )
      return { success: false as const }
    }

    // Current balances come from the trial balance so this reconciles against
    // exactly what the Balance Sheet and Trial Balance pages show, rather
    // than a second balance computation that could disagree with them.
    const tb = await fetchTrialBalance(payload.entryDate)
    // fetchTrialBalance swallows its own errors and returns [], which is
    // indistinguishable from "every account sits at zero". Taken at face
    // value, every delta below becomes the FULL target instead of the gap,
    // and accounts that already carry a balance get posted a SECOND time —
    // the cash accounts createCashAccount booked among them. That is exactly
    // the re-runnable guarantee this function's doc comment makes, so it
    // must not be allowed to fail open. The store's error ref is the only
    // thing that separates the two cases; clearError() ran at the top of
    // this function, so anything set here came from the fetch.
    if (error.value) {
      toast.error('Could not read the current balances. Nothing was posted.')
      return { success: false as const }
    }
    const currentOf = (code: string) => {
      const row = tb.find((t) => t.account_code === code)
      if (!row) return 0
      const account = byCode.get(code)
      return account?.normal_balance === 'credit'
        ? Number(row.credit_balance ?? 0) - Number(row.debit_balance ?? 0)
        : Number(row.debit_balance ?? 0) - Number(row.credit_balance ?? 0)
    }

    const lines: JournalLineInput[] = []
    let sumDebit = 0
    let sumCredit = 0

    for (const row of payload.rows) {
      const account = byCode.get(row.account_code)
      if (!account) {
        toast.error(`Unknown account: ${row.account_code}`); return { success: false as const }
      }
      if (account.section !== 'balance_sheet') {
        toast.error(`${account.code} ${account.name} is not a balance sheet account.`)
        return { success: false as const }
      }
      if (account.code === openingBalanceEquityCode) continue

      // Only the gap gets posted; an account already at target contributes
      // no line at all.
      const delta = Number(row.target ?? 0) - currentOf(account.code)
      if (Math.abs(delta) < 0.01) continue

      const onNormalSide = delta > 0
      const debit = (account.normal_balance === 'debit') === onNormalSide
      const amount = Math.abs(delta)
      lines.push(debit
        ? { account_code: account.code, debit: amount, credit: 0 }
        : { account_code: account.code, debit: 0, credit: amount })
      if (debit) sumDebit += amount; else sumCredit += amount
    }

    if (!lines.length) {
      toast.info('Every account already matches its target — nothing to post.')
      return { success: false as const }
    }

    const plug = sumDebit - sumCredit
    if (Math.abs(plug) >= 0.01) {
      lines.push(plug > 0
        ? { account_code: openingBalanceEquityCode, debit: 0, credit: plug }
        : { account_code: openingBalanceEquityCode, debit: -plug, credit: 0 })
    } else if (lines.length < 2) {
      // A single line that needs no plug cannot be posted: an entry needs at
      // least two lines, and one line alone is by definition unbalanced.
      toast.error('That change cannot be posted on its own — it needs an offsetting account.')
      return { success: false as const }
    }

    // The description always CARRIES the "Opening balances" prefix, even when
    // the accountant writes their own note. It is what makes a pending
    // opening-balance draft findable: postManualEntry stores every manual
    // entry as reference_type 'manual' with a null reference_id, so there is
    // nothing else to tell one apart from an ordinary journal entry.
    const description = payload.description?.trim()
      ? `Opening balances — ${payload.description.trim()}`
      : 'Opening balances'

    // A draft is NOT in the ledger, so the trial balance read above still
    // reports pre-draft figures. Submitting the same sheet twice therefore
    // produces two drafts carrying identical lines, and approving both posts
    // every delta twice — breaking the re-runnable guarantee this function's
    // doc comment makes, and in the one direction nobody notices until the
    // balance sheet stops tying.
    //
    // Scoped to opening-balance drafts on purpose: an unrelated manual entry
    // awaiting approval is a separate, deliberate entry, not a recomputed
    // delta, so blocking on that would be over-broad.
    const { data: pendingDrafts, error: pendingError } = await supabase
      .from('journal_entries')
      .select('id, entry_no')
      .eq('reference_type', 'manual')
      .eq('status', 'draft')
      .ilike('description', 'Opening balances%')
      .limit(1)
    if (pendingError) {
      handleError(pendingError, 'Failed to check for pending opening balances')
      toast.error('Could not check for a pending opening-balance draft. Nothing was drafted.')
      return { success: false as const }
    }
    const pending = (pendingDrafts ?? [])[0]
    if (pending) {
      toast.error(
        `${pending.entry_no ?? `Draft #${pending.id}`} is still awaiting approval. `
        + 'Approve or reject it before drafting opening balances again — otherwise both post and the balances move twice.',
      )
      return { success: false as const }
    }

    // DRAFTED, not posted. postJournalEntry inserts status:'posted'
    // directly, which is exactly the path postManualEntry exists to prevent:
    // the accounting directive requires a manual entry to be created as
    // 'draft' and approved before it reaches the ledger. Opening balances
    // move the whole balance sheet by arbitrary amounts, so they are the last
    // thing that should bypass that. Going through postManualEntry also
    // reuses its per-line active-account check and its balance check, and the
    // draft shows up in General Journal where approveManualEntry can post it.
    const result = await postManualEntry({
      entryDate: payload.entryDate,
      description,
      lines,
    })
    if (!result.success) return { success: false as const }
    toast.success(
      `Opening balances drafted (${lines.length} lines) — approve them in General Journal to post.`,
    )
    return { success: true as const, lineCount: lines.length }
  } catch (err) {
    handleError(err, 'Failed to post opening balances')
    return { success: false as const }
  } finally {
    loading.value = false
  }
}
