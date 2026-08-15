import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'
import { useDisbursementVouchersStore } from '@/stores/disbursementVouchersData'
import type { VoucherType, VoucherInput } from '@/stores/disbursementVouchersData'

// List + lifecycle actions for the Disbursement Vouchers page. Form state lives
// in useVoucherForm (called inside the dialog) — see the note there on why the
// two are separate composables.

export const headers = [
  { title: 'DV NO.',      key: 'dv_no',             sortable: true,  align: 'center' as const },
  { title: 'DATE',        key: 'voucher_date',      sortable: true,  align: 'center' as const },
  { title: 'PAYEE',       key: 'payee',             sortable: true,  align: 'center' as const },
  { title: 'PAID FROM',   key: 'cash_account_name', sortable: false, align: 'center' as const },
  { title: 'PARTICULARS', key: 'particulars',       sortable: false, align: 'center' as const },
  { title: 'AMOUNT',      key: 'total_amount',      sortable: true,  align: 'center' as const },
  { title: 'STATUS',      key: 'status',            sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',     key: 'actions',           sortable: false, align: 'center' as const },
] as const

const voucherStatusMeta: Record<string, { color: string; label: string; hint: string }> = {
  draft:     { color: 'grey',    label: 'DRAFT',     hint: 'Not yet printed. Editable; nothing has been recorded and no cash has moved.' },
  printed:   { color: 'info',    label: 'PRINTED',   hint: 'Printed and locked, out for signature. Ready to record.' },
  recorded:  { color: 'success', label: 'RECORDED',  hint: 'Expenses recorded and cash disbursed.' },
  cancelled: { color: 'error',   label: 'CANCELLED', hint: 'Cancelled before recording.' },
}

export function useDisbursementVouchers() {
  const voucherStore = useDisbursementVouchersStore()
  const financeStore = useFinanceDataStore()
  const { vouchers, loading } = storeToRefs(voucherStore)
  const { cashAccounts } = storeToRefs(financeStore)

  const showFormDialog = ref(false)
  const editTarget = ref<VoucherType | null>(null)

  const showPrintDialog = ref(false)
  const printTarget = ref<VoucherType | null>(null)
  // Which physical copy the open print view represents. Anything above 1 is a
  // reprint and must render the REPRINTED COPY mark, so a second copy can never
  // be mistaken for the original.
  const printCopyNo = ref(1)

  const showCancelDialog = ref(false)
  const cancelTarget = ref<VoucherType | null>(null)
  const cancelReason = ref('')

  function statusMeta(status: string) {
    return voucherStatusMeta[status] ?? voucherStatusMeta.draft
  }

  // The gate the accountant asked for. Everything the row renders keys off these.
  const canEdit = (voucher: VoucherType) => voucher.status === 'draft'
  const canPrint = (voucher: VoucherType) => voucher.status !== 'cancelled'
  const canRecord = (voucher: VoucherType) => voucher.status === 'printed'
  const canCancel = (voucher: VoucherType) => voucher.status !== 'recorded' && voucher.status !== 'cancelled'

  // Why Record Expense is unavailable, so a disabled button is never just dead.
  function recordBlockedReason(voucher: VoucherType): string {
    if (voucher.status === 'draft') return 'Print the voucher first — expenses can only be recorded against a printed, signed voucher.'
    if (voucher.status === 'recorded') return 'Expenses have already been recorded from this voucher.'
    if (voucher.status === 'cancelled') return 'This voucher was cancelled.'
    return ''
  }

  function particularsSummary(voucher: VoucherType): string {
    if (!voucher.items.length) return '—'
    const [first] = voucher.items
    const rest = voucher.items.length - 1
    return rest > 0 ? `${first.particular} (+${rest} more)` : first.particular
  }

  async function init() {
    await Promise.all([voucherStore.fetchVouchers(), financeStore.fetchCashAccounts()])
  }

  function openCreateDialog() {
    editTarget.value = null
    showFormDialog.value = true
  }

  function openEditDialog(voucher: VoucherType) {
    if (!canEdit(voucher)) return
    editTarget.value = voucher
    showFormDialog.value = true
  }

  function closeFormDialog() {
    showFormDialog.value = false
    editTarget.value = null
  }

  async function handleSubmit(payload: VoucherInput) {
    const result = editTarget.value
      ? await voucherStore.updateVoucher(editTarget.value.id, payload)
      : await voucherStore.createVoucher(payload)
    if (result.success) closeFormDialog()
    return result
  }

  // Stamps the print (locking a draft) BEFORE opening the printable view, so
  // what opens is always an accurate copy — including whether it is the
  // original or a reprint.
  async function openPrint(voucher: VoucherType) {
    const result = await voucherStore.markPrinted(voucher.id)
    if (!result.success) return
    printCopyNo.value = result.copyNo ?? 1
    printTarget.value = await voucherStore.fetchVoucherById(voucher.id)
    showPrintDialog.value = true
  }

  function closePrintDialog() {
    showPrintDialog.value = false
    printTarget.value = null
  }

  async function handleRecord(voucher: VoucherType) {
    await voucherStore.recordVoucherExpenses(voucher.id)
  }

  function openCancelDialog(voucher: VoucherType) {
    cancelTarget.value = voucher
    cancelReason.value = ''
    showCancelDialog.value = true
  }

  function closeCancelDialog() {
    showCancelDialog.value = false
    cancelTarget.value = null
    cancelReason.value = ''
  }

  async function handleCancel() {
    if (!cancelTarget.value) return
    const result = await voucherStore.cancelVoucher(cancelTarget.value.id, cancelReason.value.trim())
    if (result.success) closeCancelDialog()
  }

  return {
    vouchers, cashAccounts, loading,
    showFormDialog, editTarget,
    showPrintDialog, printTarget, printCopyNo,
    showCancelDialog, cancelTarget, cancelReason,
    statusMeta, canEdit, canPrint, canRecord, canCancel, recordBlockedReason, particularsSummary,
    init, openCreateDialog, openEditDialog, closeFormDialog, handleSubmit,
    openPrint, closePrintDialog, handleRecord,
    openCancelDialog, closeCancelDialog, handleCancel,
  }
}
