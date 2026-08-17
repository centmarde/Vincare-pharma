import { ref, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useEthicalDataStore } from '@/stores/ethicalData'
import type { EthicalOrderType, CollectionType, Shortfall } from '@/stores/ethicalData'
import { useDeliveryReceiptsDataStore, type DeliveryReceiptType } from '@/stores/deliveryReceiptsData'
import { useProcurementDataStore } from '@/stores/procurementData'
import { useFinanceDataStore } from '@/stores/financeData'
import { useAuthUserStore } from '@/stores/authUser'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { formatCurrency } from '@/utils/helpers'

const toast = useToast()
const { confirmDialog } = useConfirmDialog()

export function useOrderDetail(order: () => EthicalOrderType | undefined) {
  const ethical = useEthicalDataStore()
  const drStore = useDeliveryReceiptsDataStore()
  const procurementStore = useProcurementDataStore()
  const authStore = useAuthUserStore()
  const financeStore = useFinanceDataStore()

  const loading = ref(false)
  const collectionAmount = ref(0)
  const collectionMethod = ref('')
  const collectionReference = ref('')
  const collectionRemarks = ref('')
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
      if (o?.id) {
        // Deposit accounts are needed as soon as the dialog opens so the
        // collection form can offer them.
        await Promise.all([ethical.fetchCollections(o.id), financeStore.fetchCashAccounts()])
        if (o.fulfillment_status === 'awaiting_stock') void loadRequestStatus(o.id)
      }
    },
    { immediate: true },
  )

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

    const willFullyPay = collectionAmount.value >= balance.value
    const summary = [
      `Amount: ${formatCurrency(collectionAmount.value)}`,
      collectionMethod.value ? `Method: ${collectionMethod.value}` : '',
      `Reference / OR #: ${collectionReference.value || '—'}`,
      `Deposited to: ${cashAccountName(collectionCashAccountId.value)}`,
      `Remarks: ${collectionRemarks.value || '—'}`,
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
    })
    loading.value = false
    if (result.success) {
      collectionAmount.value = 0
      collectionMethod.value = ''
      collectionReference.value = ''
      collectionRemarks.value = ''
      collectionCashAccountId.value = null
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
  }
}
