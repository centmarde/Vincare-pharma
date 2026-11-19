import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import {
  useFinanceDataStore,
  expenseDepartments, expensePaymentMethods,
} from '@/stores/financeData'
import type { ExpenseType } from '@/stores/financeData'
import { useFinanceChangeRequestStore } from '../stores/financeChangeRequest'
import { useDisbursementVouchersStore } from '@/stores/disbursementVouchersData'
import type { ChangeRequestField, ProposedChange, AppliedEdit } from '@/stores/changeRequestsData'
import type { FinanceChangeRequestType } from '../stores/financeChangeRequest'
import type { ChangeHistoryEntry } from '@/utils/changeRequests'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import { matchesSearch, parseSearch, searchText } from '@/utils/search'
import { useExpenseAccounts } from './useExpenseAccounts'
import type { AddExpensePayload } from '@/utils/cashAccountTypes'

export const headers = [
  { title: 'REFERENCE #', key: 'reference_no',     sortable: true,  align: 'center' as const },
  { title: 'DATE',        key: 'paid_at',           sortable: true,  align: 'center' as const },
  { title: 'DEPARTMENT',  key: 'department',        sortable: true,  align: 'center' as const },
  { title: 'CATEGORY',    key: 'category',          sortable: true,  align: 'center' as const },
  { title: 'DESCRIPTION', key: 'remarks',           sortable: false, align: 'center' as const },
  { title: 'OR/SI NO.',   key: 'or_si_no',          sortable: false, align: 'center' as const },
  { title: 'PAID TO',     key: 'paid_to',           sortable: false, align: 'center' as const },
  { title: 'VOUCHER',     key: 'voucher',           sortable: false, align: 'center' as const },
  { title: 'ACCOUNT',     key: 'cash_account_name', sortable: false, align: 'center' as const },
  { title: 'AMOUNT',      key: 'amount',            sortable: false, align: 'center' as const },
  { title: 'ACTIONS',     key: 'actions',           sortable: false, align: 'center' as const },
] as const

