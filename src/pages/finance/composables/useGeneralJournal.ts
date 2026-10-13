import { ref, computed, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import { useGLDataStore } from '@/stores/glData'
import type { GLAccount, ReferenceType, JournalLineInput } from '@/stores/glData'
import { useFormDraft } from '@/composables/useFormDraft'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { formatCurrency, toLocalISODate } from '@/utils/helpers'
import { useCashAccountLedgerStore, parseCashLineMemo } from '@/stores/cashAccountLedgerData'
import type { JournalEntry } from '@/stores/glData'

const toast = useToast()
const { confirmDialog } = useConfirmDialog()

/** A Vuetify autocomplete item: a subsection heading or a selectable account. */
export type AccountOption = { type: 'subheader'; title: string } | { title: string; value: string }

// Mirrors Vuetify's FilterMatch: false hides the item, true keeps it, and
// [start, end] ranges keep it with those characters highlighted.
type FilterMatch = boolean | [number, number][]

const REFERENCE_TYPE_OPTIONS: { value: ReferenceType; title: string }[] = [
  { value: 'sales_invoice', title: 'Sales Invoice' },
  { value: 'sales_return', title: 'Sales Return' },
  { value: 'goods_return', title: 'Customer Return' },
  { value: 'payment', title: 'Payment' },
  { value: 'collection', title: 'Collection' },
  { value: 'purchase_invoice', title: 'Purchase Invoice' },
  { value: 'disbursement', title: 'Disbursement' },
  { value: 'manual', title: 'Manual' },
  { value: 'closing', title: 'Closing' },
]

export function useGeneralJournal() {
  const gl = useGLDataStore()

  const filterFrom = ref('')
  const filterTo = ref('')
  const filterReferenceType = ref<ReferenceType | null>(null)

  const entries = computed(() => gl.journal)
  const loading = computed(() => gl.loading)
  // Every active account as a searchable item, grouped under its subsection
  // heading. Grouped by subsection (ordered by each one's lowest code) rather
  // than by runs of codes, so an account added out of range never repeats a
  // heading. The code stays in the title: accountants search by it.
  const accountOptions = computed<AccountOption[]>(() => {
    const groups = new Map<string, GLAccount[]>()
    for (const account of [...gl.accounts].sort((a, b) => a.code.localeCompare(b.code))) {
      const group = groups.get(account.subsection) ?? []
      group.push(account)
      groups.set(account.subsection, group)
    }
    const options: AccountOption[] = []
    for (const [subsection, accounts] of groups) {
      options.push({ type: 'subheader', title: subsection })
      for (const a of accounts) options.push({ title: `${a.code} — ${a.name}`, value: a.code })
    }
    return options
  })

  /**
   * Predictive account search: every word typed must appear somewhere in
   * "code — name", in any order, so "1020", "cash", "cash bank" and "acc rec"
   * all find what they mean. Returns the match ranges so each word is
   * highlighted in the list.
   */
  function filterAccount(value: string, query: string): FilterMatch {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return true
    const title = String(value ?? '').toLowerCase()
    const ranges: [number, number][] = []
    for (const word of words) {
      const start = title.indexOf(word)
      if (start === -1) return false
      ranges.push([start, start + word.length])
    }
    // Sorted and merged, so overlapping words ("cash ca") highlight once.
    ranges.sort((a, b) => a[0] - b[0])
    const merged: [number, number][] = []
    for (const range of ranges) {
      const last = merged[merged.length - 1]
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
      else merged.push([range[0], range[1]])
    }
    return merged
  }

  const showManualEntryDialog = ref(false)
  // Local date — toISOString() gives the UTC date, a day behind before 08:00 in Manila.
  const manualEntryDate = ref(toLocalISODate(new Date()))
  const manualDescription = ref('')
  const manualLines = ref<JournalLineInput[]>([
    { account_code: '', debit: 0, credit: 0 },
    { account_code: '', debit: 0, credit: 0 },
  ])

  // Persist a draft so a reload / crash mid-entry doesn't wipe the journal entry.
  // manualEntryDate defaults to today, so it isn't part of the "touched" check.
  const manualDraft = useFormDraft({
    key: 'finance-manual-journal-entry',
    version: 1,
    refs: { manualEntryDate, manualDescription, manualLines },
    isEmpty: () => !manualDescription.value
      && !manualLines.value.some((l) => l.account_code || l.debit > 0 || l.credit > 0),
  })

  const manualTotalDebit = computed(() => manualLines.value.reduce((s, l) => s + (l.debit || 0), 0))
  const manualTotalCredit = computed(() => manualLines.value.reduce((s, l) => s + (l.credit || 0), 0))
  const manualIsBalanced = computed(() =>
    manualTotalDebit.value > 0 && Math.abs(manualTotalDebit.value - manualTotalCredit.value) < 0.01)

  function addManualLine() {
    manualLines.value.push({ account_code: '', debit: 0, credit: 0 })
  }
  function removeManualLine(idx: number) {
    if (manualLines.value.length > 2) manualLines.value.splice(idx, 1)
  }

  async function init() {
    // Restore any in-progress manual journal entry from a previous session.
    manualDraft.restore()
    await Promise.all([gl.fetchAccounts(), fetchJournal()])
  }

  async function fetchJournal() {
    await gl.fetchJournal({
      from: filterFrom.value || undefined,
      to: filterTo.value || undefined,
      referenceType: filterReferenceType.value ?? undefined,
    })
  }

  async function submitManualEntry() {
    if (!manualIsBalanced.value) { toast.warning('Debits must equal credits before posting.'); return }
    const lines = manualLines.value.filter((l) => l.account_code && (l.debit > 0 || l.credit > 0))
    if (lines.length < 2) { toast.warning('A journal entry needs at least 2 lines.'); return }

    const result = await gl.postManualEntry({
      entryDate: manualEntryDate.value,
      description: manualDescription.value || undefined,
      lines,
    })
    if (result.success) {
      manualDraft.clear()
      showManualEntryDialog.value = false
      manualDescription.value = ''
      manualLines.value = [
        { account_code: '', debit: 0, credit: 0 },
        { account_code: '', debit: 0, credit: 0 },
      ]
      await fetchJournal()
    }
  }

  async function approveEntry(entryId: number) {
    const result = await gl.approveManualEntry(entryId)
    if (result.success) await fetchJournal()
  }

  const cashLedger = useCashAccountLedgerStore()

  /**
   * The cash accounts an entry moved and by how much (positive = money in),
   * read from the labels Record Transaction puts on its cash lines. Empty for
   * any other entry — those have no cash account recorded against them.
   */
  function cashMovesOf(entry: JournalEntry) {
    const moves = new Map<number, { id: number; name: string; delta: number }>()
    for (const line of entry.lines ?? []) {
      const account = parseCashLineMemo(line.line_memo)
      if (!account) continue
      const move = moves.get(account.id) ?? { ...account, delta: 0 }
      move.delta += line.debit - line.credit
      moves.set(account.id, move)
    }
    return [...moves.values()].filter((move) => Math.abs(move.delta) > 0.005)
  }

  async function reverseEntry(entryId: number) {
    // Reversing here corrects the LEDGER only. An entry that came from a live
    // document is refused rather than warned about: the warning existed and was
    // clicked through anyway, which is how SP-2026-001 ended up paid in the
    // register and the cash account but unpaid in the ledger. Voiding the
    // document instead reverses this entry AND puts the document and its cash
    // back, so all three stay in step.
    const entry = entries.value.find((e) => e.id === entryId)
    if (entry) {
      const impact = await gl.describeReversalImpact(entry)
      if (impact) {
        toast.warning(
          `This entry came from ${impact.docNo}, which is still ${impact.status}. `
          + 'Reversing it here would change the ledger only — the document and any cash it '
          + 'moved would stay as they are. Void the document from its own page instead; '
          + 'that reverses this entry too.',
          { timeout: 12000 },
        )
        return
      }
    }

    // A Record Transaction entry also moved a cash account's balance when it
    // posted. Reversing only the ledger used to leave that balance moved, so
    // the account card disagreed with the ledger from then on. Say so up
    // front, and move it back once the reversal posts.
    const moves = entry ? cashMovesOf(entry) : []
    let message = 'Reverse this entry? A mirror entry will be posted; the original cannot be edited.'
    for (const move of moves) {
      message += move.delta > 0
        ? `\n\nThis also takes ${formatCurrency(move.delta)} back out of ${move.name}.`
        : `\n\nThis also puts ${formatCurrency(-move.delta)} back into ${move.name}.`
    }
    if (!(await confirmDialog(message, { title: 'Confirm Reversal', confirmText: 'Reverse Entry' }))) return
    const result = await gl.reverseEntry(entryId)
    if (!result.success) return

    // Best-effort after the ledger reversal (JS-over-RPC convention): reported,
    // not rolled back, and visible as a mismatch on the Cash Accounts page.
    for (const move of moves) {
      const adjusted = await cashLedger.adjustCashAccountBalance(move.id, -move.delta)
      if (!adjusted.success) {
        toast.warning(`Entry reversed, but ${move.name}'s balance could not be updated: ${adjusted.error}`)
      }
    }
    await fetchJournal()
  }

  async function resyncLedger() {
    const count = await gl.projectEvents({
      from: filterFrom.value || undefined,
      to: filterTo.value || undefined,
    })
    toast.success(count > 0 ? `Posted ${count} new entr${count === 1 ? 'y' : 'ies'}.` : 'Ledger is already up to date.')
    await fetchJournal()
  }

  onMounted(init)

  return {
    filterFrom, filterTo, filterReferenceType, REFERENCE_TYPE_OPTIONS,
    entries, loading, accountOptions, filterAccount,
    showManualEntryDialog, manualEntryDate, manualDescription, manualLines,
    manualTotalDebit, manualTotalCredit, manualIsBalanced,
    addManualLine, removeManualLine,
    fetchJournal, submitManualEntry, approveEntry, reverseEntry, resyncLedger,
  }
}
