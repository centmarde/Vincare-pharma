import { ref, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useEthicalDataStore } from '@/stores/ethicalData'
import type { EthicalOrderType, CollectionType, Shortfall } from '@/stores/ethicalData'
import { useDeliveryReceiptsDataStore, type DeliveryReceiptType } from '@/stores/deliveryReceiptsData'
import { useProcurementDataStore } from '@/stores/procurementData'
import { useFinanceDataStore } from '@/stores/financeData'
import { useAuthUserStore } from '@/stores/authUser'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useTermsApprovalStore, isWithdrawn } from '@/stores/termsApprovalData'
import type { TermsRequest } from '@/stores/termsApprovalData'
import { formatCurrency } from '@/utils/helpers'
import { chequeFor, chequeLabel, chequeProblem, collectionMethodLabel } from '@/utils/paymentMethods'

const toast = useToast()
const { confirmDialog, inputValue: confirmInput } = useConfirmDialog()

export function useOrderDetail(order: () => EthicalOrderType | undefined) {
  const ethical = useEthicalDataStore()
  // Undoing an invoice back to a draft is an executive's call (termsApprovalData).
  // Declared before the order watcher below, which runs immediately.
  const termsStore = useTermsApprovalStore()
  const termsRequest = ref<TermsRequest | null>(null)
  const drStore = useDeliveryReceiptsDataStore()
  const procurementStore = useProcurementDataStore()
  const authStore = useAuthUserStore()
  const financeStore = useFinanceDataStore()

  const loading = ref(false)
  const collectionAmount = ref(0)
  const collectionMethod = ref('cash')
  const collectionReference = ref('')
  const collectionRemarks = ref('')
  // A cheque's details — required when the method is Cheque.
  const collectionChequeBank = ref('')
  const collectionChequeNo = ref('')
  const collectionChequeDate = ref('')
  // Where the money is deposited. A collection has to land in a real account or
  // cash_accounts.balance never reflects the payment.
  const collectionCashAccountId = ref<number | null>(null)
  // delivery receipt: consignee's printed name + the DR to print once issued
  const receivedBy = ref('')
  const issuedReceipt = ref<DeliveryReceiptType | null>(null)
  // Purchasing hand-off: staff no longer canvass suppliers themselves — they
  // send a request and Purchasing does the sourcing (lead-dev directive).
  const requestedAt = ref<string | null>(null)
  const requestNote = ref('')

  // Deposit-account options for the collection form. Investment placements are
  // excluded: a customer payment is received into an operating account or the
  // cash box, never into a time deposit.
  const cashAccountOptions = computed(() =>
    financeStore.cashAccounts
      .filter((a) => a.is_active && a.classification !== 'TIME_INVESTMENT')
      .map((a) => ({ value: a.id, title: `${a.name} — ${formatCurrency(a.balance ?? 0)}` })),
  )

  const cashAccountName = (id: number | null): string =>
    financeStore.cashAccounts.find((a) => a.id === id)?.name ?? '—'

  const isInvoiced = computed(() => order()?.status === 'invoiced')
  const isPartial = computed(() => order()?.status === 'partial')
  const isPaid = computed(() => order()?.status === 'paid')
  const isAwaitingStock = computed(() => order()?.fulfillment_status === 'awaiting_stock')
  const isCancellable = computed(() => isInvoiced.value && !isAwaitingStock.value)

  const shortfall = computed<Shortfall[]>(() => {
    const o = order()
    return (o?.items ?? [])
      .filter((it) => it.delivered_qty < it.quantity)
      .map((it) => ({
        product_id: it.product_id ?? 0,
        ordered: it.quantity,
        on_hand: it.delivered_qty,
        needed: it.quantity - it.delivered_qty,
      }))
  })

  const isOverdue = computed(() => {
    const o = order()
    if (!o?.due_date || o.status === 'paid') return false
    return new Date(o.due_date) < new Date()
  })

  const balance = computed(() => {
    const o = order()
    return Math.max(0, (o?.total_amount ?? 0) - (o?.amount_paid ?? 0))
  })

  const collections = computed(() => ethical.collections)

  watch(
    () => order(),
    async (o) => {
      receivedBy.value = ''
      issuedReceipt.value = null
      requestedAt.value = null
      requestNote.value = ''
      collectionCashAccountId.value = null
      termsRequest.value = null
      if (o?.id) {
        void loadTermsRequest(o.id)
        // Deposit accounts are needed as soon as the dialog opens so the
        // collection form can offer them.
        await Promise.all([ethical.fetchCollections(o.id), financeStore.fetchCashAccounts()])
        if (o.fulfillment_status === 'awaiting_stock') void loadRequestStatus(o.id)
      }
    },
    { immediate: true },
  )

  async function loadTermsRequest(id: number) { termsRequest.value = await termsStore.requestFor(id) }

  const unlockPending = computed(() =>
    termsRequest.value?.status === 'pending' && termsRequest.value.request_type === 'unlock_terms')
  /** The executives turned down an unapprove request. */
  const unlockRejected = computed(() =>
    termsRequest.value?.request_type === 'unlock_terms' && termsRequest.value.status === 'rejected'
    && !isWithdrawn(termsRequest.value))
  /** Invoiced, nothing collected — the terms can still be undone (the store
   *  also refuses once a delivery receipt has been issued). */
  const canRequestUnlock = computed(() =>
    isInvoiced.value && !collections.value.some((c) => !c.voided_at) && termsRequest.value?.status !== 'pending')

  async function requestUnapprove() {
    const o = order(); if (!o) return
    const ok = await confirmDialog(
      `Ask the executives to unapprove ${o.order_no ?? 'this invoice'}? If they approve, the stock goes back, the `
      + 'sale is reversed in the ledger and the order returns to draft (its EO number is kept).',
      { title: 'Request unapprove', confirmText: 'Send request', inputLabel: 'Reason (required)' },
    )
    if (!ok) return
    // The dialog blocks an empty box but not one of only spaces.
    const reason = confirmInput.value.trim()
    if (!reason) { toast.error('Give a reason for the unapprove request.'); return }
    loading.value = true
    const result = await termsStore.requestUnlock({ orderId: o.id, orderType: 'ethical_order', orderNo: o.order_no, reason })
    loading.value = false
    if (result.success) await loadTermsRequest(o.id)
  }

  async function withdrawTermsRequest() {
    const o = order(); const r = termsRequest.value
    if (!o || !r || r.status !== 'pending') return
    loading.value = true
    const result = await termsStore.withdraw(r.id)
    loading.value = false
    if (result.success) await loadTermsRequest(o.id)
  }

  async function loadRequestStatus(id: number) {
    const latest = await procurementStore.fetchLatestRequest(id)
    requestedAt.value = latest?.created_at ?? null
  }

  // Send the "we need these items, can you buy some?" ping to Purchasing.
  // Staff never see supplier info — canvassing now happens only on the
  // Purchasing side (Procurement Requests queue).
  async function notifyPurchasing() {
    const o = order(); if (!o) return
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) return
    loading.value = true
    const ok = await procurementStore.notifyPurchasing('ethical_order', o.id, requestNote.value || undefined, user.id)
    loading.value = false
    if (ok) { requestNote.value = ''; await loadRequestStatus(o.id) }
  }

  // A DR can be issued once any quantity has been fulfilled (not cancelled).
  const canIssueDR = computed(() => {
    const o = order()
    if (!o || o.status === 'cancelled') return false
    return (o.items ?? []).some((it) => (it.delivered_qty ?? 0) > 0)
  })

  async function issueDR() {
    const o = order()
    if (!o?.id) return
    loading.value = true
    const result = await ethical.issueDeliveryReceipt({
      orderId: o.id,
      receivedBy: receivedBy.value || undefined,
    })
    if (result.success && result.drId) {
      issuedReceipt.value = await drStore.fetchDeliveryReceiptById(result.drId)
    }
    loading.value = false
  }

  async function recordCollection() {
    const o = order()
    if (!o?.id) return
    if (collectionAmount.value <= 0) { toast.warning('Amount must be positive'); return }
    if (collectionAmount.value > balance.value) { toast.warning('Amount exceeds balance'); return }
    if (collectionCashAccountId.value === null) { toast.warning('Choose which cash account received this payment'); return }
    const chequeInput = { bank: collectionChequeBank.value, number: collectionChequeNo.value, date: collectionChequeDate.value }
    const chequeMissing = chequeProblem(collectionMethod.value, chequeInput)
    if (chequeMissing) { toast.warning(`Enter ${chequeMissing} for this cheque`); return }
    const cheque = chequeFor(collectionMethod.value, chequeInput)

    const willFullyPay = collectionAmount.value >= balance.value
    const summary = [
      `Amount: ${formatCurrency(collectionAmount.value)}`,
      `Method: ${collectionMethodLabel(collectionMethod.value)}`,
      cheque ? `Cheque: ${chequeLabel({ cheque_bank: cheque.bank, cheque_no: cheque.number, cheque_date: cheque.date })}` : '',
      `Reference / OR #: ${collectionReference.value || '—'}`,
      `Deposited to: ${cashAccountName(collectionCashAccountId.value)}`,
      `Note: ${collectionRemarks.value || '—'}`,
      `Remaining balance after this: ${formatCurrency(Math.max(0, balance.value - collectionAmount.value))}`,
      willFullyPay ? 'This will mark the order as PAID IN FULL.' : '',
    ].filter(Boolean).join('\n')
    const ok = await confirmDialog(summary, { title: 'Confirm Collection', confirmText: 'Record Collection' })
    if (!ok) return

    loading.value = true
    const result = await ethical.recordCollection({
      orderId: o.id,
      amount: collectionAmount.value,
      method: collectionMethod.value || undefined,
      reference: collectionReference.value || undefined,
      remarks: collectionRemarks.value || undefined,
      cashAccountId: collectionCashAccountId.value,
      cheque,
    })
    loading.value = false
    if (result.success) {
      collectionAmount.value = 0
      collectionMethod.value = 'cash'
      collectionReference.value = ''
      collectionRemarks.value = ''
      collectionCashAccountId.value = null
      collectionChequeBank.value = ''
      collectionChequeNo.value = ''
      collectionChequeDate.value = ''
    }
  }

  async function cancelOrder() {
    const o = order()
    if (!o?.id) return
    if (!(await confirmDialog('Cancel this order and restore stock?', { title: 'Confirm Cancel Order', confirmText: 'Cancel Order' }))) return

    loading.value = true
    const result = await ethical.cancelOrder(o.id, 'Cancelled by user')
    loading.value = false
  }

  async function markCommissionPaid(collection: CollectionType) {
    if (!collection.id) return
    loading.value = true
    await ethical.markCommissionPaid(collection.id)
    loading.value = false
  }

  async function recheck() {
    const o = order()
    if (!o?.id) return
    loading.value = true
    await ethical.recheckStock(o.id)
    loading.value = false
  }

  return {
    loading,
    collectionAmount,
    collectionMethod,
    collectionReference,
    collectionRemarks,
    collectionCashAccountId,
    collectionChequeBank,
    collectionChequeNo,
    collectionChequeDate,
    cashAccountOptions,
    receivedBy,
    issuedReceipt,
    requestedAt,
    requestNote,
    canIssueDR,
    isInvoiced,
    isPartial,
    isPaid,
    isAwaitingStock,
    isCancellable,
    isOverdue,
    balance,
    shortfall,
    collections,
    recordCollection,
    cancelOrder,
    markCommissionPaid,
    recheck,
    issueDR,
    notifyPurchasing,
    termsRequest,
    unlockPending,
    unlockRejected,
    canRequestUnlock,
    requestUnapprove,
    withdrawTermsRequest,
  }
}
