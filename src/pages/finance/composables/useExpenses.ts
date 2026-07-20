import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import {
  useFinanceDataStore,
  expenseCategories, expenseDepartments, expensePaymentMethods,
} from '@/stores/financeData'
import type { ExpenseType } from '@/stores/financeData'
import { useChangeRequestsDataStore } from '@/stores/changeRequestsData'
import type { ChangeRequestField, ProposedChange } from '@/stores/changeRequestsData'
import { formatCurrency } from '@/utils/helpers'
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
  const changeStore = useChangeRequestsDataStore()
  const toast = useToast()
  const { expenses, cashAccounts, loading } = storeToRefs(financeStore)

  // ─── State (expense form fields live inside AddExpenseDialog) ──────
  const showFormDialog = ref(false)

  // ─── Change-request (edit/undo) state ─────────────────────────────
  const showChangeDialog = ref(false)
  const changeTarget = ref<ExpenseType | null>(null)
  const pendingIds = ref<Set<number>>(new Set())

  // ─── Actions ──────────────────────────────────────────────────────
  async function init() {
    await Promise.all([financeStore.fetchExpenses(), financeStore.fetchCashAccounts()])
    await loadPending()
  }

  async function loadPending() {
    pendingIds.value = new Set(await changeStore.fetchPendingTargetIds('expense'))
  }

  function isPending(id: number) {
    return pendingIds.value.has(id)
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

  // ─── Editing/voiding an expense now goes through executive approval ───
  function openChangeDialog(id: number) {
    changeTarget.value = expenses.value.find((e) => e.id === id) ?? null
    if (changeTarget.value) showChangeDialog.value = true
  }

  // Memo fields edit in place; amount / category / account / date are ledger
  // fields — an approved edit to those reverses the old expense and reissues a
  // corrected one (new number). See applyExpenseChange.
  const changeFields = computed<ChangeRequestField[]>(() => {
    const e = changeTarget.value
    if (!e) return []
    return [
      { key: 'amount', label: 'Amount', value: e.amount ?? 0, type: 'number' },
      { key: 'category', label: 'Category', value: e.category, type: 'select', items: expenseCategories.map((c) => ({ title: c.title, value: c.value })) },
      { key: 'paid_at', label: 'Date', value: (e.paid_at ?? '').slice(0, 10), type: 'date' },
      { key: 'cash_account_id', label: 'Account', value: e.cash_account_id, type: 'select', items: cashAccounts.value.map((a) => ({ title: a.name, value: a.id })) },
      { key: 'department', label: 'Department', value: e.department, type: 'select', items: expenseDepartments.map((d) => ({ title: d.title, value: d.value })) },
      { key: 'payment_method', label: 'Payment Method', value: e.payment_method, type: 'select', items: expensePaymentMethods.map((m) => ({ title: m.title, value: m.value })) },
      { key: 'paid_to', label: 'Paid To', value: e.paid_to, type: 'text' },
      { key: 'or_si_no', label: 'OR/SI No.', value: e.or_si_no, type: 'text' },
      { key: 'remarks', label: 'Description', value: e.remarks, type: 'text' },
    ]
  })

  const voidSummary = computed(() => {
    const e = changeTarget.value
    if (!e) return ''
    return `Void ${e.reference_no ?? `expense #${e.id}`} — reverses its ledger entry (if posted) and restores ${formatCurrency(e.amount ?? 0)} to ${e.cash_account_name ?? 'its cash account'}.`
  })

  async function submitChangeRequest(payload: { requestType: 'edit' | 'void'; proposedChanges: ProposedChange; summary: string; reason: string }) {
    const e = changeTarget.value
    if (!e) return
    const result = await changeStore.proposeChange({
      module: 'finance',
      targetType: 'expense',
      targetId: e.id,
      targetRef: e.reference_no,
      requestType: payload.requestType,
      proposedChanges: payload.proposedChanges,
      summary: payload.summary,
      reason: payload.reason,
    })
    if (result.success) {
      showChangeDialog.value = false
      await loadPending()
    }
  }

  return {
    expenses, cashAccounts, loading,
    showFormDialog,
    showChangeDialog, changeTarget, changeFields, voidSummary, isPending,
    init, openFormDialog, handleSubmit, openChangeDialog, submitChangeRequest,
  }
}
