import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useGLDataStore, openingBalanceEquityCode } from '@/stores/glData'
import type { GLAccount, OpeningBalanceInput } from '@/stores/glData'

// Opening balances for the balance sheet.
//
// The accountant asked for "a manual entry into the balance sheet" because the
// General Journal makes them pair every line with its own contra, which is
// impractical for a whole opening sheet. A one-sided entry is not possible --
// it would break Assets = Liabilities + Equity, and both postManualEntry and
// the journal_entry_lines CHECK reject it -- so instead they state the target
// balance per account here and the contra is derived ONCE, for the whole
// sheet, into Opening Balance Equity.

const todayISO = () => new Date().toISOString().slice(0, 10)

/** Section headings, in balance sheet reading order. */
const sectionOrder = [
  'Current Assets',
  'Non-Current Assets',
  'Current Liabilities',
  'Non-Current Liabilities',
  'Equity',
] as const

/**
 * Accounts the screen never offers.
 *
 * 3030 Current Year Earnings is DERIVED from the income statement, never
 * posted to directly, so an opening balance typed against it would be
 * overwritten by the earnings link and wouldn't mean anything. Opening Balance
 * Equity is excluded because it IS the balancing figure.
 */
const excludedCodes = new Set<string>(['3030', openingBalanceEquityCode])

export type OpeningBalanceRow = {
  code: string
  name: string
  subsection: string
  normalBalance: GLAccount['normal_balance']
  /** What the ledger holds today, on the account's normal side. */
  current: number
  /** What the accountant says it should be; null = leave alone. */
  target: number | null
}

export function useOpeningBalances() {
  const glStore = useGLDataStore()
  const { loading } = storeToRefs(glStore)
  const toast = useToast()

  const entryDate = ref(todayISO())
  const description = ref('')
  const rows = ref<OpeningBalanceRow[]>([])
  const posting = ref(false)

  /** Whether the chart has the equity account this screen posts its plug to. */
  const equityAccountMissing = computed(
    () => !!rows.value.length && !glStore.accounts.some((a) => a.code === openingBalanceEquityCode),
  )

  async function load() {
    const [accounts, tb] = await Promise.all([
      glStore.fetchAccounts(),
      glStore.fetchTrialBalance(entryDate.value),
    ])

    // Keep whatever the user has already typed across a reload of the figures,
    // so changing the date doesn't silently wipe a half-filled sheet.
    const typed = new Map(rows.value.map((r) => [r.code, r.target]))

    rows.value = accounts
      .filter((a) => a.section === 'balance_sheet' && !excludedCodes.has(a.code))
      .map((a) => {
        const line = tb.find((t) => t.account_code === a.code)
        const debit = Number(line?.debit_balance ?? 0)
        const credit = Number(line?.credit_balance ?? 0)
        return {
          code: a.code,
          name: a.name,
          subsection: a.subsection,
          normalBalance: a.normal_balance,
          current: a.normal_balance === 'credit' ? credit - debit : debit - credit,
          target: typed.get(a.code) ?? null,
        }
      })
      .sort((a, b) => {
        const sa = sectionOrder.indexOf(a.subsection as typeof sectionOrder[number])
        const sb = sectionOrder.indexOf(b.subsection as typeof sectionOrder[number])
        if (sa !== sb) return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb)
        return a.code.localeCompare(b.code)
      })
  }

  /** Rows grouped under their section heading, for the table's group rows. */
  const groups = computed(() => {
    const out: { subsection: string; rows: OpeningBalanceRow[] }[] = []
    for (const row of rows.value) {
      const last = out[out.length - 1]
      if (last && last.subsection === row.subsection) last.rows.push(row)
      else out.push({ subsection: row.subsection, rows: [row] })
    }
    return out
  })

  /** What each row will actually move, on its normal side. Zero = no line. */
  const deltaFor = (row: OpeningBalanceRow) =>
    row.target === null ? 0 : Number(row.target) - row.current

  /** Only the rows that will produce a journal line. */
  const changedRows = computed(() => rows.value.filter((r) => Math.abs(deltaFor(r)) >= 0.01))

  /**
   * The balancing figure, shown live so the accountant sees what will land in
   * Opening Balance Equity before committing — the whole point of using a
   * visible suspense account rather than plugging into Owner's Capital.
   *
   * Positive = a net debit across the sheet, so equity is CREDITED.
   */
  const plug = computed(() =>
    changedRows.value.reduce((total, row) => {
      const delta = deltaFor(row)
      // A debit-normal account moving up is a debit; a credit-normal account
      // moving up is a credit. Same rule the store applies when it posts.
      return total + (row.normalBalance === 'debit' ? delta : -delta)
    }, 0),
  )

  const blockers = computed(() => {
    const missing: string[] = []
    if (!entryDate.value) missing.push('a date')
    if (!changedRows.value.length) missing.push('at least one account that differs from its current balance')
    if (equityAccountMissing.value) {
      missing.push(`account ${openingBalanceEquityCode} (Opening Balance Equity) to exist in Chart of Accounts`)
    }
    return missing
  })

  const canSubmit = computed(() => blockers.value.length === 0 && !posting.value)

  function clearTargets() {
    for (const row of rows.value) row.target = null
  }

  /** Prefill every blank target with its current balance, so the accountant
   *  edits only what changes rather than retyping the sheet. */
  function fillFromCurrent() {
    for (const row of rows.value) if (row.target === null) row.target = row.current
  }

  async function submit() {
    if (!canSubmit.value) return { success: false }
    posting.value = true
    try {
      const payload: OpeningBalanceInput[] = changedRows.value.map((r) => ({
        account_code: r.code,
        target: Number(r.target),
      }))
      const result = await glStore.postOpeningBalances({
        entryDate: entryDate.value,
        rows: payload,
        description: description.value,
      })
      if (result.success) {
        description.value = ''
        clearTargets()
        // Re-read so the CURRENT column reflects what was just posted and the
        // screen is immediately safe to use again.
        await load()
      }
      return result
    } catch {
      toast.error('Failed to post opening balances.')
      return { success: false }
    } finally {
      posting.value = false
    }
  }

  onMounted(load)

  return {
    loading, posting,
    entryDate, description, rows, groups,
    deltaFor, changedRows, plug,
    equityAccountMissing, openingBalanceEquityCode,
    blockers, canSubmit,
    load, submit, clearTargets, fillFromCurrent,
  }
}
