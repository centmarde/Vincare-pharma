import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { expenseDepartments } from '@/stores/financeData'
import { useExpenseAccounts } from './useExpenseAccounts'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { useCustomersDataStore } from '@/stores/customersData'
import type { ExpenseCategory, ExpenseDepartment } from '@/stores/financeData'
import { emptySignatories, isRebateAccount } from '@/stores/disbursementVouchersData'
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
//   - amount starts at 0, which the amount field (MoneyField) shows as blank
//     with its placeholder. It used to be null, because a plain number input
//     rendered 0 as a "0" that looked filled but wasn't a valid amount. A
//     draft saved back then can still hold null; every read coerces it.
//   - no per-line free text. The voucher carries ONE `particulars` on the
//     header, fanned out to every line on save (the database column is
//     per-line). The printed box is split: PARTICULARS on the left, ACCOUNT
//     NAME on the right. The header Reference/Remarks is separate and unchanged.
type VoucherFormLine = {
  /** A GL account code from the chart of accounts; '' until one is picked. */
  category: ExpenseCategory
  amount: number
}

/**
 * The printed voucher always shows at least this many account rows, padded
 * with blanks when it has fewer — so an ordinary voucher keeps the standard
 * height, and the RECORDED stamp stays calibrated for it.
 *
 * It is NOT a cap (it was, until 2026-10-11). Staff asked to put more accounts
 * on one voucher; one that has more simply prints longer, and its stamp
 * position is theirs to adjust — the print dialog says so when it happens.
 */
export const standardVoucherRows = 5

/**
 * How many lines of particulars fit beside the account rows.
 *
 * Derived, not chosen: the particulars cell sits BESIDE the account block in the
 * printed sheet, so its height budget is that block's height —
 * standardVoucherRows rows at the 22px min-height each `.dv-cell` carries,
 * about 110px, which is ~7 lines at the sheet's line height. Anything longer
 * stretches the cell, pushes the signature row down, and breaks the one thing
 * the layout must hold: the signature row's distance from the top of the sheet
 * stays constant, because the RECORDED stamp is overprinted against it.
 *
 * Capped at entry rather than clipped at print — silently dropping part of a
 * description off a financial document is not an option.
 */
export const maxParticularsLines = 7

/**
 * What a new voucher starts with when it is raised from Supplier Payments:
 * the supplier, the balance being paid and which invoices it covers. Only a
 * starting point — every field stays editable before the voucher is saved.
 */
export type VoucherPrefill = {
  supplierId: number
  supplierName: string | null
  amount: number
  particulars: string
  /** Not printed — the PO numbers, so the voucher can be found by them. */
  remarks: string
}

// No default account. The old default was 'other', which the GL projector's
// else-branch booked to 7080 Office Supplies — so a line left untouched was
// charged somewhere real without anyone choosing it. Blank forces a choice and
// is caught by `blockers` below.
const emptyItem = (): VoucherFormLine => ({
  category: '',
  amount: 0,
})

