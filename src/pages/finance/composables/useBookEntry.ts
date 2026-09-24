import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useGLDataStore } from '@/stores/glData'
import { useAuthUserStore } from '@/stores/authUser'
import { useFinanceDataStore, glAccountCodeFor } from '@/stores/financeData'
import { bookTemplateById, bookTemplateGroups } from '@/utils/bookTemplates'
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

const todayISO = () => new Date().toISOString().slice(0, 10)

export function useBookEntry() {
  const glStore = useGLDataStore()
  const financeStore = useFinanceDataStore()
  const authStore = useAuthUserStore()
  const toast = useToast()
  const { accounts } = storeToRefs(glStore)
  const { cashAccounts } = storeToRefs(financeStore)

  const templateId = ref<string | null>(null)
  const entryDate = ref(todayISO())
  const description = ref('')
  const amounts = ref<Record<string, number | null>>({})
  const codes = ref<Record<string, string | null>>({})
  const posting = ref(false)

  const groups = bookTemplateGroups()
  const template = computed<BookTemplate | null>(() =>
    templateId.value ? bookTemplateById(templateId.value) : null)

  /** Cash accounts, resolved to the GL account each one actually posts to. */
  const cashOptions = computed(() =>
    cashAccounts.value
      .filter((a) => a.is_active)
      .map((a) => ({
        // glAccountCodeFor is the ONLY resolver for this — never re-inline the
        // classification map, it has drifted twice before.
        value: glAccountCodeFor(a),
        title: a.name,
        subtitle: accounts.value.find((g) => g.code === glAccountCodeFor(a))?.name ?? '',
        id: a.id,
      })),
  )

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
  const lines = computed<BookLine[]>(() => {
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
        lines.value.map((l) => ({ account_code: l.account_code, debit: l.debit, credit: l.credit })),
        user.id,
      )
      if (!result.success) {
        toast.error(result.error || 'Failed to record the transaction.')
        return { success: false }
      }
      toast.success(`${t.title} recorded.`)
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
    entryDate, description, amounts, codes, posting,
    cashOptions, accountOptionsFor, accountName,
    lines, totalDebit, totalCredit, isBalanced,
    blockers, canSubmit,
    load, reset, submit,
  }
}
