import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAccountTransfersStore } from '@/stores/accountTransfersData'
import { useFinanceDataStore } from '@/stores/financeData'
import type { CashAccountType } from '@/stores/financeData'
import { classificationMeta } from '@/utils/cashAccountTypes'
import { formatCurrency, toLocalISODate } from '@/utils/helpers'

// Transfers between our own accounts on the Cash Accounts page: any account to
// any other (fund BDO VP 2290 from AUB VP 615-5). See accountTransfersData.

export const transferHeaders = [
  { title: 'TRF NO.',        key: 'reference_no',      sortable: true,  align: 'center' as const },
  { title: 'DATE',           key: 'transfer_date',     sortable: true,  align: 'center' as const },
  { title: 'FROM',           key: 'from_account_name', sortable: false, align: 'center' as const },
  { title: 'TO',             key: 'to_account_name',   sortable: false, align: 'center' as const },
  { title: 'REFERENCE NO.',  key: 'confirmation_no',   sortable: false, align: 'center' as const },
  { title: 'AMOUNT',         key: 'amount',            sortable: true,  align: 'center' as const },
  { title: 'STATUS',         key: 'status',            sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',        key: 'actions',           sortable: false, align: 'center' as const },
] as const

export function useAccountTransfers() {
  const store = useAccountTransfersStore()
  const financeStore = useFinanceDataStore()
  const { transfers, loading } = storeToRefs(store)
  const { cashAccounts } = storeToRefs(financeStore)

  const showDialog = ref(false)
  const fromAccountId = ref<number | null>(null)
  const toAccountId = ref<number | null>(null)
  const amount = ref(0)
  const fee = ref(0)
  const transferDate = ref(toLocalISODate(new Date()))
  const confirmationNo = ref('')
  const remarks = ref('')

  const activeAccounts = computed(() => cashAccounts.value.filter((a) => a.is_active))
  const optionFor = (a: CashAccountType) => ({
    value: a.id,
    title: `${a.name} — ${formatCurrency(a.balance ?? 0)}`,
    subtitle: classificationMeta(a.classification).title,
  })
  const sourceOptions = computed(() => activeAccounts.value.map(optionFor))
  // Never the source itself.
  const destinationOptions = computed(() =>
    activeAccounts.value.filter((a) => a.id !== fromAccountId.value).map(optionFor))

  const source = computed(() => cashAccounts.value.find((a) => a.id === fromAccountId.value) ?? null)
  const available = computed(() => source.value?.balance ?? 0)
  /** Amount plus fee — what leaves the source. */
  const leaving = computed(() => (amount.value || 0) + (fee.value || 0))
  const exceedsAvailable = computed(() => source.value !== null && leaving.value > available.value + 0.005)
  const remaining = computed(() => available.value - leaving.value)

  // A visible reason beats a dead disabled button.
  const blockers = computed(() => {
    const missing: string[] = []
    if (fromAccountId.value === null) missing.push('the account it comes from')
    if (toAccountId.value === null) missing.push('the account it goes to')
    if (!(amount.value > 0)) missing.push('an amount')
    if (!transferDate.value) missing.push('a date')
    if (exceedsAvailable.value) missing.push('an amount within what the account holds')
    return missing
  })
  const canSubmit = computed(() => blockers.value.length === 0)

  const statusMeta = (status: string) => status === 'cleared'
    ? { color: 'success', label: 'CLEARED', hint: 'Confirmed against the bank statement.' }
    : { color: 'warning', label: 'IN TRANSIT', hint: 'Recorded, not yet confirmed against the bank statement.' }

  function resetForm() {
    fromAccountId.value = null
    toAccountId.value = null
    amount.value = 0
    fee.value = 0
    transferDate.value = toLocalISODate(new Date())
    confirmationNo.value = ''
    remarks.value = ''
  }

  /** Optionally preset the source, e.g. from an account's own menu. */
  function openDialog(fromId: number | null = null) {
    resetForm()
    fromAccountId.value = fromId
    showDialog.value = true
  }

  function closeDialog() {
    showDialog.value = false
    resetForm()
  }

  // Switching the source to the account already chosen as destination clears
  // the destination rather than leaving a transfer into itself.
  function setFromAccount(id: number | null) {
    fromAccountId.value = id
    if (id !== null && toAccountId.value === id) toAccountId.value = null
  }

  // One transfer per press: set before the first await, so a second press (or
  // Enter on the focused button) while it saves is turned away instead of
  // recording the same transfer twice.
  const submitting = ref(false)

  async function submit() {
    if (submitting.value || !canSubmit.value || fromAccountId.value === null || toAccountId.value === null) return
    submitting.value = true
    try {
      const result = await store.recordTransfer({
        fromAccountId: fromAccountId.value,
        toAccountId: toAccountId.value,
        amount: amount.value,
        fee: fee.value || 0,
        transferDate: transferDate.value,
        confirmationNo: confirmationNo.value.trim() || undefined,
        remarks: remarks.value.trim() || undefined,
      })
      if (result.success) closeDialog()
    } finally {
      submitting.value = false
    }
  }

  async function clearTransfer(id: number) {
    await store.markCleared(id)
  }

  async function init() {
    await Promise.all([store.fetchTransfers(), cashAccounts.value.length ? Promise.resolve() : financeStore.fetchCashAccounts()])
  }

  return {
    transfers, loading,
    showDialog, fromAccountId, toAccountId, amount, fee, transferDate, confirmationNo, remarks,
    sourceOptions, destinationOptions, available, leaving, remaining, exceedsAvailable,
    blockers, canSubmit, statusMeta, submitting,
    init, openDialog, closeDialog, setFromAccount, submit, clearTransfer,
  }
}