export function useVoucherForm(accounts: () => ClassifiedCashAccount[]) {
  const editingId = ref<number | null>(null)

  /**
   * Who the voucher pays. 'supplier' routes the whole voucher to Accounts
   * Payable — recording it produces supplier_payment rows that move the
   * supplier's outstanding balance, instead of expenses. One supplier per
   * voucher, because one cheque goes to one payee.
   */
  const payeeType = ref<'other' | 'supplier'>('other')
  const supplierId = ref<number | null>(null)
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
  // The customer a rebate is for. Only asked when a line is charged to a rebate
  // account; it is how the rebate reaches that customer on Rebate Payouts.
  const rebateCustomerId = ref<number | null>(null)
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
    // v6: payeeType + supplierId joined the shape. Bumping discards older
    // drafts rather than restoring one with the pay-to half missing.
    // v7: rebateCustomerId joined the shape.
    version: 7,
    // Never while editing: the draft holds the NEW voucher someone was typing,
    // and an edit loaded into the same fields would overwrite it.
    enabled: () => editingId.value === null,
    refs: { payeeType, supplierId, payee, payeeAddress, payeeTin, voucherDate, cashAccountId, checkNo, orSiNo, department, particulars, remarks, rebateCustomerId, signatories, items },
    isEmpty: () => !payee.value && !payeeAddress.value && !payeeTin.value && cashAccountId.value == null
      && supplierId.value == null && rebateCustomerId.value == null
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

  // Charged-to accounts come from the chart of accounts, so adding one there
  // is all it takes for it to appear here.
  const { expenseAccountOptions, expenseAccountLabel, ensureLoaded: ensureAccountsLoaded } = useExpenseAccounts()

  const suppliersStore = useSuppliersDataStore()
  const { suppliers } = storeToRefs(suppliersStore)

  const supplierOptions = computed(() =>
    suppliers.value
      .filter((supplier) => supplier.is_active !== false)
      .map((supplier) => ({ value: supplier.id, title: supplier.name ?? `Supplier ${supplier.id}` })),
  )

  /** Load suppliers once, for the pay-to picker. */
  async function ensureSuppliersLoaded() {
    if (suppliers.value.length) return
    await suppliersStore.fetchSuppliers({ activeOnly: true })
  }

  /**
   * Picking a supplier fills the printed payee block from their record, so the
   * voucher prints a real name, address and TIN without retyping. Only fills
   * blanks on an EDIT — a voucher saved with a hand-corrected address keeps it.
   */
  watch(supplierId, (id) => {
    if (id === null) return
    const supplier = suppliers.value.find((s) => s.id === id)
    if (!supplier) return
    payee.value = supplier.name ?? ''
    if (!payeeAddress.value) payeeAddress.value = supplier.address ?? ''
    if (!payeeTin.value) payeeTin.value = supplier.tin_no ?? ''
  })

  // Switching back to a non-supplier payee clears the link and the name it
  // filled in, so a leftover supplier_id cannot ride along on an expense
  // voucher and silently turn it into a payable settlement.
  watch(payeeType, (type) => {
    if (type === 'other' && supplierId.value !== null) {
      supplierId.value = null
      payee.value = ''
    }
  })
  const customersStore = useCustomersDataStore()
  const { rebateCustomers } = storeToRefs(customersStore)

  /** In-House and Ethical customers, labelled with their department. */
  const rebateCustomerOptions = computed(() =>
    rebateCustomers.value.map((customer) => ({
      value: customer.id,
      title: customer.name ?? `Customer ${customer.id}`,
      subtitle: customer.department === 'inhouse' ? 'In-House' : 'Ethical',
    })),
  )

  /** Load the customers once, for the rebate picker. */
  async function ensureRebateCustomersLoaded() {
    if (rebateCustomers.value.length) return
    await customersStore.fetchRebateCustomers()
  }

  const categoryOptions = expenseAccountOptions
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

  // A line only counts once it has BOTH an account and an amount. An amount
  // with no account can't be posted anywhere, so counting it would let the
  // form submit a line the GL has nowhere to put.
  /** True while the voucher pays a supplier, where every line is Accounts
   *  Payable and there is no per-line account to pick. */
  const isSupplierVoucher = computed(() => payeeType.value === 'supplier')

  /** The account a supplier voucher's lines are charged to. */
  const accountsPayableCode = '2010'

  /** Whether any line pays a rebate — the only time the customer is asked. */
  const hasRebateLine = computed(() =>
    !isSupplierVoucher.value && items.value.some((line) => isRebateAccount(line.category)))

  const validItems = computed(() =>
    items.value.filter((line) =>
      Number(line.amount) > 0 && (isSupplierVoucher.value || !!line.category)),
  )

  /** Lines where an amount was typed but no account picked — the likely slip.
   *  Never applies to a supplier voucher: those lines have no account field. */
  const linesMissingAccount = computed(() =>
    isSupplierVoucher.value
      ? 0
      : items.value.filter((line) => Number(line.amount) > 0 && !line.category).length,
  )

  // What's still stopping a save. Drives a visible hint next to the submit
  // button — a disabled button with no explanation is unusable, since nothing
  // on the form says which cell it's waiting on.
  // Guards the printed sheet's standard height. (Accounts are no longer
  // capped — see standardVoucherRows.)
  const particularsLines = computed(() => particulars.value.split('\n').length)
  const particularsTooTall = computed(() => particularsLines.value > maxParticularsLines)

  const blockers = computed(() => {
    const missing: string[] = []
    if (isSupplierVoucher.value && supplierId.value === null) missing.push('a supplier')
    if (!payee.value.trim()) missing.push('Payee')
    if (!voucherDate.value) missing.push('Date')
    if (cashAccountId.value === null) missing.push('Payment Mode')
    if (!validItems.value.length) missing.push('an account with an amount')
    if (linesMissingAccount.value) {
      missing.push(linesMissingAccount.value === 1
        ? 'an account on the line that has an amount'
        : `an account on each of the ${linesMissingAccount.value} lines that have amounts`)
    }
    if (insufficientFunds.value) missing.push('a total within the account balance')
    if (particularsTooTall.value) {
      missing.push(`a particulars of ${maxParticularsLines} lines or fewer`)
    }
    return missing
  })

  const canSubmit = computed(() => blockers.value.length === 0)

  const isEditing = computed(() => editingId.value !== null)

  /** Blank every field, leaving any saved draft where it is. */
  function clearFields() {
    editingId.value = null
    payeeType.value = 'other'
    supplierId.value = null
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
    rebateCustomerId.value = null
    signatories.value = emptySignatories()
    items.value = [emptyItem()]
  }

  /** Blank the form AND discard the saved draft — the voucher is done with. */
  function resetForm() {
    clearFields()
    draft.clear()
  }

  /** Start a supplier payment from what Supplier Payments passed over. */
  function applyPrefill(prefill: VoucherPrefill) {
    payeeType.value = 'supplier'
    supplierId.value = prefill.supplierId
    // Filled here as well as by the supplierId watcher: that watcher does not
    // fire when the same supplier was picked last time, and it cannot find a
    // supplier missing from the active-only list.
    const supplier = suppliers.value.find((s) => s.id === prefill.supplierId)
    payee.value = supplier?.name ?? prefill.supplierName ?? ''
    payeeAddress.value = supplier?.address ?? ''
    payeeTin.value = supplier?.tin_no ?? ''
    particulars.value = prefill.particulars
    remarks.value = prefill.remarks
    items.value = [{ category: '', amount: prefill.amount }]
  }

  // Prefill from an existing DRAFT voucher. Printed vouchers are immutable, so
  // the caller gates on that before ever opening the form in edit mode.
  function loadFrom(voucher: VoucherType) {
    editingId.value = voucher.id
    payeeType.value = voucher.supplier_id ? 'supplier' : 'other'
    supplierId.value = voucher.supplier_id
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
      (line) => line.particular.trim() && line.particular !== expenseAccountLabel(line.category),
    )?.particular ?? ''
    remarks.value = voucher.remarks ?? ''
    rebateCustomerId.value = voucher.customer_id
    signatories.value = { ...emptySignatories(), ...voucher.signatories }
    items.value = voucher.items.length
      ? voucher.items.map((line) => ({
        category: line.category,
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
      // null keeps this an ordinary expense voucher; set makes recording it
      // produce supplier_payment rows against Accounts Payable instead.
      supplier_id: payeeType.value === 'supplier' ? supplierId.value : null,
      // Dropped when no line is a rebate any more, so a voucher re-pointed to
      // fuel does not stay listed under a customer's rebates.
      customer_id: hasRebateLine.value ? rebateCustomerId.value : null,
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
        particular: particulars.value.trim() || expenseAccountLabel(line.category),
        // A supplier voucher settles Accounts Payable, so its lines record
        // that rather than an expense account they were never charged to.
        category: (isSupplierVoucher.value ? accountsPayableCode : line.category) as ExpenseCategory,
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
    particularsLines, particularsTooTall, linesMissingAccount,
    payeeType, supplierId, isSupplierVoucher, supplierOptions, ensureSuppliersLoaded,
    rebateCustomerId, rebateCustomerOptions, hasRebateLine, ensureRebateCustomersLoaded,
    expenseAccountLabel, ensureAccountsLoaded,
    clearFields, resetForm, loadFrom, applyPrefill, addItem, removeItem, buildPayload, setSignatory, applyCachedSignatories,
    restoreDraft: draft.restore,
    clearDraft: draft.clear,
  }
}
