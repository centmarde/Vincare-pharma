import { ref, computed } from 'vue'
import { cashClassifications, classificationMeta } from '@/utils/cashAccountTypes'
import type { CashClassification, ClassifiedCashAccount, CreateCashAccountPayload } from '@/utils/cashAccountTypes'

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

  function resetForm() {
    name.value = ''
    classification.value = null
    openingBalance.value = null
    isActive.value = true
  }

  function openAddDialog() {
    resetForm()
    showAddDialog.value = true
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
    && openingBalance.value >= 0,
  )

  function buildPayload(): CreateCashAccountPayload | null {
    if (!canSubmit.value || !classification.value) return null
    return {
      name: name.value.trim(),
      classification: classification.value,
      opening_balance: openingBalance.value ?? 0,
      is_active: isActive.value,
    }
  }

  return {
    groupedAccounts, totalActiveBalance, selectedClassificationMeta,
    showAddDialog, name, classification, openingBalance, isActive, canSubmit,
    openAddDialog, cancelAdd, buildPayload,
  }
}
