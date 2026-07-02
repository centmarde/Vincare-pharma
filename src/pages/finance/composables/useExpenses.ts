import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useFinanceDataStore } from '@/stores/financeData'
import type { AddExpensePayload } from '@/utils/cashAccountTypes'

export const headers = [
  { title: 'REFERENCE #', key: 'reference_no',     sortable: true,  align: 'center' as const },
  { title: 'DATE',        key: 'paid_at',           sortable: true,  align: 'center' as const },
  { title: 'DEPARTMENT',  key: 'department',        sortable: true,  align: 'center' as const },
  { title: 'CATEGORY',    key: 'category',          sortable: true,  align: 'center' as const },
  { title: 'DESCRIPTION', key: 'remarks',           sortable: false, align: 'center' as const },
  { title: 'OR/SI NO.',   key: 'or_si_no',          sortable: false, align: 'center' as const },
  { title: 'PAID TO',     key: 'paid_to',           sortable: false, align: 'center' as const },
  { title: 'ACCOUNT',     key: 'cash_account_name', sortable: false, align: 'center' as const },
  { title: 'AMOUNT',      key: 'amount',            sortable: false, align: 'center' as const },
  { title: 'ACTIONS',     key: 'actions',           sortable: false, align: 'center' as const },
] as const

export function useExpenses() {
  const financeStore = useFinanceDataStore()
  const toast = useToast()
  const { expenses, cashAccounts, loading } = storeToRefs(financeStore)

  // ─── State (expense form fields live inside AddExpenseDialog) ──────
  const showFormDialog = ref(false)

  const showDeleteDialog = ref(false)
  const deleteTargetId = ref<number | null>(null)

  // ─── Actions ──────────────────────────────────────────────────────
  async function init() {
    await Promise.all([financeStore.fetchExpenses(), financeStore.fetchCashAccounts()])
  }

  function openFormDialog() {
    showFormDialog.value = true
  }

  async function handleSubmit(payload: AddExpensePayload) {
    const account = cashAccounts.value.find((a) => a.id === payload.cash_account_id)
    const result = await financeStore.recordExpense({
      category: payload.category,
      amount: payload.amount,
      paidTo: payload.paid_to || undefined,
      paymentMethod: account?.classification === 'PETTY_CASH' ? 'petty_cash' : undefined,
      valueDate: payload.expense_date,
      remarks: payload.description,
      department: payload.department,
      orSiNo: payload.or_si_no || undefined,
      cashAccountId: payload.cash_account_id,
    })
    if (!result.success) return
    showFormDialog.value = false

    // The dialog's "Request replenishment" toggle — raise the request right
    // after the expense lands so the fund tops back up through the normal
    // approval flow. Funding source defaults to the first non-petty account;
    // the approver sees (and can reject) the FROM account on the request.
    if (payload.request_replenishment && account) {
      const fundingAccount = cashAccounts.value.find(
        (a) => a.id !== account.id && a.classification !== 'PETTY_CASH' && a.is_active,
      )
      if (!fundingAccount) {
        toast.warning('Petty cash is below threshold but no bank account exists to fund a replenishment.')
        return
      }
      await financeStore.requestReplenishment({
        pettyCashAccountId: account.id,
        fundingAccountId: fundingAccount.id,
        remarks: 'Auto-requested from expense entry — petty cash fell below threshold.',
      })
    }
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
    showFormDialog,
    showDeleteDialog,
    init, openFormDialog, handleSubmit, openDeleteDialog, confirmDelete,
  }
}
