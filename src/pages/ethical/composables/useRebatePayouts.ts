import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useEthicalDataStore } from '@/stores/ethicalData'
import { useFinanceDataStore } from '@/stores/financeData'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import type { RebatePaymentMethod } from '@/stores/ethicalData'

const toast = useToast()
const { confirmDialog } = useConfirmDialog()

export function useRebatePayouts() {
  const ethical = useEthicalDataStore()
  const finance = useFinanceDataStore()
  const { rebateQueue, loading } = storeToRefs(ethical)
  const { cashAccounts } = storeToRefs(finance)

  const searchText = ref('')
  const statusFilter = ref<'all' | 'pending_approval' | 'approved'>('all')

  // Payout dialog state
  const showPayDialog = ref(false)
  const payingOrderId = ref<number | null>(null)
  const payMethod = ref<RebatePaymentMethod>('cash')
  const payReference = ref('')
  const payPaidTo = ref('')
  const payCashAccountId = ref<number | null>(null)

  // Reject dialog state
  const showRejectDialog = ref(false)
  const rejectingOrderId = ref<number | null>(null)
  const rejectReason = ref('')

  const headers = [
    { title: 'Order No', key: 'order_no', width: '120px' },
    { title: 'Customer', key: 'customer_name' },
    { title: 'MSR', key: 'agent_name' },
    { title: 'Invoice Total', key: 'total_amount', align: 'end' as const },
    { title: 'Rebate', key: 'rebate_amount', align: 'end' as const },
    { title: 'Paid In Full', key: 'paid_at', width: '120px' },
    { title: 'Status', key: 'rebate_status', width: '140px' },
    { title: '', key: 'actions', sortable: false, align: 'end' as const },
  ]

  const paymentMethodOptions = [
    { title: 'Cash', value: 'cash' },
    { title: 'GCash', value: 'gcash' },
    { title: 'Cheque', value: 'cheque' },
    { title: 'Bank Transfer', value: 'bank' },
    { title: 'Other', value: 'other' },
  ]

  const statusFilterOptions = [
    { title: 'All', value: 'all' },
    { title: 'Pending Approval', value: 'pending_approval' },
    { title: 'Approved (awaiting payout)', value: 'approved' },
  ]

  const cashAccountOptions = computed(() =>
    cashAccounts.value
      .filter(a => a.is_active)
      .map(a => ({ title: `${a.name} (${a.classification})`, value: a.id })))

  // rebate_status is null for orders that were paid before this workflow existed
  // — surface those as pending rather than leaving them invisible.
  const effectiveStatus = (status: string | null) => status ?? 'pending_approval'

  const statusMeta = (status: string | null) => {
    switch (effectiveStatus(status)) {
      case 'approved': return { label: 'Approved', color: 'info' }
      case 'paid': return { label: 'Paid', color: 'success' }
      case 'rejected': return { label: 'Rejected', color: 'error' }
      default: return { label: 'Pending Approval', color: 'warning' }
    }
  }

  const rows = computed(() =>
    rebateQueue.value
      .map(o => ({
        ...o,
        customer_name: o.customer?.name ?? '—',
        agent_name: o.agent?.name ?? '—',
        rebate_status: effectiveStatus(o.rebate_status),
      }))
      .filter(o => statusFilter.value === 'all' || o.rebate_status === statusFilter.value)
      .filter(o => {
        if (!searchText.value) return true
        const s = searchText.value.toLowerCase()
        return (o.order_no?.toLowerCase().includes(s))
          || (o.customer_name.toLowerCase().includes(s))
          || (o.agent_name.toLowerCase().includes(s))
      }))

  const pendingCount = computed(() =>
    rebateQueue.value.filter(o => effectiveStatus(o.rebate_status) === 'pending_approval').length)
  const pendingTotal = computed(() =>
    rebateQueue.value
      .filter(o => effectiveStatus(o.rebate_status) === 'pending_approval')
      .reduce((s, o) => s + (o.rebate_amount ?? 0), 0))
  const approvedTotal = computed(() =>
    rebateQueue.value
      .filter(o => effectiveStatus(o.rebate_status) === 'approved')
      .reduce((s, o) => s + (o.rebate_amount ?? 0), 0))

  const payingOrder = computed(() =>
    rebateQueue.value.find(o => o.id === payingOrderId.value) ?? null)

  async function init() {
    await Promise.all([ethical.fetchRebateQueue(), finance.fetchCashAccounts()])
  }

  async function approve(orderId: number) {
    if (!(await confirmDialog('Approve this rebate for payout?', { title: 'Approve Rebate', confirmText: 'Approve' }))) return
    await ethical.approveRebate(orderId)
  }

  function openReject(orderId: number) {
    rejectingOrderId.value = orderId
    rejectReason.value = ''
    showRejectDialog.value = true
  }

  function cancelReject() {
    showRejectDialog.value = false
    rejectingOrderId.value = null
    rejectReason.value = ''
  }

  async function confirmReject() {
    if (rejectingOrderId.value === null) return
    if (!rejectReason.value.trim()) { toast.warning('Give a reason for rejecting.'); return }
    const result = await ethical.rejectRebate(rejectingOrderId.value, rejectReason.value.trim())
    if (result.success) cancelReject()
  }

  function openPay(orderId: number) {
    payingOrderId.value = orderId
    payMethod.value = 'cash'
    payReference.value = ''
    payCashAccountId.value = cashAccountOptions.value[0]?.value ?? null
    // Default the recipient to the customer's recorded purchaser — the rebate
    // normally goes to them, but it stays editable since whoever collects it
    // may differ.
    payPaidTo.value = payingOrder.value?.customer?.purchaser_name ?? ''
    showPayDialog.value = true
  }

  function cancelPay() {
    showPayDialog.value = false
    payingOrderId.value = null
    payReference.value = ''
    payPaidTo.value = ''
  }

  async function confirmPay() {
    if (payingOrderId.value === null) return
    if (!payPaidTo.value.trim()) { toast.warning('Record who received the rebate.'); return }
    if (!payCashAccountId.value) { toast.warning('Select the cash account funding this payout.'); return }
    const result = await ethical.payRebate({
      orderId: payingOrderId.value,
      method: payMethod.value,
      reference: payReference.value.trim() || undefined,
      paidTo: payPaidTo.value.trim(),
      cashAccountId: payCashAccountId.value,
    })
    if (result.success) cancelPay()
  }

  return {
    rows, loading, searchText, statusFilter, headers,
    paymentMethodOptions, statusFilterOptions, cashAccountOptions, statusMeta,
    pendingCount, pendingTotal, approvedTotal,
    showPayDialog, payingOrder, payMethod, payReference, payPaidTo, payCashAccountId,
    showRejectDialog, rejectReason,
    init, approve, openReject, cancelReject, confirmReject, openPay, cancelPay, confirmPay,
  }
}
