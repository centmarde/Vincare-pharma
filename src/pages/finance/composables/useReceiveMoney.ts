import { ref, computed, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useBookEntry } from './useBookEntry'
import { useGLDataStore } from '@/stores/glData'
import { moneyReceivedBlockReason } from '@/utils/bookTemplates'
import { formatCurrency, toLocalISODate } from '@/utils/helpers'

// "Receive money" on the Cash Accounts page: money paid INTO one of our
// accounts by someone who is not paying an invoice — SSS or Pag-IBIG paying
// back, a refund, a grant.
//
// It is the Book Entry "Money received" template with the account already
// picked, not a second way of posting. The accountant asked for this to stay a
// debit/credit entry: the cash account is debited, he picks the account to
// credit, and the dialog shows the two lines before anything posts. Book Entry
// then moves the account's balance, exactly as it does for its other templates.
//
// Customer payments do NOT come in here — the template refuses Accounts
// Receivable — because they must be recorded on the order to reach the
// customer's statement.

export const moneyReceivedTemplateId = 'money_received'

/** Who usually pays the company back. Offered as you type; anyone else can be typed. */
export const commonPayors = ['SSS', 'Pag-IBIG', 'PhilHealth', 'BIR']

type PickOption = { value: string | number; title: string; subtitle?: string; code?: string }

/**
 * Search for the pickers: every word typed must appear in the code, the name
 * or the second line — so "cash adv emp", "1080" and "current liab" all work.
 */
export function matchesPick(_value: string, query: string, item?: { raw?: unknown }): boolean {
  const raw = (item?.raw ?? {}) as PickOption
  const haystack = `${raw.code ?? ''} ${raw.title ?? ''} ${raw.subtitle ?? ''}`.toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))
}

export function useReceiveMoney() {
  const entry = useBookEntry()
  const glStore = useGLDataStore()
  const { accounts } = storeToRefs(glStore)
  const { template, amounts, codes, cashIds, description, lines, cashMovements, accountName } = entry

  const receivedFrom = ref('')
  const reference = ref('')
  const note = ref('')
  /** What is typed into the Credit to search, to explain an empty result. */
  const creditSearch = ref('')

  /** No receiving money in the future. */
  const today = computed(() => toLocalISODate(new Date()))

  const creditField = computed(() => template.value?.fields.find((f) => f.key === 'creditAccount') ?? null)

  /** The accounts that can be credited, with their section as a second line. */
  const creditOptions = computed<PickOption[]>(() => {
    if (!creditField.value) return []
    return entry.accountOptionsFor(creditField.value).map((option) => {
      const account = accounts.value.find((a) => a.code === option.value)
      return { value: option.value, code: option.value, title: account?.name ?? option.title, subtitle: account?.subsection }
    })
  })

  const suggestions = computed(() => (creditField.value ? entry.suggestionsFor(creditField.value) : []))

  /**
   * When the search finds nothing because the account is one this cannot
   * credit, say which and why — "No data available" reads like a bug.
   */
  const creditNoData = computed(() => {
    const query = creditSearch.value?.trim()
    if (!query) return 'No matching account'
    const blocked = accounts.value.find((a) =>
      moneyReceivedBlockReason(a.code) && matchesPick('', query, { raw: { code: a.code, title: a.name, subtitle: a.subsection } }))
    return blocked
      ? `${blocked.code} ${blocked.name} can't be credited here. ${moneyReceivedBlockReason(blocked.code)}`
      : 'No matching account'
  })

  const creditCode = computed({
    get: () => codes.value.creditAccount ?? null,
    set: (code: string | null) => { codes.value = { ...codes.value, creditAccount: code } },
  })

  const amount = computed({
    get: () => amounts.value.amount ?? 0,
    set: (value: number) => { amounts.value = { ...amounts.value, amount: value } },
  })

  const pickedSuggestion = computed(() => suggestions.value.find((s) => s.code === creditCode.value) ?? null)

  /** When the picked account is one of the quick choices, what it means. */
  const creditHint = computed(() => pickedSuggestion.value?.hint ?? '')

  /**
   * The cash account being paid into, with its balance before and after. Known
   * as soon as the account and amount are — money received always adds the
   * amount to it — so it shows before the rest of the form is filled in.
   */
  const movement = computed(() => {
    const move = cashMovements.value.find((m) => m.fieldKey === 'cash')
    if (!move) return null
    const delta = amount.value > 0 ? amount.value : 0
    return { ...move, delta, after: move.before + delta }
  })

  const receivedIntoOptions = entry.cashOptions

  /**
   * The journal entry's description: who paid, their reference, and the note.
   * A book entry has no document of its own, so this line is the record of
   * where the money came from.
   */
  const composedDescription = computed(() =>
    [
      receivedFrom.value?.trim() && `Received from ${receivedFrom.value.trim()}`,
      reference.value?.trim() && `ref ${reference.value.trim()}`,
      note.value?.trim(),
    ].filter(Boolean).join(' · ') || 'Money received')

  const dateInFuture = computed(() => !!entry.entryDate.value && entry.entryDate.value > today.value)

  const blockers = computed(() => {
    const missing: string[] = []
    if (cashIds.value.cash == null) missing.push('the account it was received into')
    if (!(amount.value > 0)) missing.push('an amount')
    if (!receivedFrom.value?.trim()) missing.push('who the money is from')
    if (!creditCode.value) missing.push('what it is for')
    if (dateInFuture.value) missing.push('a date that is not in the future')
    // The template's own checks (date, balanced lines, ...), minus the generic
    // "every field" one the specific items above already say better.
    for (const blocker of entry.blockers.value) {
      if (blocker !== 'every required field filled in' && !missing.includes(blocker)) missing.push(blocker)
    }
    return missing
  })

  const canSubmit = computed(() => blockers.value.length === 0 && !entry.posting.value)

  const postLabel = computed(() => (amount.value > 0 ? `Post ${formatCurrency(amount.value)}` : 'Post'))

  /** Pick a quick choice; picking the one already picked clears it. */
  function pickSuggestion(code: string) {
    creditCode.value = creditCode.value === code ? null : code
  }

  /**
   * Open on a given account. Awaits a tick between choosing the template and
   * filling it: Book Entry clears its fields whenever the template changes,
   * and that watcher runs after this function's synchronous part.
   */
  async function start(cashAccountId: number | null) {
    entry.templateId.value = moneyReceivedTemplateId
    await nextTick()
    amounts.value = {}
    codes.value = {}
    cashIds.value = cashAccountId === null ? {} : { cash: cashAccountId }
    // Local date, not toISOString(): before 08:00 in Manila that is yesterday.
    entry.entryDate.value = today.value
    receivedFrom.value = ''
    reference.value = ''
    note.value = ''
    creditSearch.value = ''
  }

  async function submit() {
    if (!canSubmit.value) return { success: false }
    description.value = composedDescription.value
    return entry.submit()
  }

  return {
    entryDate: entry.entryDate, today, cashIds, receivedIntoOptions, posting: entry.posting,
    receivedFrom, reference, note, amount, creditCode, creditSearch, creditOptions, creditNoData,
    suggestions, pickedSuggestion, creditHint, pickSuggestion,
    movement, lines, totalDebit: entry.totalDebit, totalCredit: entry.totalCredit, accountName,
    composedDescription, blockers, canSubmit, postLabel,
    start, submit,
  }
}
