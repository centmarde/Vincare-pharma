import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGLDataStore } from '@/stores/glData'
import { categoryTitle, expenseAccountSubsections } from '@/stores/financeData'
import type { ExpenseCategory } from '@/stores/financeData'
import type { GLAccount } from '@/stores/glData'

// The one place that turns the chart of accounts into "what can this
// disbursement be charged to". Shared by the voucher form, the voucher print
// sheet, Add Expense and the Expense Report so a new account added in Chart of
// Accounts appears in all of them at once, with no code change.
//
// This replaces a hardcoded 13-slug list that had to be kept in step with a
// `case` in gl_project_events and a CHECK constraint in the database; see the
// ExpenseCategory docblock in financeData.ts for why that went.

// The offered subsections live in financeData so recordExpense can validate
// against the very same list, and the two cannot drift into "selectable but
// unrecordable" — see expenseAccountSubsections there for why that matters.
const offeredSubsections = expenseAccountSubsections

/**
 * Matches an account by NAME or by CODE, so an accountant who knows the chart
 * can type "7050" and a user who doesn't can type "fuel".
 *
 * The code is matched off `item.raw.value` rather than being folded into the
 * title, which keeps the code out of the field and off the printed voucher.
 * Vuetify handles subheader rows before custom filters run, so group headings
 * are not passed here and collapse on their own when a group has no match.
 */
export const filterExpenseAccount = (
  value: string,
  query: string,
  item?: { raw?: unknown },
): boolean => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const code = (item?.raw as { value?: string } | undefined)?.value ?? ''
  return String(value ?? '').toLowerCase().includes(q) || code.toLowerCase().includes(q)
}

/** A Vuetify select item: either a group heading or a selectable account. */
export type ExpenseAccountOption =
  | { type: 'subheader'; title: string }
  | { value: string; title: string; subsection: string }

export function useExpenseAccounts() {
  const glStore = useGLDataStore()
  const { accounts, allAccounts } = storeToRefs(glStore)

  /**
   * Load the chart if it isn't in memory yet. Safe to call on every dialog
   * open — the store keeps the accounts, so a second call is a no-op rather
   * than a refetch. Callers `await` this before opening so the select is never
   * briefly empty.
   */
  async function ensureLoaded() {
    // Two lists, two jobs: `accounts` (active only) is what may be CHOSEN, and
    // `allAccounts` (including retired ones) is what a saved document's code is
    // RESOLVED against. Without the second, deactivating an account makes every
    // voucher and expense report that already used it print a bare code.
    const [active] = await Promise.all([
      accounts.value.length ? accounts.value : glStore.fetchAccounts(),
      allAccounts.value.length ? allAccounts.value : glStore.fetchAllAccounts(),
    ])
    return active
  }

  /**
   * Every account an expense may be charged to, flat. fetchAccounts already
   * filters to is_active, so an account deactivated in Chart of Accounts stops
   * being offered without anything here changing.
   */
  const expenseAccounts = computed<GLAccount[]>(() =>
    accounts.value.filter((a) => (offeredSubsections as readonly string[]).includes(a.subsection)),
  )

  /** The same accounts as Vuetify select items, with a heading per subsection. */
  const expenseAccountOptions = computed<ExpenseAccountOption[]>(() => {
    const options: ExpenseAccountOption[] = []
    for (const subsection of offeredSubsections) {
      const group = expenseAccounts.value
        .filter((a) => a.subsection === subsection)
        .sort((a, b) => a.code.localeCompare(b.code))
      if (!group.length) continue
      options.push({ type: 'subheader', title: subsection })
      for (const account of group) {
        options.push({ value: account.code, title: account.name, subsection })
      }
    }
    return options
  })

  /**
   * An account code's display name, falling back to the legacy slug map for
   * rows written before categories became account codes.
   *
   * Reads the whole chart rather than `expenseAccounts` on purpose: a voucher
   * charged to an account that has since been moved to another subsection, or
   * deactivated, must still print its real name rather than a bare code.
   */
  const expenseAccountLabel = (value: ExpenseCategory | null | undefined): string =>
    categoryTitle(value, allAccounts.value.length ? allAccounts.value : accounts.value)

  /** Whether a stored value is a live account code (vs. a legacy slug). */
  const isAccountCode = (value: ExpenseCategory | null | undefined): boolean =>
    !!value && (allAccounts.value.length ? allAccounts.value : accounts.value)
      .some((a) => a.code === value)

  return {
    accounts,
    allAccounts,
    expenseAccounts,
    expenseAccountOptions,
    expenseAccountLabel,
    isAccountCode,
    ensureLoaded,
  }
}
