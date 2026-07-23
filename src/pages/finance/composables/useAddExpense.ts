import { ref, computed, watch } from 'vue'
import { CASH_CLASSIFICATIONS, classificationMeta } from '@/utils/cashAccountTypes'
import type { AddExpensePayload, CashClassificationMeta, ClassifiedCashAccount } from '@/utils/cashAccountTypes'
import type { ExpenseCategory, ExpenseDepartment } from '@/stores/financeData'
import { formatCurrency } from '@/utils/helpers'
import { useFormDraft } from '@/composables/useFormDraft'

const todayISO = () => new Date().toISOString().slice(0, 10)

// Form state + petty-cash business logic for AddExpenseDialog. The component
// stays markup-only (binds v-models, emits the built payload) per the layered
// architecture — form state lives here, not in the component.
export function useAddExpense(
  accounts: () => ClassifiedCashAccount[],
  replenishThreshold: () => number,
) {
  const category = ref<ExpenseCategory | null>(null)
  const description = ref('')
  const amount = ref<number | null>(null)
  const expenseDate = ref<string>(todayISO())
  const cashAccountId = ref<number | null>(null)
  const department = ref<ExpenseDepartment | null>(null)
  const orSiNo = ref('')
  const paidTo = ref('')
  const requestReplenishment = ref(false)

  // Persist a draft so a reload / crash mid-entry doesn't wipe the expense.
  // expenseDate defaults to today and requestReplenishment is a derived toggle,
  // so neither counts toward the "touched" check.
  const draft = useFormDraft({
    key: 'finance-add-expense',
    version: 1,
    refs: { category, description, amount, expenseDate, cashAccountId, department, orSiNo, paidTo },
    isEmpty: () => category.value == null && !description.value && amount.value == null
      && cashAccountId.value == null && department.value == null && !orSiNo.value && !paidTo.value,
  })

  function resetForm() {
    category.value = null
    description.value = ''
    amount.value = null
    expenseDate.value = todayISO()
    cashAccountId.value = null
    department.value = null
    orSiNo.value = ''
    paidTo.value = ''
    requestReplenishment.value = false
    draft.clear()
  }

  const accountOptions = computed(() =>
    accounts()
      .filter((a) => a.is_active)
      .map((a) => ({
        value: a.id,
        title: `${a.name} — ${formatCurrency(a.balance)}`,
        meta: classificationMeta(a.classification),
      })),
  )

  // Meta for an option's icon/chip in the account select's #item slot, keyed by
  // the option's id. The slot's item is only typed as a wrapper (with .raw) when
  // Volar infers Vuetify's generic item parameter, so resolve it here instead.
  const metaForAccount = (id: number): CashClassificationMeta =>
    accountOptions.value.find((o) => o.value === id)?.meta ?? CASH_CLASSIFICATIONS[0]

  const selectedAccount = computed(() =>
    accounts().find((a) => a.id === cashAccountId.value) ?? null,
  )

  const isPettyCash = computed(() => selectedAccount.value?.classification === 'PETTY_CASH')

  const pettyCashBalance = computed(() =>
    isPettyCash.value && selectedAccount.value ? selectedAccount.value.balance : 0,
  )

  const disbursedAmount = computed(() => amount.value ?? 0)

  const remainingBalance = computed(() => pettyCashBalance.value - disbursedAmount.value)

  const insufficientPettyCash = computed(() => isPettyCash.value && remainingBalance.value < 0)

  const isBelowThreshold = computed(() =>
    isPettyCash.value && !insufficientPettyCash.value && remainingBalance.value < replenishThreshold(),
  )

  // The toggle only applies while the petty cash fund is running low — clear it
  // if the user raises the amount into overdraft or switches account.
  watch([isPettyCash, isBelowThreshold], ([petty, below]) => {
    if (!petty || !below) requestReplenishment.value = false
  })

  const canSubmit = computed(() =>
    category.value !== null
    && description.value.trim().length > 0
    && amount.value !== null
    && amount.value > 0
    && expenseDate.value !== ''
    && cashAccountId.value !== null
    && department.value !== null
    && !insufficientPettyCash.value,
  )

  function buildPayload(): AddExpensePayload | null {
    if (!canSubmit.value || !category.value || !department.value) return null
    return {
      category: category.value,
      description: description.value.trim(),
      amount: amount.value ?? 0,
      expense_date: expenseDate.value,
      cash_account_id: cashAccountId.value ?? 0,
      department: department.value,
      or_si_no: orSiNo.value.trim(),
      paid_to: paidTo.value.trim(),
      request_replenishment: isPettyCash.value && requestReplenishment.value,
    }
  }

  return {
    category, description, amount, expenseDate, cashAccountId, department, orSiNo, paidTo,
    requestReplenishment,
    accountOptions, metaForAccount, isPettyCash, pettyCashBalance, disbursedAmount, remainingBalance,
    insufficientPettyCash, isBelowThreshold, canSubmit,
    resetForm, buildPayload,
    restoreDraft: draft.restore,
  }
}
