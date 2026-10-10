import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useGLDataStore } from '@/stores/glData'
import { useAuthUserStore } from '@/stores/authUser'
import { useFinanceDataStore, glAccountCodeFor } from '@/stores/financeData'
import { useCashAccountLedgerStore, cashLineMemo } from '@/stores/cashAccountLedgerData'
import { bookTemplateById, bookTemplateGroups } from '@/utils/bookTemplates'
import { formatCurrency, toLocalISODate } from '@/utils/helpers'
import type { BookField, BookLine, BookTemplate } from '@/utils/bookTemplates'

// Books entry — record the transactions that have no operational screen.
//
// The accountant keeps physical books and found the General Journal
// impractical: it makes him construct both sides of an entry by hand for
// transactions that are always the same two accounts. A template supplies the
// structure (the equivalent of a column in a special journal), he fills in
// amounts, and the entry cannot come out unbalanced.
//
// The preview is not decoration. He is used to seeing the debits and credits
// in his book, so the screen shows exactly what will post before he commits —
// the templates remove the typing, not the visibility.

// toLocalISODate, not toISOString(): the latter returns the UTC calendar
// date, so at UTC+8 anything recorded before 08:00 local defaults to
// YESTERDAY — and on the 1st of a month lands in the previous month, after
// that month may already have been reported.
const todayISO = () => toLocalISODate(new Date())

