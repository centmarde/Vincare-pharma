import { ref, computed } from 'vue'
import { expenseCategories, expenseDepartments } from '@/stores/financeData'
import type { ExpenseCategory, ExpenseDepartment } from '@/stores/financeData'
import type { VoucherType, VoucherInput } from '@/stores/disbursementVouchersData'
import { CASH_CLASSIFICATIONS, classificationMeta } from '@/utils/cashAccountTypes'
import type { CashClassificationMeta, ClassifiedCashAccount } from '@/utils/cashAccountTypes'
import { formatCurrency } from '@/utils/helpers'
import { useFormDraft } from '@/composables/useFormDraft'

// Form state + validation for VoucherFormDialog. The component stays
// markup-only (binds v-models, emits the built payload) per the layered
// architecture — form state lives here, not in the component.
//
// Deliberately separate from useDisbursementVouchers (the list composable):
// a plain composable creates an independent reactive instance per call, so a
// single composable called in both the list and the dialog would silently give
// them unconnected state.

const todayISO = () => new Date().toISOString().slice(0, 10)

// A line while it's being typed. Two differences from VoucherItemInput (the
// store payload):
//   - amount may be null: starting it at 0 rendered a "0" in the field, which
//     looks filled but isn't a valid amount, so the submit button stayed
//     disabled with the form looking complete.
//   - no free-text description. Per the company accountant, a per-line remark
//     duplicates the single Reference/Remarks on the voucher header, so a line
//     is now just what it's charged to and how much. The stored `particular`
//     is derived from the category at save time (see buildPayload).
type VoucherFormLine = {
  category: ExpenseCategory
  department: ExpenseDepartment | null
  amount: number | null
}

const emptyItem = (): VoucherFormLine => ({
  category: 'other',
  department: null,
  amount: null,
})

// The category's display title — what prints in the voucher's PARTICULARS
// column now that a line carries no typed description of its own.
const categoryTitle = (value: ExpenseCategory): string =>
  expenseCategories.find((c) => c.value === value)?.title ?? value

export function useVoucherForm(accounts: () => ClassifiedCashAccount[]) {
  const editingId = ref<number | null>(null)

  const payee = ref('')
  const payeeAddress = ref('')
  const payeeTin = ref('')
  const voucherDate = ref(todayISO())
  const cashAccountId = ref<number | null>(null)
  const checkNo = ref('')
  // One payee, one payment, so one receipt number — a header field, not a
  // per-particular one. Prints in section D of the voucher.
  const orSiNo = ref('')
  const remarks = ref('')
  const items = ref<VoucherFormLine[]>([emptyItem()])

  // A voucher is an input-heavy multi-line form — losing one to a reload
  // mid-entry is exactly what useFormDraft exists for. Only drafts are ever
  // editable, so a restored draft can never resurrect a printed document.
  const draft = useFormDraft({
    key: 'finance-disbursement-voucher',
    version: 1,
    refs: { payee, payeeAddress, payeeTin, voucherDate, cashAccountId, checkNo, orSiNo, remarks, items },
    isEmpty: () => !payee.value && !payeeAddress.value && !payeeTin.value && cashAccountId.value == null
      && !checkNo.value && !orSiNo.value && !remarks.value
      && items.value.every((line) => !line.amount),
  })

  const categoryOptions = expenseCategories
  const departmentOptions = expenseDepartments

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
  // the option's id — Volar only types the slot item as a wrapper when it can
  // infer Vuetify's generic item parameter, so resolve it here instead.
  const metaForAccount = (id: number): CashClassificationMeta =>
    accountOptions.value.find((o) => o.value === id)?.meta ?? CASH_CLASSIFICATIONS[0]

  const selectedAccount = computed(() =>
    accounts().find((a) => a.id === cashAccountId.value) ?? null,
  )

  // The voucher total is the sum of its particulars — never typed by hand.
  const voucherTotal = computed(() =>
    items.value.reduce((total, line) => total + (Number(line.amount) || 0), 0),
  )

  const insufficientFunds = computed(() =>
    selectedAccount.value !== null && voucherTotal.value > selectedAccount.value.balance + 0.005,
  )

  const validItems = computed(() =>
    items.value.filter((line) => Number(line.amount) > 0),
  )

  // What's still stopping a save. Drives a visible hint next to the submit
  // button — a disabled button with no explanation is unusable, since nothing
  // on the form says which cell it's waiting on.
  const blockers = computed(() => {
    const missing: string[] = []
    if (!payee.value.trim()) missing.push('Payee')
    if (!voucherDate.value) missing.push('Date')
    if (cashAccountId.value === null) missing.push('Paid From')
    if (!validItems.value.length) missing.push('a particular with an amount')
    if (insufficientFunds.value) missing.push('a total within the account balance')
    return missing
  })

  const canSubmit = computed(() => blockers.value.length === 0)

  const isEditing = computed(() => editingId.value !== null)

  function resetForm() {
    editingId.value = null
    payee.value = ''
    payeeAddress.value = ''
    payeeTin.value = ''
    voucherDate.value = todayISO()
    cashAccountId.value = null
    checkNo.value = ''
    orSiNo.value = ''
    remarks.value = ''
    items.value = [emptyItem()]
    draft.clear()
  }

  // Prefill from an existing DRAFT voucher. Printed vouchers are immutable, so
  // the caller gates on that before ever opening the form in edit mode.
  function loadFrom(voucher: VoucherType) {
    editingId.value = voucher.id
    payee.value = voucher.payee ?? ''
    payeeAddress.value = voucher.payee_address ?? ''
    payeeTin.value = voucher.payee_tin ?? ''
    voucherDate.value = voucher.voucher_date ?? todayISO()
    cashAccountId.value = voucher.cash_account_id
    checkNo.value = voucher.check_no ?? ''
    // Falls back to a line's copy for vouchers created before or_si_no moved
    // onto the header.
    orSiNo.value = voucher.or_si_no ?? voucher.items[0]?.or_si_no ?? ''
    remarks.value = voucher.remarks ?? ''
    items.value = voucher.items.length
      ? voucher.items.map((line) => ({
        category: line.category,
        department: line.department,
        amount: line.amount,
      }))
      : [emptyItem()]
  }

  function addItem() {
    items.value.push(emptyItem())
  }

  function removeItem(index: number) {
    items.value.splice(index, 1)
    if (!items.value.length) items.value.push(emptyItem())
  }

  function buildPayload(): VoucherInput | null {
    if (!canSubmit.value || cashAccountId.value === null) return null
    return {
      payee: payee.value.trim(),
      payee_address: payeeAddress.value.trim(),
      payee_tin: payeeTin.value.trim(),
      voucher_date: voucherDate.value,
      cash_account_id: cashAccountId.value,
      check_no: checkNo.value.trim(),
      or_si_no: orSiNo.value.trim(),
      remarks: remarks.value.trim(),
      items: validItems.value.map((line) => ({
        // Derived, not typed — the header remark carries the purpose.
        particular: categoryTitle(line.category),
        category: line.category as ExpenseCategory,
        department: line.department as ExpenseDepartment | null,
        amount: Number(line.amount),
      })),
    }
  }

  return {
    editingId, isEditing,
    payee, payeeAddress, payeeTin, voucherDate, cashAccountId, checkNo, orSiNo, remarks, items,
    categoryOptions, departmentOptions, accountOptions, metaForAccount, selectedAccount,
    voucherTotal, insufficientFunds, canSubmit, blockers,
    resetForm, loadFrom, addItem, removeItem, buildPayload,
    restoreDraft: draft.restore,
    clearDraft: draft.clear,
  }
}
