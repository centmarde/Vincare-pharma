import { ref, computed, watch } from 'vue'
import { classificationMeta } from '@/utils/cashAccountTypes'
import type { AddExpensePayload, ClassifiedCashAccount } from '@/utils/cashAccountTypes'
import type { ExpenseCategory, ExpenseDepartment } from '@/stores/financeData'
import { formatCurrency } from '@/utils/helpers'

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
    accountOptions, isPettyCash, pettyCashBalance, disbursedAmount, remainingBalance,
    insufficientPettyCash, isBelowThreshold, canSubmit,
    resetForm, buildPayload,
  }
}
