import { ref, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import type { PurchaseOrder } from './usePODetailModal'
import type { PR } from './usePurchaseRequisitionList'
import { staticSuppliers } from './usePODetailModal'

export const headers = [
  { title: 'PO #',           key: 'po_number',      sortable: true,  align: 'center' as const },
  { title: 'SUPPLIER',       key: 'supplier_id',    sortable: false, align: 'center' as const },
  { title: 'DECLARED VALUE', key: 'declared_value', sortable: false,  align: 'center' as const },
  { title: 'SHIP VIA',       key: 'ship_via',       sortable: true,  align: 'center' as const },
  { title: 'SHIP METHOD',    key: 'ship_method',    sortable: true,  align: 'center' as const },
  { title: 'ISSUED AT',      key: 'issued_at',      sortable: true,  align: 'center' as const },
  { title: 'STATUS',         key: 'status',         sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',        key: 'actions',        sortable: false, align: 'center' as const },
] as const

export interface UsePurchaseOrderListOptions {
  excludePRStatuses?: string[]
}

export function usePurchaseOrderList(options: UsePurchaseOrderListOptions = {}) {
  const { excludePRStatuses = [] } = options
  const toast           = useToast()

  // ─── State ──────────────────────────────────────────────────────
  const search          = ref('')
  const filterStatus    = ref<string | null>(null)
  const showDetailModal = ref(false)
  const selectedPO      = ref<PurchaseOrder | null>(null)
  const selectedPR      = ref<PR | null>(null)
  const serverItems     = ref<any[]>([])
  const totalItems      = ref(0)
  const page            = ref(1)
  const itemsPerPage    = ref(10)
  const loading         = ref(false)

  const confirmDialog = ref({
    show: false,
    poId: 0,
    poNumber: '',
  })

  // ─── Static Data ────────────────────────────────────────────────
  const staticPOs: (PurchaseOrder & { purchase_requisition?: PR })[] = [
    {
      id: 1,
      created_at: new Date().toISOString(),
      po_number: 'PO-001',
      requisition_id: 1,
      supplier_id: 1,
      ship_via: 'Truck',
      ship_method: 'Ground',
      declared_value: 12500,
      issued_by: 'Warehouse Staff',
      issued_at: new Date().toISOString(),
      status: 'issued',
      is_delivered: false,
      received_at: null,
      purchase_requisition: {
        id: 1,
        created_at: new Date().toISOString(),
        pr_number: 'PR-001',
        status: 'approved',
        supplier_id: 1,
        requester_name: 'Juan Dela Cruz',
        reviewer_name: 'Maria Santos',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'Maria Santos',
        justification: 'Monthly stock replenishment',
        total_amount: 12500,
        items: [
          { id: 1, no: 1, unit: 'box', item_description: 'Paracetamol 500mg', qty: 10, offer_per_unit: 120, cost_per_unit: 100, product_id: 1 },
          { id: 2, no: 2, unit: 'box', item_description: 'Ibuprofen 400mg', qty: 5, offer_per_unit: 180, cost_per_unit: 150, product_id: 2 },
        ],
      },
    },
    {
      id: 2,
      created_at: new Date().toISOString(),
      po_number: 'PO-002',
      requisition_id: 2,
      supplier_id: 1,
      ship_via: 'Courier',
      ship_method: 'Express',
      declared_value: 8750,
      issued_by: 'Warehouse Staff',
      issued_at: new Date().toISOString(),
      status: 'received',
      is_delivered: true,
      received_at: new Date().toISOString(),
      purchase_requisition: {
        id: 2,
        created_at: new Date().toISOString(),
        pr_number: 'PR-002',
        status: 'approved',
        supplier_id: 1,
        requester_name: 'Juan Dela Cruz',
        reviewer_name: 'Maria Santos',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'Maria Santos',
        justification: 'Emergency restock',
        total_amount: 8750,
        items: [
          { id: 3, no: 1, unit: 'bottle', item_description: 'Amoxicillin 250mg', qty: 20, offer_per_unit: 50, cost_per_unit: 45, product_id: 3 },
        ],
      },
    },
  ]

  // ─── Computed ───────────────────────────────────────────────────
  const statusOptions = computed(() => {
    const unique = [...new Set(serverItems.value.map(po => po.status).filter(Boolean))]
    const mapped = unique.map(s => ({ title: s.charAt(0).toUpperCase() + s.slice(1), value: s }))
    return [{ title: 'All', value: null }, ...mapped]
  })

  // ─── Server Load ────────────────────────────────────────────────
  async function loadItems({ page, itemsPerPage, sortBy }: {
    page: number
    itemsPerPage: number
    sortBy: { key: string; order: string }[]
  }) {
    loading.value = true

    try {
      let result = [...staticPOs]

      if (filterStatus.value) {
        result = result.filter(po => po.status === filterStatus.value)
      }

      if (search.value.trim()) {
        const s = search.value.trim().toLowerCase()
        result = result.filter(po => po.po_number.toLowerCase().includes(s))
      }

      const key = sortBy[0]?.key ?? 'created_at'
      const asc = sortBy[0]?.order === 'asc'
      result.sort((a, b) => {
        const aVal = (a as any)[key] ?? ''
        const bVal = (b as any)[key] ?? ''
        if (aVal < bVal) return asc ? -1 : 1
        if (aVal >
           bVal) return asc ? 1 : -1
        return 0
      })

      const from = (page - 1) * itemsPerPage
      const paginated = result.slice(from, from + itemsPerPage)

      // Filter out POs where the PR status is in the excluded list
      let filteredData = paginated
      if (excludePRStatuses.length > 0) {
        filteredData = filteredData.filter(po => {
          const prStatus = po.purchase_requisition?.status
          return !prStatus || !excludePRStatuses.includes(prStatus)
        })
      }

      serverItems.value = filteredData
      totalItems.value  = result.length
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load purchase orders')
    } finally {
      loading.value = false
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────
  const resolveSupplier = (id: number | null) => {
    if (id == null) return '—'
    return staticSuppliers.find(s => Number(s.id) === Number(id))?.name ?? '—'
  }

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      issued: 'Issued',
      received: 'Received',
      pending: 'Pending',
    }
    return labels[status] ?? status
  }

  // ─── Actions ────────────────────────────────────────────────────
  async function openDetail(po: any) {
    selectedPO.value = po as PurchaseOrder

    // Try to resolve PR from joined data
    const req = po.purchase_requisition
    if (req) {
      selectedPR.value = {
        id: req.id,
        created_at: req.created_at,
        pr_number: req.pr_number,
        status: req.status,
        supplier_id: po.supplier_id,
        requester_name: null,
        reviewer_name: null,
        reviewed_at: null,
        reviewed_by: null,
        justification: null,
        total_amount: null,
        items: [],
      } as PR
    } else {
      selectedPR.value = null
    }

    showDetailModal.value = true
  }

  function openConfirm(po: any) {
    confirmDialog.value = { show: true, poId: po.id, poNumber: po.po_number }
  }

  async function handleMarkReceived() {
    loading.value = true

    try {
      const po = staticPOs.find(p => p.id === confirmDialog.value.poId)
      if (po) {
        po.status = 'received'
        po.is_delivered = true
        po.received_at = new Date().toISOString()
      }

      toast.success('Purchase order marked as received')
      confirmDialog.value.show = false
      await loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as received')
    } finally {
      loading.value = false
    }
  }

  // Re-fetch when search or filter changes
  watch([search, filterStatus], () =>
    loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
  )

  async function init() {
    // No store fetch needed; static data is already loaded
  }

  return {
    // state
    search,
    filterStatus,
    showDetailModal,
    selectedPO,
    selectedPR,
    confirmDialog,
    serverItems,
    totalItems,
    page,
    itemsPerPage,
    loading,
    // computed
    statusOptions,
    // helpers
    resolveSupplier,
    statusLabel,
    // actions
    loadItems,
    openDetail,
    openConfirm,
    handleMarkReceived,
    init,
  }
}
