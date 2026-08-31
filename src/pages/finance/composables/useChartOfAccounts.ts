import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useGLDataStore, ACCOUNT_CATEGORIES, nextAccountCode } from '@/stores/glData'
import type { AccountCategoryKey, AccountLedgerLine, GLAccount } from '@/stores/glData'

const toast = useToast()

export const headers = [
  { title: 'CODE',        key: 'code',           sortable: true,  align: 'center' as const },
  { title: 'NAME',        key: 'name',           sortable: true,  align: 'center' as const },
  { title: 'CLASS',       key: 'class',          sortable: true,  align: 'center' as const },
  { title: 'SUBSECTION',  key: 'subsection',     sortable: true,  align: 'center' as const },
  { title: 'NORMAL BAL.', key: 'normal_balance', sortable: false, align: 'center' as const },
  { title: 'CONTRA',      key: 'is_contra',      sortable: false, align: 'center' as const },
] as const

export const categoryOptions = ACCOUNT_CATEGORIES.map((c) => ({ title: c.label, value: c.key }))

// Canonical reading order for the cheat sheet — matches the Balance Sheet /
// Income Statement structure documented in CLAUDE.md (Assets before
// Liabilities before Equity; Revenue through Finance Costs in P&L order),
// not just "whatever order the DB happened to return." A subsection not in
// this list (a future category) sorts after everything named here.
const SUBSECTION_ORDER = [
  'Current Assets', 'Non-Current Assets',
  'Current Liabilities', 'Non-Current Liabilities',
  'Equity',
  'Revenue', 'Cost of Sales', 'Selling Expenses', 'Administrative & Operating Expenses',
  'Other Income', 'Finance Costs',
]

// A full-width divider is rendered above the subsection card that starts
// each of these logical groups, so the two-column card grid reads as
// "ASSETS { Current, Non-Current } / LIABILITIES { ... } / EQUITY / INCOME
// STATEMENT { ... }" instead of one undifferentiated run of cards.
const SECTION_DIVIDERS: Record<string, string> = {
  'Current Assets': 'Assets',
  'Current Liabilities': 'Liabilities',
  'Equity': 'Equity',
  'Revenue': 'Income Statement',
}

export function useChartOfAccounts() {
  const gl = useGLDataStore()
  const { accounts, loading } = storeToRefs(gl)

  const searchText = ref('')
  const showCreateDialog = ref(false)
  const creating = ref(false)

  const newCategory = ref<AccountCategoryKey | null>(null)
  const newName = ref('')
  const newIsContra = ref(false)

  const filteredAccounts = computed(() => {
    const q = searchText.value.trim().toLowerCase()
    if (!q) return accounts.value
    return accounts.value.filter((a) =>
      a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.subsection.toLowerCase().includes(q))
  })

  // Grouped for the printable/reference "cheat sheet" view — same data as the
  // table, ordered to match the documented Balance Sheet / Income Statement
  // structure (not DB fetch order), with section dividers between the major
  // groups (Assets / Liabilities / Equity / Income Statement).
  const groupedAccounts = computed(() => {
    const groups = new Map<string, typeof accounts.value>()
    for (const a of accounts.value) {
      const list = groups.get(a.subsection) ?? []
      list.push(a)
      groups.set(a.subsection, list)
    }
    const orderIndex = (subsection: string) => {
      const i = SUBSECTION_ORDER.indexOf(subsection)
      return i === -1 ? SUBSECTION_ORDER.length : i
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => orderIndex(a) - orderIndex(b))
      .map(([subsection, items]) => ({
        subsection,
        items,
        sectionHeader: SECTION_DIVIDERS[subsection] ?? null,
      }))
  })

  // --- Account drill-down -------------------------------------------------
  // Clicking any account opens its ledger: every movement through it, with a
  // running balance. Works for all 73 accounts with no per-account code — an
  // expense line and a cash account read the same way, because for most
  // accounts the transactions ARE the whole story.
  //
  // Accounts backed by an operational table (cash, AR, AP, inventory) can also
  // show WHAT MAKES UP the balance. That breakdown is deliberately not built
  // here yet: the generic view is useful on its own and each sub-ledger is
  // additive, so they can land one at a time without touching this.
  const openAccount = ref<GLAccount | null>(null)
  const ledger = ref<AccountLedgerLine[]>([])
  const ledgerLoading = ref(false)

  // The closing balance IS the last line's running balance, rather than a
  // separately-queried figure — so the total on screen always equals the sum of
  // the lines on screen, and the two can never disagree in front of the
  // accountant.
  const ledgerBalance = computed(() => ledger.value[ledger.value.length - 1]?.runningBalance ?? 0)

  async function showAccount(account: GLAccount) {
    openAccount.value = account
    ledgerLoading.value = true
    ledger.value = []
    ledger.value = await gl.fetchAccountLedger(account.code, account.normal_balance)
    ledgerLoading.value = false
  }

  /** Open by code, for call sites that only carry the row's code. */
  async function showAccountByCode(code: string) {
    const account = accounts.value.find((a) => a.code === code)
    if (!account) return
    await showAccount(account)
  }

  function closeAccount() {
    openAccount.value = null
    ledger.value = []
  }

  const selectedCategory = computed(() => ACCOUNT_CATEGORIES.find((c) => c.key === newCategory.value) ?? null)

  // Live preview of the code the system will assign — the accountant never
  // types it, only sees what it will be once a category is chosen.
  const previewCode = computed(() => {
    if (!selectedCategory.value) return null
    return nextAccountCode(selectedCategory.value, accounts.value)
  })

  const canCreate = computed(() => selectedCategory.value != null && newName.value.trim().length > 0)

  function openCreateDialog() {
    newCategory.value = null
    newName.value = ''
    newIsContra.value = false
    showCreateDialog.value = true
  }

  function cancelCreate() {
    showCreateDialog.value = false
  }

  async function submitCreate() {
    if (!selectedCategory.value) { toast.warning('Pick where this account belongs.'); return }
    if (!newName.value.trim()) { toast.warning('Enter an account name.'); return }

    creating.value = true
    const result = await gl.createAccount({
      category: selectedCategory.value,
      name: newName.value.trim(),
      isContra: newIsContra.value,
    })
    creating.value = false
    if (result.success) showCreateDialog.value = false
  }

  async function init() {
    await gl.fetchAccounts()
  }

  return {
    loading, searchText, filteredAccounts, groupedAccounts,
    showCreateDialog, creating, newCategory, newName, newIsContra,
    previewCode, canCreate, categoryOptions,
    openCreateDialog, cancelCreate, submitCreate, init,
    openAccount, ledger, ledgerLoading, ledgerBalance,
    showAccount, showAccountByCode, closeAccount,
  }
}
