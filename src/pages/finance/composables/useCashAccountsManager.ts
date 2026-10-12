import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { cashClassifications, classificationMeta, isCashGLAccount } from '@/utils/cashAccountTypes'
import type { CashClassification, ClassifiedCashAccount, CreateCashAccountPayload } from '@/utils/cashAccountTypes'
import { glCashCode, glAccountCodeFor } from '@/stores/financeData'
import { useGLDataStore } from '@/stores/glData'
import { useFinanceDataStore } from '@/stores/financeData'

// Grouping/display derivations + add-account form state for CashAccountsManager.
// Component stays markup-only (binds v-models, emits the built payload).
export function useCashAccountsManager(accounts: () => ClassifiedCashAccount[]) {
  const gl = useGLDataStore()
  const finance = useFinanceDataStore()

  const groupedAccounts = computed(() =>
    cashClassifications.map((meta) => {
      const groupAccounts = accounts().filter((a) => a.classification === meta.value)
      return {
        meta,
        accounts: groupAccounts,
        activeTotal: groupAccounts.reduce((sum, a) => sum + (a.is_active ? a.balance : 0), 0),
      }
    }),
  )

  const totalActiveBalance = computed(() =>
    accounts().reduce((sum, a) => sum + (a.is_active ? a.balance : 0), 0),
  )

  // ─── GL reconciliation ──────────────────────────────────────────────────
  //
  // These accounts and the GL are two records of the same cash, and they can
  // drift apart silently. A cash account deleted without reversing its opening
  // entry leaves the GL holding money nothing backs; a payment whose ledger
  // entry was reversed by hand leaves the account short. Neither shows up
  // anywhere today, so a ₱9.2M gap sat unnoticed.
  //
  // Compared per GL ACCOUNT rather than as one page total: a single figure
  // says only "something is wrong", while per-account points at the bucket —
  // which is the difference between a five-minute check and an afternoon.

  /** Which GL account each cash account posts to. Always via glAccountCodeFor
   *  — the classification map it falls back to has drifted twice before. */
  const cashTotalsByGLCode = computed(() => {
    const totals = new Map<string, number>()
    for (const account of accounts()) {
      if (!account.is_active) continue
      const code = glAccountCodeFor(account)
      totals.set(code, (totals.get(code) ?? 0) + (account.balance ?? 0))
    }
    return totals
  })

  /**
   * One row per GL cash account whose ledger balance disagrees with the cash
   * accounts pointing at it.
   *
   * Covers codes present on EITHER side: a GL account with a balance and no
   * cash account left behind it is exactly the orphan case worth catching, and
   * keying only off the cash accounts would miss it entirely.
   */
  const glVariances = computed(() => {
    // Nothing to compare against until the trial balance arrives. Without this
    // every cash account reads as a full variance on first paint, so the page
    // opens shouting about a discrepancy that does not exist.
    if (!gl.trialBalance.length) return []

    const cash = cashTotalsByGLCode.value
    const ledger = new Map<string, number>()
    for (const row of gl.trialBalance) {
      // Cash is debit-normal, so debit less credit is the balance on hand.
      ledger.set(row.account_code, Number(row.debit_balance ?? 0) - Number(row.credit_balance ?? 0))
    }
    const codes = new Set<string>([...cash.keys()])
    for (const [code, amount] of ledger) if (isCashGLAccount(code) && amount !== 0) codes.add(code)

    return [...codes]
      .map((code) => {
        const glBalance = ledger.get(code) ?? 0
        const cashBalance = cash.get(code) ?? 0
        return {
          code,
          name: gl.accounts.find((a) => a.code === code)?.name ?? code,
          glBalance,
          cashBalance,
          variance: glBalance - cashBalance,
        }
      })
      .filter((row) => Math.abs(row.variance) > 0.01)
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
  })

  /** Load what the reconciliation needs. The trial balance is one RPC. */
  async function loadReconciliation() {
    await Promise.all([
      gl.accounts.length ? Promise.resolve(gl.accounts) : gl.fetchAccounts(),
      gl.fetchTrialBalance(),
    ])
  }

  // --- Add Cash Account form ---
  const showAddDialog = ref(false)
  const name = ref('')
  const classification = ref<CashClassification | null>(null)
  const openingBalance = ref<number | null>(null)
  const isActive = ref(true)
  // Which chart account this cash sits in. Recorded on the row rather than
  // inferred from classification, because three classifications cannot address
  // the chart's cash accounts -- a revolving fund belongs in 1050, which no
  // classification maps to.
  const glAccountCode = ref<string | null>(null)

  const { accounts: glAccounts } = storeToRefs(gl)

  const glAccountOptions = computed(() =>
    glAccounts.value
      .filter((a) => a.is_active && isCashGLAccount(a.code))
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => ({ value: a.code, title: `${a.code} — ${a.name}` })),
  )

  // Picking a classification suggests the account it used to post to, so the
  // common cases stay one click. Only ever fills a blank -- never overwrites a
  // deliberate choice, which is the whole point of the field.
  watch(classification, (value) => {
    if (value && !glAccountCode.value) glAccountCode.value = glCashCode(value)
  })

  function resetForm() {
    name.value = ''
    classification.value = null
    openingBalance.value = null
    isActive.value = true
    glAccountCode.value = null
  }

  function openAddDialog() {
    resetForm()
    showAddDialog.value = true
    // The chart is this page's own dependency, not the caller's to remember.
    if (!glAccounts.value.length) gl.fetchAccounts()
  }

  function cancelAdd() {
    showAddDialog.value = false
  }

  // Meta for the chip in the classification select's #selection slot. Resolved
  // here from the model rather than the slot's item, which is only typed as a
  // wrapper (with .raw) when Volar infers Vuetify's generic item parameter.
  const selectedClassificationMeta = computed(() =>
    classification.value ? classificationMeta(classification.value) : null,
  )

  const canSubmit = computed(() =>
    name.value.trim().length > 0
    && classification.value !== null
    && openingBalance.value !== null
    && openingBalance.value >= 0
    && glAccountCode.value !== null,
  )

  function buildPayload(): CreateCashAccountPayload | null {
    if (!canSubmit.value || !classification.value) return null
    return {
      name: name.value.trim(),
      classification: classification.value,
      opening_balance: openingBalance.value ?? 0,
      is_active: isActive.value,
      gl_account_code: glAccountCode.value,
    }
  }

  // ─── Remove / deactivate ────────────────────────────────────────────────
  // Orchestration lives here rather than in the component: handlers that call
  // store actions and then refresh derived state are composable work, same as
  // every other module in this app.
  const showConfirm = ref(false)
  const busy = ref(false)
  const confirmMode = ref<'remove' | 'deactivate'>('deactivate')
  const confirmTarget = ref<ClassifiedCashAccount | null>(null)

  function askRemove(account: ClassifiedCashAccount) {
    confirmTarget.value = account
    confirmMode.value = 'remove'
    showConfirm.value = true
  }

  function askDeactivate(account: ClassifiedCashAccount) {
    confirmTarget.value = account
    confirmMode.value = 'deactivate'
    showConfirm.value = true
  }

  async function confirmAccountAction() {
    const target = confirmTarget.value
    if (!target) return
    busy.value = true
    const result = confirmMode.value === 'remove'
      ? await finance.removeCashAccount(target.id)
      : await finance.deactivateCashAccount(target.id)
    busy.value = false
    if (!result.success) return
    showConfirm.value = false
    // A removal reverses a ledger entry, so the variance figures above are
    // stale the moment it succeeds.
    await loadReconciliation()
  }

  return {
    groupedAccounts, totalActiveBalance, selectedClassificationMeta,
    glVariances, loadReconciliation,
    showConfirm, busy, confirmMode, confirmTarget,
    askRemove, askDeactivate, confirmAccountAction,
    showAddDialog, name, classification, openingBalance, isActive, canSubmit,
    glAccountCode, glAccountOptions,
    openAddDialog, cancelAdd, buildPayload,
  }
}
