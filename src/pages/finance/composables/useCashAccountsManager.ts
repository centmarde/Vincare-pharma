import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { cashClassifications, classificationMeta, isCashGLAccount } from '@/utils/cashAccountTypes'
import type { CashClassification, ClassifiedCashAccount, CreateCashAccountPayload } from '@/utils/cashAccountTypes'
import { glCashCode } from '@/stores/financeData'
import { useGLDataStore } from '@/stores/glData'

// Grouping/display derivations + add-account form state for CashAccountsManager.
// Component stays markup-only (binds v-models, emits the built payload).
export function useCashAccountsManager(accounts: () => ClassifiedCashAccount[]) {
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

  const gl = useGLDataStore()
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

  return {
    groupedAccounts, totalActiveBalance, selectedClassificationMeta,
    showAddDialog, name, classification, openingBalance, isActive, canSubmit,
    glAccountCode, glAccountOptions,
    openAddDialog, cancelAdd, buildPayload,
  }
}
