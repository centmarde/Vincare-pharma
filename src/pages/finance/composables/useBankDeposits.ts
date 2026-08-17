import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useBankDepositsStore } from '@/stores/bankDepositsData'
import { useFinanceDataStore } from '@/stores/financeData'
import type { CashAccountType } from '@/stores/financeData'
import { DEFAULT_DEPOSIT_THRESHOLD } from '@/utils/cashAccountTypes'
import { formatCurrency } from '@/utils/helpers'

// Bank deposit list + form for the Cash Accounts page. A deposit banks cash the
// company is already holding: Cash on Hand -> Cash in Bank. It is a transfer,
// not new money, which is why the form asks for a source rather than just an
// amount.

export const depositHeaders = [
  { title: 'DEP NO.',        key: 'reference_no',      sortable: true,  align: 'center' as const },
  { title: 'DEPOSIT DATE',   key: 'deposit_date',      sortable: true,  align: 'center' as const },
  { title: 'FROM',           key: 'from_account_name', sortable: false, align: 'center' as const },
  { title: 'TO',             key: 'to_account_name',   sortable: false, align: 'center' as const },
  { title: 'VALIDATION NO.', key: 'validation_no',     sortable: false, align: 'center' as const },
  { title: 'AMOUNT',         key: 'amount',            sortable: true,  align: 'center' as const },
  { title: 'STATUS',         key: 'status',            sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',        key: 'actions',           sortable: false, align: 'center' as const },
] as const

const todayISO = () => new Date().toISOString().slice(0, 10)

export function useBankDeposits() {
  const depositStore = useBankDepositsStore()
  const financeStore = useFinanceDataStore()
  const toast = useToast()
  const { deposits, loading } = storeToRefs(depositStore)
  const { cashAccounts } = storeToRefs(financeStore)

  const showDepositDialog = ref(false)
  const fromAccountId = ref<number | null>(null)
  const toAccountId = ref<number | null>(null)
  const amount = ref<number | null>(null)
  const depositDate = ref(todayISO())
  const validationNo = ref('')
  const depositRemarks = ref('')

  // Both an imprest petty cash fund and a collections account are stored as
  // classification 'PETTY_CASH' (both are GL 1010), but they behave oppositely:
  // an imprest fund is spent DOWN and topped back UP to its float, while a
  // collections account accumulates UP and is drained by banking it.
  //
  // The float is the only thing in the schema that separates them, so use it.
  // Depositing an imprest fund into the bank isn't a deposit — it liquidates the
  // fund and leaves the custodian nothing to disburse from.
  const isCollectionsAccount = (a: CashAccountType) =>
    a.is_active && a.classification === 'PETTY_CASH' && !a.float_amount

  // Source: cash held for banking. Destination: bank accounts only — you cannot
  // "deposit" into a cash drawer or a time placement.
  const sourceOptions = computed(() =>
    cashAccounts.value
      .filter(isCollectionsAccount)
      .map((a) => ({ value: a.id, title: `${a.name} — ${formatCurrency(a.balance ?? 0)} on hand` })),
  )

  // Undeposited cash above what the company should be holding. The mirror of the
  // petty cash replenishment warning — that one fires when a fund runs too low,
  // this fires when collections pile up and should be banked.
  const overThreshold = computed(() =>
    cashAccounts.value.filter((a) => isCollectionsAccount(a) && (a.balance ?? 0) > DEFAULT_DEPOSIT_THRESHOLD),
  )

  const depositReminder = computed(() => {
    if (!overThreshold.value.length) return ''
    const names = overThreshold.value
      .map((a) => `${a.name} (${formatCurrency(a.balance ?? 0)})`)
      .join(', ')
    return `Undeposited cash is above ${formatCurrency(DEFAULT_DEPOSIT_THRESHOLD)}: ${names}. Bank it — cash on hand is usually only insured up to a limit.`
  })

  const destinationOptions = computed(() =>
    cashAccounts.value
      .filter((a) => a.is_active && a.classification === 'CASA')
      .map((a) => ({ value: a.id, title: `${a.name} — ${formatCurrency(a.balance ?? 0)}` })),
  )

  const selectedSource = computed(() =>
    cashAccounts.value.find((a) => a.id === fromAccountId.value) ?? null,
  )

  const onHand = computed(() => selectedSource.value?.balance ?? 0)

  const exceedsOnHand = computed(() =>
    selectedSource.value !== null && (amount.value ?? 0) > onHand.value + 0.005,
  )

  const remainingOnHand = computed(() => onHand.value - (amount.value ?? 0))

  // A visible reason beats a dead disabled button.
  const blockers = computed(() => {
    const missing: string[] = []
    if (fromAccountId.value === null) missing.push('source account')
    if (toAccountId.value === null) missing.push('destination bank account')
    if (!amount.value || amount.value <= 0) missing.push('an amount')
    if (!depositDate.value) missing.push('a deposit date')
    if (!validationNo.value.trim()) missing.push('the bank validation / slip number')
    if (exceedsOnHand.value) missing.push('an amount within what is on hand')
    return missing
  })

  const canSubmit = computed(() => blockers.value.length === 0)

  const statusMeta = (status: string) => status === 'cleared'
    ? { color: 'success', label: 'CLEARED', hint: 'Confirmed against the bank statement.' }
    : { color: 'warning', label: 'IN TRANSIT', hint: 'Recorded but not yet confirmed against the bank statement — a deposit in transit for reconciliation.' }

  async function init() {
    await Promise.all([depositStore.fetchDeposits(), financeStore.fetchCashAccounts()])
  }

  function resetForm() {
    fromAccountId.value = null
    toAccountId.value = null
    amount.value = null
    depositDate.value = todayISO()
    validationNo.value = ''
    depositRemarks.value = ''
  }

  function openDepositDialog() {
    resetForm()
    // Only one of each in most setups — preselect so the common case is two
    // fields instead of four.
    if (sourceOptions.value.length === 1) fromAccountId.value = sourceOptions.value[0].value
    if (destinationOptions.value.length === 1) toAccountId.value = destinationOptions.value[0].value
    showDepositDialog.value = true
  }

  function closeDepositDialog() {
    showDepositDialog.value = false
    resetForm()
  }

  async function submitDeposit() {
    if (!canSubmit.value || fromAccountId.value === null || toAccountId.value === null) return
    const result = await depositStore.recordDeposit({
      fromAccountId: fromAccountId.value,
      toAccountId: toAccountId.value,
      amount: amount.value ?? 0,
      depositDate: depositDate.value,
      validationNo: validationNo.value.trim(),
      remarks: depositRemarks.value.trim() || undefined,
    })
    if (result.success) closeDepositDialog()
  }

  async function clearDeposit(id: number) {
    await depositStore.markCleared(id)
  }

  // Nothing to deposit from and nowhere to deposit to — the button explains
  // itself rather than sitting there disabled.
  const setupHint = computed(() => {
    // Imprest petty cash funds are excluded on purpose (see isCollectionsAccount),
    // so say so — otherwise an existing petty cash account makes this look wrong.
    if (!sourceOptions.value.length) return 'No Cash on Hand account for collections exists yet — add one above (Petty Cash classification, no float amount). Imprest petty cash funds are excluded, since banking one would liquidate the fund.'
    if (!destinationOptions.value.length) return 'No bank (CASA) account exists yet — add one above.'
    return ''
  })

  function warnSetup() {
    if (setupHint.value) toast.warning(setupHint.value)
  }

  return {
    deposits, loading,
    showDepositDialog, fromAccountId, toAccountId, amount, depositDate, validationNo, depositRemarks,
    sourceOptions, destinationOptions, selectedSource, onHand, remainingOnHand, exceedsOnHand,
    blockers, canSubmit, statusMeta, setupHint, depositReminder,
    init, openDepositDialog, closeDepositDialog, submitDeposit, clearDeposit, warnSetup,
  }
}
