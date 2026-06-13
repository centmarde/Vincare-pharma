import { ref, computed, onMounted } from 'vue'
import { usePurchaseOrderStore } from '@/stores/purchaseOrderData'
import { useSuppliersDataStore } from '@/stores/suppliersDataStore'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisition'
import type { PurchaseOrder } from '@/stores/purchaseOrderData'
import type { PR } from '@/stores/purchaseRequisition'

// Re-export for convenience
export { formatCurrency } from '@/utils/helpers'

export const headers = [
  { title: 'PO #',           key: 'po_number',      sortable: true,  align: 'start' as const },
  { title: 'SUPPLIER',       key: 'supplier_id',    sortable: false, align: 'start' as const },
  { title: 'DECLARED VALUE', key: 'declared_value', sortable: true,  align: 'start' as const },
  { title: 'SHIP VIA',       key: 'ship_via',       sortable: true,  align: 'start' as const },
  { title: 'SHIP METHOD',    key: 'ship_method',    sortable: true,  align: 'start' as const },
  { title: 'ISSUED AT',      key: 'issued_at',      sortable: true,  align: 'start' as const },
  { title: 'STATUS',         key: 'status',         sortable: true,  align: 'start' as const },
  { title: 'ACTIONS',        key: 'actions',        sortable: false, align: 'start' as const },
] as const

export function usePurchaseOrderList() {
  const poStore       = usePurchaseOrderStore()
  const supplierStore = useSuppliersDataStore()
  const prStore       = usePurchaseRequisitionStore()

  // ─── State ──────────────────────────────────────────────────────
  const search          = ref('')
  const filterStatus    = ref<string | null>(null)
  const showDetailModal = ref(false)
  const selectedPO      = ref<PurchaseOrder | null>(null)
  const selectedPR      = ref<PR | null>(null)

  const confirmDialog = ref({
    show: false,
    poId: 0,
    poNumber: '',
  })

  // ─── Computed ───────────────────────────────────────────────────
  const statusOptions = computed(() => {
    const unique = [...new Set(poStore.purchaseOrders.map(po => po.status).filter(Boolean))]
    const mapped = unique.map(s => ({ title: s.charAt(0).toUpperCase() + s.slice(1), value: s }))
    return [{ title: 'All', value: null }, ...mapped]
  })

  const filteredPOs = computed(() =>
    filterStatus.value
      ? poStore.purchaseOrders.filter(po => po.status === filterStatus.value)
      : poStore.purchaseOrders,
  )

  // ─── Helpers ────────────────────────────────────────────────────
  const formatDate = (val: string) =>
    new Date(val).toLocaleString('en-PH', {
      month: '2-digit', day: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  const resolveSupplier = (id: string | null) =>
    supplierStore.suppliers.find(s => s.id === id)?.name ?? '—'

  const statusLabel = (status: string) =>
    statusOptions.value.find(o => o.value === status)?.title ?? status

  // ─── Actions ────────────────────────────────────────────────────
  function openDetail(po: PurchaseOrder) {
    selectedPO.value = po
    selectedPR.value = prStore.prs.find(pr => Number(pr.id) === Number(po.requisition_id)) ?? null
    showDetailModal.value = true
  }

  function openConfirm(po: PurchaseOrder) {
    confirmDialog.value = { show: true, poId: po.id, poNumber: po.po_number }
  }

  async function handleMarkReceived() {
    await poStore.updatePurchaseOrder(confirmDialog.value.poId, {
      status: 'received',
      is_delivered: true,
    } as any)
    confirmDialog.value.show = false
  }

  onMounted(async () => {
    await Promise.all([
      poStore.fetchPurchaseOrders(),
      supplierStore.fetchSuppliers(),
      prStore.fetchPurchaseRequisition(),
    ])
  })

  return {
    // state
    search,
    filterStatus,
    showDetailModal,
    selectedPO,
    selectedPR,
    confirmDialog,
    // computed
    statusOptions,
    filteredPOs,
    // helpers
    formatDate,
    resolveSupplier,
    statusLabel,
    // actions
    openDetail,
    openConfirm,
    handleMarkReceived,
  }
}