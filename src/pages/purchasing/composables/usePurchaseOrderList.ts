import { ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { usePurchaseOrderStore } from '@/stores/purchaseOrderData'
import { useSuppliersDataStore } from '@/stores/suppliersDataStore'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisition'
import type { PurchaseOrder } from '@/stores/purchaseOrderData'
import type { PR } from '@/stores/purchaseRequisition'

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
  const serverItems     = ref<PurchaseOrder[]>([])
  const totalItems      = ref(0)
  const page            = ref(1)
  const itemsPerPage    = ref(10)

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
    poStore.loading = true

    let query = supabase
      .from('purchase_orders')
      .select('*', { count: 'exact' })

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
    serverItems.value = (data ?? []) as PurchaseOrder[]
    totalItems.value  = count ?? 0
    poStore.loading   = false
  }

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
    // Refresh current page after update
    await loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
  }

  // Re-fetch when search or filter changes
  watch([search, filterStatus], () =>
    loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
  )

  // Still need suppliers + PRs for resolving names
  async function init() {
    await Promise.all([
      supplierStore.fetchSuppliers(),
      prStore.fetchPurchaseRequisition(),
    ])
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
    // computed
    statusOptions,
    // helpers
    formatDate,
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