export function useBookEntry() {
  const glStore = useGLDataStore()
  const financeStore = useFinanceDataStore()
  const cashLedger = useCashAccountLedgerStore()
  const authStore = useAuthUserStore()
  const toast = useToast()
  const { accounts } = storeToRefs(glStore)
  const { cashAccounts } = storeToRefs(financeStore)

  const templateId = ref<string | null>(null)
  const entryDate = ref(todayISO())
  const description = ref('')
  const amounts = ref<Record<string, number | null>>({})
  const codes = ref<Record<string, string | null>>({})
  /**
   * The cash ACCOUNT picked for each cashAccount field, by id — kept apart from
   * `codes` because several accounts share one GL code (every bank account is
   * 1020). Keyed by GL code, picking BDO VP 2290 selected all five banks at
   * once, and nothing could say which one the money went into.
   */
  const cashIds = ref<Record<string, number | null>>({})
  const posting = ref(false)

  const groups = bookTemplateGroups()
  const template = computed<BookTemplate | null>(() =>
    templateId.value ? bookTemplateById(templateId.value) : null)

  /** Cash accounts to pick from, one choice per account. */
  const cashOptions = computed(() =>
    cashAccounts.value
      .filter((a) => a.is_active)
      .map((a) => ({
        value: a.id,
        title: a.name,
        // glAccountCodeFor is the ONLY resolver for this — never re-inline the
        // classification map, it has drifted twice before.
        subtitle: `${accounts.value.find((g) => g.code === glAccountCodeFor(a))?.name ?? glAccountCodeFor(a)}`
          + ` · ${formatCurrency(a.balance ?? 0)}`,
      })),
  )

  /**
   * Stands in for a cash field's GL code while the template builds its lines,
   * so each line can be traced back to the account it moves even when two
   * accounts share a GL code. Swapped for the real code before display/post.
   */
  const cashToken = (fieldKey: string) => `cash-account:${fieldKey}`

  /** Chart accounts a given `account` field may offer, per its code range. */
  const accountOptionsFor = (field: BookField) =>
    accounts.value
      .filter((a) => {
        if (!field.accountFilter) return true
        return a.code >= field.accountFilter.from && a.code <= field.accountFilter.to
      })
      .map((a) => ({ value: a.code, title: `${a.code} — ${a.name}` }))

  /** Reset the form whenever a different template is picked. */
  watch(template, (next) => {
    amounts.value = {}
    codes.value = {}
    cashIds.value = {}
    description.value = next?.description ?? ''
    for (const field of next?.fields ?? []) {
      if (field.kind === 'account' && field.defaultCode) codes.value[field.key] = field.defaultCode
    }
  })

  const accountName = (code: string) =>
    accounts.value.find((a) => a.code === code)?.name ?? code

  /**
   * The lines this entry will post, or [] while the form is incomplete.
   *
   * Built through the template's own `build`, the same function the submit
   * path uses, so the preview can never show something different from what
   * posts.
   */
  const builtLines = computed<BookLine[]>(() => {
    const t = template.value
    if (!t) return []
    const filledAmounts: Record<string, number> = {}
    for (const field of t.fields) {
      if (field.kind !== 'amount') continue
      const value = Number(amounts.value[field.key] ?? 0)
      if (!field.optional && !(value > 0)) return []
      filledAmounts[field.key] = Number.isFinite(value) ? value : 0
    }
    const filledCodes: Record<string, string> = {}
    for (const field of t.fields) {
      if (field.kind === 'amount') continue
      if (field.kind === 'cashAccount') {
        if (cashIds.value[field.key] == null) return []
        filledCodes[field.key] = cashToken(field.key)
        continue
      }
      const code = codes.value[field.key]
      if (!code) return []
      filledCodes[field.key] = code
    }
    try {
      return t.build({ amounts: filledAmounts, codes: filledCodes })
    } catch {
      return []
    }
  })

  /** Each picked cash account by field key. */
  const pickedCash = computed(() => {
    const picked: Record<string, (typeof cashAccounts.value)[number]> = {}
    for (const [key, id] of Object.entries(cashIds.value)) {
      const account = cashAccounts.value.find((a) => a.id === id)
      if (account) picked[key] = account
    }
    return picked
  })

  /**
   * The lines with each cash token resolved to that account's real GL code.
   * A cash line also carries a memo naming the account — book entries have no
   * document of their own, so it is the only record of which account the
   * money went through, and what the account's history reads back.
   */
  const lines = computed<(BookLine & { memo?: string })[]>(() =>
    builtLines.value.map((line) => {
      const key = line.account_code.startsWith('cash-account:')
        ? line.account_code.slice('cash-account:'.length)
        : null
      const account = key ? pickedCash.value[key] : undefined
      return account
        ? { ...line, account_code: glAccountCodeFor(account), memo: cashLineMemo(account.id, account.name) }
        : line
    }),
  )

  /**
   * What the entry does to each picked cash account's balance — shown before
   * posting, and applied to the account after it posts.
   */
  const cashMovements = computed(() =>
    Object.entries(pickedCash.value).map(([key, account]) => {
      const delta = builtLines.value
        .filter((line) => line.account_code === cashToken(key))
        .reduce((sum, line) => sum + line.debit - line.credit, 0)
      const before = account.balance ?? 0
      return { fieldKey: key, id: account.id, name: account.name, before, delta, after: before + delta }
    }),
  )

  const totalDebit = computed(() => lines.value.reduce((s, l) => s + l.debit, 0))
  const totalCredit = computed(() => lines.value.reduce((s, l) => s + l.credit, 0))
  const isBalanced = computed(() => Math.abs(totalDebit.value - totalCredit.value) < 0.01)

  /**
   * A template can produce a negative line from a legitimate-looking form —
   * payroll deductions exceeding gross pay is the realistic case. The store
   * would reject it, but only after the user hits post, so catch it here.
   */
  const hasNegativeLine = computed(() => lines.value.some((l) => l.debit < 0 || l.credit < 0))

  const blockers = computed(() => {
    const missing: string[] = []
    if (!template.value) return ['a transaction type']
    if (!entryDate.value) missing.push('a date')
    if (!lines.value.length) missing.push('every required field filled in')
    else if (hasNegativeLine.value) {
      missing.push('figures that do not produce a negative amount (check the deductions)')
    } else if (!isBalanced.value) {
      // Defensive: a template whose build() does not balance is a bug, not
      // user error. Surfacing it beats posting something wrong.
      missing.push('a balanced entry — this template looks miscoded, please report it')
    } else if (lines.value.length < 2) {
      missing.push('at least two accounts')
    }
    for (const move of cashMovements.value) {
      if (move.after < -0.005) missing.push(`an amount within ${move.name}'s balance`)
    }
    return missing
  })

  const canSubmit = computed(() => blockers.value.length === 0 && !posting.value)

  async function load() {
    await Promise.all([glStore.fetchAccounts(), financeStore.fetchCashAccounts()])
  }

  function reset() {
    templateId.value = null
    entryDate.value = todayISO()
    description.value = ''
    amounts.value = {}
    codes.value = {}
    cashIds.value = {}
  }

  async function submit() {
    const t = template.value
    if (!canSubmit.value || !t) return { success: false }
    posting.value = true
    try {
      const { user, error: authError } = await authStore.getCurrentUser()
      if (authError || !user) {
        toast.error('User not authenticated.')
        return { success: false }
      }
      const result = await glStore.postJournalEntry(
        entryDate.value,
        t.referenceType,
        null,
        description.value.trim() || t.description,
        lines.value.map((l) => ({ account_code: l.account_code, debit: l.debit, credit: l.credit, memo: l.memo })),
        user.id,
      )
      if (!result.success) {
        toast.error(result.error || 'Failed to record the transaction.')
        return { success: false }
      }
      toast.success(`${t.title} recorded.`)
      // Then move the account's own balance, so its card and the voucher funds
      // check see the money. Best-effort after the ledger post (JS-over-RPC
      // convention): a failure here is reported, not rolled back, and shows up
      // as a variance on the Cash Accounts page.
      const moves = cashMovements.value.filter((move) => Math.abs(move.delta) > 0.005)
      for (const move of moves) {
        const adjusted = await cashLedger.adjustCashAccountBalance(move.id, move.delta)
        if (!adjusted.success) {
          toast.warning(`Recorded in the ledger, but ${move.name}'s balance could not be updated: ${adjusted.error}`)
        }
      }
      if (moves.length) await financeStore.fetchCashAccounts()
      // Keep the template and date — an accountant working through a book
      // records several of the same kind in a row.
      amounts.value = {}
      description.value = t.description
      return { success: true }
    } finally {
      posting.value = false
    }
  }

  onMounted(load)

  return {
    groups, templateId, template,
    entryDate, description, amounts, codes, cashIds, posting,
    cashOptions, cashMovements, accountOptionsFor, accountName,
    lines, totalDebit, totalCredit, isBalanced,
    blockers, canSubmit,
    load, reset, submit,
  }
}
