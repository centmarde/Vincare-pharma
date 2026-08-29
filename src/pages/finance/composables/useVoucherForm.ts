import { ref, computed } from 'vue'
import { useToast } from 'vue-toastification'
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
//   - no per-line free text. The voucher carries ONE `particulars` on the
//     header, fanned out to every line on save (the database column is
//     per-line). The printed box is split: PARTICULARS on the left, ACCOUNT
//     NAME on the right. The header Reference/Remarks is separate and unchanged.
type VoucherFormLine = {
  category: ExpenseCategory
  amount: number | null
}

/**
 * A voucher prints a FIXED five account rows, padded with blanks when it has
 * fewer. That fixed height is what lets the RECORDED stamp be overprinted at
 * one calibrated position on every voucher — a variable-length sheet would move
 * the signature row and the stamp would miss. A sixth account goes on a second
 * voucher.
 */
export const MAX_VOUCHER_ACCOUNTS = 5

/**
 * How many lines of particulars fit beside the account rows.
 *
 * Derived, not chosen: the particulars cell sits BESIDE the account block in the
 * printed sheet, so its height budget is that block's height —
 * MAX_VOUCHER_ACCOUNTS rows at the 22px min-height each `.dv-cell` carries,
 * about 110px, which is ~7 lines at the sheet's line height. Anything longer
 * stretches the cell, pushes the signature row down, and breaks the one thing
 * the layout must hold: the signature row's distance from the top of the sheet
 * stays constant, because the RECORDED stamp is overprinted against it.
 *
 * Capped at entry rather than clipped at print — silently dropping part of a
 * description off a financial document is not an option.
 */
export const MAX_PARTICULARS_LINES = 7

const emptyItem = (): VoucherFormLine => ({
  category: 'other',
  amount: null,
})

export function useVoucherForm(accounts: () => ClassifiedCashAccount[]) {
  // Inside the factory, not at module scope -- a store/composable factory called
  // on import runs before Pinia is installed.
  const toast = useToast()
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
  // ONE particular per voucher, not one per line. Per the accountant a voucher
  // describes a single purpose, so a per-line box meant retyping the same
  // sentence on every row. Still WRITTEN to every line, because that is the
  // column the database has and where the generated expense reads its remark.
  const particulars = ref('')
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
    // free-text `particular`. v4: `department` moved to the header. v5:
    // `particular` moved to the header too. Bumping discards older drafts
    // rather than restoring a voucher with part of its shape silently missing.
    version: 5,
    refs: { payee, payeeAddress, payeeTin, voucherDate, cashAccountId, checkNo, orSiNo, department, particulars, remarks, signatories, items },
    isEmpty: () => !payee.value && !payeeAddress.value && !payeeTin.value && cashAccountId.value == null
      && !checkNo.value && !orSiNo.value && !particulars.value.trim() && !remarks.value
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
  // Both of these guard the printed sheet's fixed height rather than the data.
  // A voucher loaded from an older shape can carry more accounts than the form
  // would now let anyone add, so the cap has to be checked on save too, not
  // only in addItem().
  const particularsLines = computed(() => particulars.value.split('\n').length)
  // Counted on what actually saves, not on the rows on screen: clearing the
  // amounts off an over-long legacy voucher until it fits is a valid way to
  // resolve one, and counting blank rows would block that.
  const tooManyAccounts = computed(() => validItems.value.length > MAX_VOUCHER_ACCOUNTS)
  const particularsTooTall = computed(() => particularsLines.value > MAX_PARTICULARS_LINES)

  const blockers = computed(() => {
    const missing: string[] = []
    if (!payee.value.trim()) missing.push('Payee')
    if (!voucherDate.value) missing.push('Date')
    if (cashAccountId.value === null) missing.push('Payment Mode')
    if (!validItems.value.length) missing.push('an account with an amount')
    if (insufficientFunds.value) missing.push('a total within the account balance')
    if (tooManyAccounts.value) {
      missing.push(`no more than ${MAX_VOUCHER_ACCOUNTS} accounts (move the rest to a second voucher)`)
    }
    if (particularsTooTall.value) {
      missing.push(`a particulars of ${MAX_PARTICULARS_LINES} lines or fewer`)
    }
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
    particulars.value = ''
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
    // Every line carries the same particular; older vouchers stored the
    // category's own title there, which is not a description worth restoring.
    // Scan for the first line holding a REAL one rather than stopping at the
    // first non-empty: a voucher from the per-line era can have the fallback
    // title on line 1 and the actual description further down, and stopping
    // early would blank it here and then overwrite it with titles on save.
    particulars.value = voucher.items.find(
      (line) => line.particular.trim() && line.particular !== categoryTitle(line.category),
    )?.particular ?? ''
    remarks.value = voucher.remarks ?? ''
    signatories.value = { ...emptySignatories(), ...voucher.signatories }
    items.value = voucher.items.length
      ? voucher.items.map((line) => ({
        category: line.category,
        amount: line.amount,
      }))
      : [emptyItem()]
  }

  const canAddItem = computed(() => items.value.length < MAX_VOUCHER_ACCOUNTS)

  function addItem() {
    if (!canAddItem.value) {
      toast.warning(
        `A voucher holds ${MAX_VOUCHER_ACCOUNTS} accounts. Record the rest on a second voucher.`,
      )
      return
    }
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
        // Fanned out from the single header value; falls back to the category's
        // title when left blank so the column is never empty in the database.
        particular: particulars.value.trim() || categoryTitle(line.category),
        category: line.category as ExpenseCategory,
        // Fanned out from the single header value.
        department: department.value,
        amount: Number(line.amount),
      })),
    }
  }

  return {
    editingId, isEditing,
    payee, payeeAddress, payeeTin, voucherDate, cashAccountId, checkNo, orSiNo, department, particulars, remarks, signatories, items,
    categoryOptions, departmentOptions, accountOptions, metaForAccount, selectedAccount,
    voucherTotal, insufficientFunds, canSubmit, blockers,
    canAddItem, particularsLines, tooManyAccounts, particularsTooTall,
    resetForm, loadFrom, addItem, removeItem, buildPayload, setSignatory, applyCachedSignatories,
    restoreDraft: draft.restore,
    clearDraft: draft.clear,
  }
}
