import { ref, computed } from 'vue'
import { categoryTitle, expenseCategories, expenseDepartments } from '@/stores/financeData'
import type { ExpenseCategory, ExpenseDepartment } from '@/stores/financeData'
import { emptySignatories } from '@/stores/disbursementVouchersData'
import type { VoucherType, VoucherInput, VoucherSignatoryField } from '@/stores/disbursementVouchersData'
import { cashClassifications, classificationMeta } from '@/utils/cashAccountTypes'
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
//   - a free-text `particular` per line (REVERSES the earlier "no per-line
//     description" rule). The accountant asked for the PARTICULARS box to be
//     split in two — the expense category on one side, the purpose of that
//     specific spend on the other — rather than one Reference on the header
//     covering every line at once. The header Reference/Remarks is unchanged
//     and still prints; it is voucher-level context, not the line's purpose.
type VoucherFormLine = {
  category: ExpenseCategory
  /**
   * Free-text purpose for THIS line ("Butuan–Zamboanga round trip"), printed in
   * its own column beside the category. Stored in the long-existing
   * `disbursement_voucher_items.particular`, which until now only held a copy of
   * the category's title and carried no information of its own.
   */
  particular: string
  amount: number | null
}

const emptyItem = (): VoucherFormLine => ({
  category: 'other',
  particular: '',
  amount: null,
})

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
  // ONE department per voucher, not one per line. It was a per-line select,
  // which meant re-picking the same value on every row; no voucher in the live
  // data has ever used more than one department. Still WRITTEN to every line on
  // save, because that is where the generated expense reads it from.
  const department = ref<ExpenseDepartment | null>(null)
  const remarks = ref('')
  // Typed names for the four signature blocks — printed above the rule so only
  // the signature itself is handwritten.
  const signatories = ref(emptySignatories())
  const items = ref<VoucherFormLine[]>([emptyItem()])

  // A voucher is an input-heavy multi-line form — losing one to a reload
  // mid-entry is exactly what useFormDraft exists for. Only drafts are ever
  // editable, so a restored draft can never resurrect a printed document.
  const draft = useFormDraft({
    key: 'finance-disbursement-voucher',
    // v2: `signatories` joined the persisted shape. v3: each line gained a
    // free-text `particular`. v4: `department` moved from the line to the
    // header. Bumping discards older drafts rather than restoring a voucher
    // with part of its shape silently missing.
    version: 4,
    refs: { payee, payeeAddress, payeeTin, voucherDate, cashAccountId, checkNo, orSiNo, department, remarks, signatories, items },
    isEmpty: () => !payee.value && !payeeAddress.value && !payeeTin.value && cashAccountId.value == null
      && !checkNo.value && !orSiNo.value && !remarks.value
      && !hasAnySignatory()
      && items.value.every((line) => !line.amount),
  })

  // Remembers the last names used, so the same officers don't get retyped on
  // every voucher. Separate from the form draft on purpose: the draft is
  // cleared on submit, whereas these should survive precisely BECAUSE a
  // voucher was submitted. useFormDraft handles the per-user namespacing and
  // is wiped on logout, so the names never leak between accounts.
  const cachedSignatories = ref(emptySignatories())
  const signatoryCache = useFormDraft({
    key: 'finance-voucher-signatories',
    version: 1,
    refs: { cachedSignatories },
    isEmpty: () => Object.values(cachedSignatories.value).every((v) => !v),
  })

  function hasAnySignatory() {
    return Object.values(signatories.value).some((v) => v)
  }

  // v-model on a member expression of a destructured ref does not reliably
  // unwrap — the write lands on the ref object instead of its value, so the
  // field stays blank and the payload saves null. Go through an explicit setter.
  function setSignatory(field: VoucherSignatoryField, value: string) {
    signatories.value[field] = value ?? ''
    cachedSignatories.value[field] = value ?? ''
  }

  /** Fill blank signature blocks from the last voucher's names. Never
   *  overwrites a name already typed or loaded from the voucher being edited. */
  function applyCachedSignatories() {
    signatoryCache.restore()
    for (const key of Object.keys(signatories.value) as VoucherSignatoryField[]) {
      if (!signatories.value[key]) signatories.value[key] = cachedSignatories.value[key] ?? ''
    }
  }

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
    accountOptions.value.find((o) => o.value === id)?.meta ?? cashClassifications[0]

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
    if (cashAccountId.value === null) missing.push('Payment Mode')
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
    department.value = null
    remarks.value = ''
    signatories.value = emptySignatories()
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
    // Department is stored per line but entered once. Every live voucher uses a
    // single department across its lines, so the first non-null one is it.
    department.value = voucher.items.find((line) => line.department)?.department ?? null
    remarks.value = voucher.remarks ?? ''
    signatories.value = { ...emptySignatories(), ...voucher.signatories }
    items.value = voucher.items.length
      ? voucher.items.map((line) => ({
        category: line.category,
        // Vouchers saved before per-line explanations stored the category's
        // title here. Show those as empty rather than pre-filling the box with
        // a word the category column already says.
        particular: line.particular === categoryTitle(line.category) ? '' : (line.particular ?? ''),
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
      signatories: {
        prepared_by_name: signatories.value.prepared_by_name.trim(),
        checked_by_name: signatories.value.checked_by_name.trim(),
        approved_by_name: signatories.value.approved_by_name.trim(),
        received_by_name: signatories.value.received_by_name.trim(),
      },
      items: validItems.value.map((line) => ({
        // The typed purpose. Falls back to the category's title when left blank
        // so the column is never empty in the database.
        particular: line.particular.trim() || categoryTitle(line.category),
        category: line.category as ExpenseCategory,
        // Fanned out from the single header value.
        department: department.value,
        amount: Number(line.amount),
      })),
    }
  }

  return {
    editingId, isEditing,
    payee, payeeAddress, payeeTin, voucherDate, cashAccountId, checkNo, orSiNo, department, remarks, signatories, items,
    categoryOptions, departmentOptions, accountOptions, metaForAccount, selectedAccount,
    voucherTotal, insufficientFunds, canSubmit, blockers,
    resetForm, loadFrom, addItem, removeItem, buildPayload, setSignatory, applyCachedSignatories,
    restoreDraft: draft.restore,
    clearDraft: draft.clear,
  }
}
