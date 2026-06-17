import { ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { useToast } from 'vue-toastification'
import type { PurchaseOrder } from './usePODetailModal'
import type { PR } from './usePurchaseRequisitionList'

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
  const supplierStore   = useSuppliersDataStore()

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
      let query = supabase
        .from('purchase_orders')
        .select(`
          *,
          purchase_requisition:requisition_id (
            id,
            pr_number,
            status,
            created_at
          )
        `, { count: 'exact' })

      if (filterStatus.value) {
        query = query.eq('status', filterStatus.value)
      }

      if (search.value.trim()) {
        query = query.ilike('po_number', `%${search.value.trim()}%`)
      }

      if (sortBy.length) {
        query = query.order(sortBy[0].key, { ascending: sortBy[0].order === 'asc' })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      const from = (page - 1) * itemsPerPage
      query = query.range(from, from + itemsPerPage - 1)

      const { data, count } = await query

      // Filter out POs where the PR status is in the excluded list
      let filteredData = data ?? []
      if (excludePRStatuses.length > 0) {
        filteredData = filteredData.filter(po => {
          const prStatus = po.purchase_requisition?.status
          return !prStatus || !excludePRStatuses.includes(prStatus)
        })
      }

      serverItems.value = filteredData
      totalItems.value  = count ?? 0
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load purchase orders')
    } finally {
      loading.value = false
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────
  const resolveSupplier = (id: number | null) => {
    if (id == null) return '—'
    return supplierStore.suppliers.find(s => Number(s.id) === Number(id))?.name ?? '—'
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
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({
          status: 'received',
          is_delivered: true,
          received_at: new Date().toISOString(),
        })
        .eq('id', confirmDialog.value.poId)

      if (updateError) throw updateError

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
    await supplierStore.fetchSuppliers()
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