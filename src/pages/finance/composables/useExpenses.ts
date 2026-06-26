import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore, EXPENSE_CATEGORIES, EXPENSE_DEPARTMENTS, EXPENSE_PAYMENT_METHODS } from '@/stores/financeData'
import type { ExpenseCategory, ExpenseDepartment, ExpensePaymentMethod } from '@/stores/financeData'

export const headers = [
  { title: 'REFERENCE #', key: 'reference_no',     sortable: true,  align: 'center' as const },
  { title: 'DATE',        key: 'paid_at',           sortable: true,  align: 'center' as const },
  { title: 'DEPARTMENT',  key: 'department',        sortable: true,  align: 'center' as const },
  { title: 'CATEGORY',    key: 'category',          sortable: true,  align: 'center' as const },
  { title: 'OR/SI NO.',   key: 'or_si_no',          sortable: false, align: 'center' as const },
  { title: 'PAID TO',     key: 'paid_to',           sortable: false, align: 'center' as const },
  { title: 'ACCOUNT',     key: 'cash_account_name', sortable: false, align: 'center' as const },
  { title: 'AMOUNT',      key: 'amount',            sortable: false, align: 'center' as const },
  { title: 'ACTIONS',     key: 'actions',           sortable: false, align: 'center' as const },
] as const

export { EXPENSE_CATEGORIES, EXPENSE_DEPARTMENTS, EXPENSE_PAYMENT_METHODS }

export function useExpenses() {
  const financeStore = useFinanceDataStore()
  const { expenses, cashAccounts, loading } = storeToRefs(financeStore)

  // ─── State ────────────────────────────────────────────────────────
  const showFormDialog = ref(false)
  const category = ref<ExpenseCategory | null>(null)
  const department = ref<ExpenseDepartment | null>(null)
  const orSiNo = ref('')
  const amount = ref<number | null>(null)
  const paidTo = ref('')
  const paymentMethod = ref<ExpensePaymentMethod | null>(null)
  const valueDate = ref<string | null>(null)
  const remarks = ref('')
  const cashAccountId = ref<number | null>(null)

  const showDeleteDialog = ref(false)
  const deleteTargetId = ref<number | null>(null)

  // ─── Computed ─────────────────────────────────────────────────────
  const canSubmit = computed(() => !!category.value && (amount.value ?? 0) > 0 && !!cashAccountId.value)

  // Picking "Petty Cash" as the payment method only makes sense against the
  // Petty Cash account — auto-select it (there's only ever one) so the user
  // isn't asked to pick the same thing twice.
  watch(paymentMethod, (method) => {
    if (method !== 'petty_cash') return
    const pettyCash = cashAccounts.value.find((a) => a.account_type === 'petty_cash')
    if (pettyCash) cashAccountId.value = pettyCash.id
  })

  // ─── Actions ──────────────────────────────────────────────────────
  async function init() {
    await Promise.all([financeStore.fetchExpenses(), financeStore.fetchCashAccounts()])
  }

  function openFormDialog() {
    category.value = null
    department.value = null
    orSiNo.value = ''
    amount.value = null
    paidTo.value = ''
    paymentMethod.value = null
    valueDate.value = null
    remarks.value = ''
    cashAccountId.value = null
    showFormDialog.value = true
  }

  async function handleSubmit() {
    if (!canSubmit.value) return
    const result = await financeStore.recordExpense({
      category: category.value as ExpenseCategory,
      amount: amount.value ?? 0,
      paidTo: paidTo.value || undefined,
      paymentMethod: paymentMethod.value || undefined,
      valueDate: valueDate.value || undefined,
      remarks: remarks.value || undefined,
      department: department.value ?? undefined,
      orSiNo: orSiNo.value || undefined,
      cashAccountId: cashAccountId.value as number,
    })
    if (result.success) showFormDialog.value = false
  }

  function openDeleteDialog(id: number) {
    deleteTargetId.value = id
    showDeleteDialog.value = true
  }

  async function confirmDelete() {
    if (deleteTargetId.value == null) return
    const result = await financeStore.deleteExpense(deleteTargetId.value)
    if (result.success) showDeleteDialog.value = false
  }

  return {
    expenses, cashAccounts, loading,
    showFormDialog, category, department, orSiNo, amount, paidTo, paymentMethod, valueDate, remarks,
    cashAccountId, canSubmit,
    showDeleteDialog,
    init, openFormDialog, handleSubmit, openDeleteDialog, confirmDelete,
  }
}