export function useExpenses() {
  const financeStore = useFinanceDataStore()
  const changeStore = useFinanceChangeRequestStore()
  const voucherStore = useDisbursementVouchersStore()
  const toast = useToast()
  const { expenses, cashAccounts, loading } = storeToRefs(financeStore)
  // The CATEGORY column and the change-request editor both name accounts from
  // the chart, so a stored code renders as its account name.
  const {
    expenseAccountOptions, expenseAccountLabel, ensureLoaded: ensureAccountsLoaded,
  } = useExpenseAccounts()

  /** Chart accounts as plain {title,value} pairs — the change-request editor's
   *  select has no subheader support, so the group rows are dropped. */
  const expenseAccountItems = computed(() =>
    expenseAccountOptions.value
      .filter((o): o is { value: string; title: string; subsection: string } => 'value' in o)
      .map((o) => ({ title: o.title, value: o.value })),
  )

  // ─── State (expense form fields live inside AddExpenseDialog) ──────
  const showFormDialog = ref(false)

  // ─── Change-request (edit/undo) state ─────────────────────────────
  const showChangeDialog = ref(false)
  const changeTarget = ref<ExpenseType | null>(null)
  const pendingIds = ref<Set<number>>(new Set())
  /** Expenses with any change request at all (pending, approved or rejected). */
  const requestedIds = ref<Set<number>>(new Set())
  const appliedEdits = ref<Map<number, AppliedEdit>>(new Map())

  // Expense id -> the DV number it was recorded from. Expenses entered directly
  // through Record Expense have no voucher, which is a valid state.
  const voucherRefs = ref<Map<number, string>>(new Map())

  // Corrections from before 2026-11-17 voided the expense and recorded a copy
  // under a new number. These two maps tie each pair together so the page can
  // say where an expense went (and where a copy came from). Corrections since
  // then stay on the same document, so neither map grows any more.
  type Correction = { requestId: number | null; docNo: string; originalId: number | null }
  /** Voided original's id -> every copy recorded for it, newest first. */
  const copiesOf = ref<Map<number, Correction[]>>(new Map())
  /** Expense id -> row, and EXP number -> row, for the lookups below (one pass, not one per row). */
  const expenseById = computed(() => new Map(expenses.value.map((e) => [e.id, e])))
  const expenseByNo = computed(() => new Map(expenses.value.map((e) => [e.reference_no, e])))
  /**
   * Voided original's id -> the expense that replaced it. When a second
   * request made a duplicate copy that was voided in turn, the live copy is
   * the replacement (the voucher view uses the same rule).
   */
  const replacedBy = computed(() => {
    const map = new Map<number, Correction>()
    for (const [originalId, copies] of copiesOf.value) {
      const live = copies.find((c) => expenseByNo.value.get(c.docNo)?.status !== 'voided')
      map.set(originalId, live ?? copies[copies.length - 1])
    }
    return map
  })
  /** Replacement's EXP number -> the expense it replaced. */
  const replaces = ref<Map<string, Correction>>(new Map())

  // ─── Actions ──────────────────────────────────────────────────────
  async function init() {
    await Promise.all([financeStore.fetchExpenses(), financeStore.fetchCashAccounts(), ensureAccountsLoaded()])
    await Promise.all([loadPending(), loadVoucherRefs()])
  }

  async function loadVoucherRefs() {
    voucherRefs.value = await voucherStore.fetchVoucherRefsForExpenses(
      expenses.value.map((e) => e.id),
    )
  }

  /**
   * The voucher an expense was recorded from. An old-style replacement was
   * recorded on its own, not from the voucher, so it reads its original's.
   */
  function voucherFor(id: number): string | null {
    // Follow the chain back (C corrected B, B corrected A — only A has the
    // voucher). `seen` stops a malformed loop.
    const seen = new Set<number>()
    let current: number | null = id
    while (current != null && !seen.has(current)) {
      seen.add(current)
      const own = voucherRefs.value.get(current)
      if (own) return own
      current = replacesOf(current)?.originalId ?? null
    }
    return null
  }

  function replacedByOf(id: number): Correction | null {
    return replacedBy.value.get(id) ?? null
  }

  function replacesOf(id: number): Correction | null {
    const no = expenseById.value.get(id)?.reference_no
    return no ? replaces.value.get(no) ?? null : null
  }

  async function loadPending() {
    const [pending, edits, requested] = await Promise.all([
      changeStore.fetchPendingTargetIds(),
      changeStore.fetchAppliedEdits(),
      changeStore.fetchRequestedTargetIds(),
    ])
    pendingIds.value = new Set(pending)
    requestedIds.value = new Set(requested)
    // Newest-first from the store, so the first entry per target wins.
    const map = new Map<number, AppliedEdit>()
    const byOriginal = new Map<number, Correction[]>()
    const byReplacement = new Map<string, Correction>()
    for (const e of edits) {
      if (!map.has(e.transaction_id)) map.set(e.transaction_id, e)
      // A different number means the old void-and-reissue: link the pair.
      if (e.to_transaction_no && e.to_transaction_no !== e.from_transaction_no) {
        const copies = byOriginal.get(e.transaction_id) ?? []
        copies.push({ requestId: e.id ?? null, docNo: e.to_transaction_no, originalId: e.transaction_id })
        byOriginal.set(e.transaction_id, copies)
        byReplacement.set(e.to_transaction_no, {
          requestId: e.id ?? null, docNo: e.from_transaction_no ?? `#${e.transaction_id}`, originalId: e.transaction_id,
        })
      }
    }
    appliedEdits.value = map
    copiesOf.value = byOriginal
    replaces.value = byReplacement
  }

  function isPending(id: number) {
    return pendingIds.value.has(id)
  }

  // An approved edit landed on this exact expense. Since 2026-11-17 that is
  // every edit, ledger ones included; an old-style void-and-reissue original
  // is voided, so the VOIDED chip shows there instead.
  function isEdited(id: number) {
    return appliedEdits.value.has(id)
  }

  /** Whether the expense has anything to show in its change history. */
  function hasHistory(id: number) {
    // A voided expense always has a story to tell ("who voided this?").
    return pendingIds.value.has(id) || requestedIds.value.has(id) || appliedEdits.value.has(id) || replacedBy.value.has(id) || !!replacesOf(id)
      || expenseById.value.get(id)?.status === 'voided'
  }

  // ─── Change history ───────────────────────────────────────────────
  const historyOpen = ref(false)
  const historyLoading = ref(false)
  const historyTitle = ref('')
  const historyEntries = ref<ChangeHistoryEntry[]>([])
  const historyFailed = ref(false)
  /** The expense the dialog is showing (for Try again). */
  let historyFor: number | null = null
  /**
   * One token per read, so a slower earlier read is dropped even for the
   * SAME expense (closed and reopened while it was loading). Closing the
   * dialog invalidates the one in flight.
   */
  let historyRequest = 0
  watch(historyOpen, (open) => { if (!open) historyRequest++ })

  const fieldLabels: Record<string, string> = {
    amount: 'Amount', category: 'Expense account', paid_at: 'Date', cash_account_id: 'Paid from',
    department: 'Department', payment_method: 'Payment method', paid_to: 'Paid to',
    or_si_no: 'OR/SI no.', remarks: 'Description',
  }

  /** A stored value as staff know it: account names, pesos, readable dates. */
  function displayValue(key: string, value: unknown): string {
    if (value == null || value === '') return '—'
    if (key === 'amount') return formatCurrency(Number(value))
    if (key === 'category') return expenseAccountLabel(String(value))
    if (key === 'paid_at') return formatDatePR_ISO(String(value))
    if (key === 'cash_account_id') return cashAccounts.value.find((a) => a.id === Number(value))?.name ?? `Account #${value}`
    if (key === 'department') return expenseDepartments.find((d) => d.value === value)?.title ?? String(value)
    if (key === 'payment_method') return expensePaymentMethods.find((m) => m.value === value)?.title ?? String(value)
    return String(value)
  }

  function outcomeOf(r: FinanceChangeRequestType, docNo: string | null): string | null {
    if (r.status === 'rejected') return r.resolution_note && r.resolution_note !== 'Rejected by approver.' ? `“${r.resolution_note}”` : null
    if (r.status !== 'approved') return null
    if (r.request_type === 'void') return 'The expense was voided and its amount returned to the cash account.'
    if (r.to_transaction_no && r.to_transaction_no !== r.from_transaction_no) {
      return r.to_transaction_no === docNo
        ? `This expense was recorded as the corrected copy of ${r.from_transaction_no ?? 'the original'}.`
        : `The original was voided and the correction recorded as ${r.to_transaction_no}.`
    }
    return 'Corrected on this same expense.'
  }

  async function openHistory(id: number) {
    const expense = expenses.value.find((e) => e.id === id)
    if (!expense) return
    historyFor = id
    const request = ++historyRequest
    historyTitle.value = expense.reference_no ?? `Expense #${id}`
    historyEntries.value = []
    historyFailed.value = false
    historyOpen.value = true
    historyLoading.value = true
    const rows = await changeStore.fetchHistory(id, expense.reference_no ?? null)
    if (request !== historyRequest) return
    historyLoading.value = false
    if (rows === null) { historyFailed.value = true; return }
    historyEntries.value = rows.map((r) => ({
      id: r.id,
      filedAt: formatDatePR_ISO(r.created_at),
      kind: r.request_type === 'void' ? 'Void' : 'Edit',
      status: r.status,
      requestedBy: r.created_by_email ?? null,
      reason: r.reason,
      changes: Object.entries(r.proposed_changes ?? {})
        .filter(([key]) => !key.startsWith('__'))
        .map(([key, diff]) => ({
          label: fieldLabels[key] ?? key,
          from: displayValue(key, diff.from),
          to: displayValue(key, diff.to),
        })),
      resolvedBy: r.resolved_by_email ?? null,
      resolvedAt: r.resolved_at ? formatDatePR_ISO(r.resolved_at) : null,
      outcome: outcomeOf(r, expense.reference_no ?? null),
    }))
  }

  function retryHistory() {
    if (historyFor != null) void openHistory(historyFor)
  }

  function editTooltip(id: number) {
    const e = appliedEdits.value.get(id)
    if (!e) return ''
    const when = e.resolved_at ? new Date(e.resolved_at).toLocaleDateString() : ''
    return [e.summary ?? 'Edited via approved change request', e.reason, when && `Applied ${when}`]
      .filter(Boolean).join(' — ')
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

  // Every edit lands on the SAME expense. Amount / account / cash account /
  // date also correct its ledger entry (reversed and re-posted). See
  // applyExpenseChange.
  const changeFields = computed<ChangeRequestField[]>(() => {
    const e = changeTarget.value
    if (!e) return []
    return [
      { key: 'amount', label: 'Amount', value: e.amount ?? 0, type: 'number' },
      // Chart of accounts, same source as the Add Expense and voucher pickers,
      // so a change request can't propose a category the two can't produce.
      { key: 'category', label: 'Expense Account', value: e.category, type: 'select', items: expenseAccountItems.value },
      { key: 'paid_at', label: 'Date', value: (e.paid_at ?? '').slice(0, 10), type: 'date' },
      { key: 'cash_account_id', label: 'Paid From', value: e.cash_account_id, type: 'select', items: cashAccounts.value.map((a) => ({ title: a.name, value: a.id })) },
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
      transactionId: e.id,
      fromTransactionNo: e.reference_no,
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

  /**
   * Narrows the register as you type: expense no. (EXP-2026-406, or just 406),
   * the voucher it came from (as the VOUCHER column shows it), paid to, account, department, OR/SI no., description, paying account,
   * status — or an amount, with or without commas (the voucher page's rule).
   * Null after the field's clear button.
   */
  const search = ref<string | null>('')
  // Built once per list load, not per keystroke. Includes the expense it
  // replaced / was replaced by, so either number finds both halves of an old
  // correction.
  const expenseSearchIndex = computed(() => expenses.value.map((e) => ({
    expense: e,
    text: searchText([
      e.reference_no, voucherFor(e.id), e.paid_to, e.department, e.or_si_no, e.remarks, e.cash_account_name, e.status,
      e.category, expenseAccountLabel(e.category),
      expensePaymentMethods.find((m) => m.value === e.payment_method)?.title ?? e.payment_method,
      replacedByOf(e.id)?.docNo, replacesOf(e.id)?.docNo,
    ]),
  })))
  const filteredExpenses = computed(() => {
    const query = parseSearch(search.value)
    if (!query) return expenses.value
    return expenseSearchIndex.value
      .filter(({ expense, text }) => matchesSearch(text, [expense.amount], query))
      .map(({ expense }) => expense)
  })

  return {
    expenses, cashAccounts, loading, search, filteredExpenses,
    showFormDialog,
    showChangeDialog, changeTarget, changeFields, voidSummary, isPending, isEdited, editTooltip,
    voucherFor, expenseAccountLabel, replacedByOf, replacesOf, hasHistory,
    historyOpen, historyLoading, historyTitle, historyEntries, historyFailed, openHistory, retryHistory,
    init, openFormDialog, handleSubmit, openChangeDialog, submitChangeRequest,
  }
}
