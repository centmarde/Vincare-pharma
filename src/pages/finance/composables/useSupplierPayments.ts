import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'
import { useSuppliersDataStore } from '@/stores/suppliersData'

export const apHeaders = [
  { title: 'SUPPLIER',        key: 'supplier_name',  sortable: true,  align: 'center' as const },
  { title: 'TOTAL RECEIVED',  key: 'total_received', sortable: false, align: 'center' as const },
  { title: 'TOTAL PAID',      key: 'total_paid',     sortable: false, align: 'center' as const },
  { title: 'OUTSTANDING',     key: 'outstanding',    sortable: true,  align: 'center' as const },
  { title: 'DRIFT',           key: 'has_drift',      sortable: false, align: 'center' as const },
  { title: 'ACTIONS',         key: 'actions',        sortable: false, align: 'center' as const },
] as const

export const paymentHistoryHeaders = [
  { title: 'REFERENCE #', key: 'reference_no',    sortable: true,  align: 'center' as const },
  { title: 'DATE',        key: 'paid_at',          sortable: true,  align: 'center' as const },
  { title: 'SUPPLIER',    key: 'supplier_name',    sortable: false, align: 'center' as const },
  { title: 'AMOUNT',      key: 'amount',           sortable: false, align: 'center' as const },
  { title: 'METHOD',      key: 'payment_method',   sortable: false, align: 'center' as const },
  { title: '',            key: 'cr_actions',       sortable: false, align: 'center' as const },
] as const

export function useSupplierPayments() {
  const financeStore = useFinanceDataStore()
  const suppliersStore = useSuppliersDataStore()
  const { supplierAP, supplierPayments, loading } = storeToRefs(financeStore)
  const { suppliers } = storeToRefs(suppliersStore)

  // ─── State ────────────────────────────────────────────────────────
  const showPaymentDialog = ref(false)
  const targetSupplierId = ref<number | null>(null)
  const targetOutstanding = ref(0)
  const amount = ref<number | null>(null)
  const paymentMethod = ref('')
  const referenceNo = ref('')
  const valueDate = ref<string | null>(null)
  const remarks = ref('')

  // ─── Computed ─────────────────────────────────────────────────────
  const canSubmit = computed(() =>
    !!targetSupplierId.value && (amount.value ?? 0) > 0 && (amount.value ?? 0) <= targetOutstanding.value + 0.005,
  )

  // ─── Actions ──────────────────────────────────────────────────────
  async function init() {
    await Promise.all([
      financeStore.fetchSupplierAP(),
      financeStore.fetchSupplierPayments(),
      suppliersStore.fetchSuppliers(),
    ])
  }

  function openPaymentDialog(supplierId: number, outstanding: number) {
    targetSupplierId.value = supplierId
    targetOutstanding.value = outstanding
    amount.value = null
    paymentMethod.value = ''
    referenceNo.value = ''
    valueDate.value = null
    remarks.value = ''
    showPaymentDialog.value = true
  }

  async function handleSubmit() {
    if (!canSubmit.value || !targetSupplierId.value) return
    const result = await financeStore.recordSupplierPayment({
      supplierId: targetSupplierId.value,
      amount: amount.value ?? 0,
      paymentMethod: paymentMethod.value || undefined,
      referenceNo: referenceNo.value || undefined,
      valueDate: valueDate.value || undefined,
      remarks: remarks.value || undefined,
    })
    if (result.success) showPaymentDialog.value = false
  }

  return {
    supplierAP, supplierPayments, suppliers, loading,
    showPaymentDialog, targetOutstanding, amount, paymentMethod, referenceNo, valueDate, remarks, canSubmit,
    init, openPaymentDialog, handleSubmit,
  }
}
