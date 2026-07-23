import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import { useTransactionsDataStore } from '@/stores/transactionsData'
import { useTransactionsData } from '@/composables/useTransactionsData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { useProductsDataStore } from '@/stores/productsData'
import type { PR } from '@/stores/purchaseRequisitionData'
import type { PurchaseOrder } from './usePODetailModal'
import { useLogsDataStore } from '@/stores/logsData'
import { useAuthUserStore } from '@/stores/authUser'
import { useToast } from 'vue-toastification'
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'


const toast = useToast()

export const headers = [
  { title: 'PO #',        key: 'po_no',        sortable: true,  align: 'center' as const },
  { title: 'SUPPLIER',    key: 'supplier_id',   sortable: false, align: 'center' as const },
  { title: 'TOTAL',       key: 'total_amount',  sortable: false, align: 'center' as const },
  { title: 'SHIP VIA',    key: 'ship_via',      sortable: true,  align: 'center' as const },
  { title: 'SHIP METHOD', key: 'ship_method',   sortable: true,  align: 'center' as const },
  { title: 'ISSUED AT',   key: 'created_at',    sortable: true,  align: 'center' as const },
  { title: 'STATUS',      key: 'status',        sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',     key: 'actions',       sortable: false, align: 'center' as const },
] as const

export const headersWarehouse = [
  { title: 'PO #',        key: 'po_no',        sortable: true,  align: 'center' as const },
  { title: 'TOTAL',       key: 'total_amount',  sortable: false, align: 'center' as const },
  { title: 'SHIP VIA',    key: 'ship_via',      sortable: true,  align: 'center' as const },
  { title: 'SHIP METHOD', key: 'ship_method',   sortable: true,  align: 'center' as const },
  { title: 'ISSUED AT',   key: 'created_at',    sortable: true,  align: 'center' as const },
  { title: 'STATUS',      key: 'status',        sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',     key: 'actions',       sortable: false, align: 'center' as const},
] as const

// ─── Types ────────────────────────────────────────────────────────────────────
export type SupplierSummary = {
  names:      string[]
  display:    string
  isMultiple: boolean
}

export function usePurchaseOrderList() {
  const supplierStore = useSuppliersDataStore()
  const txStore       = useTransactionsDataStore()
  const prsStore       = usePurchaseRequisitionStore()
  const { suppliers } = storeToRefs(supplierStore)
  const { loading }   = storeToRefs(txStore)
  const logsStore = useLogsDataStore()
  const authStore = useAuthUserStore()
  const productsStore = useProductsDataStore()
  const { poStatusOptions } = useTransactionsData()

  // ─── State ────────────────────────────────────────────────────────
  const search           = ref('')
  const filterStatus     = ref<string | string[] | null>(null)
  const showDetailModal  = ref(false)
  const showSkuEditModal = ref(false)
  const selectedPO       = ref<PurchaseOrder | null>(null)
  const selectedPR       = ref<PR | null>(null)
  const serverItems      = ref<PurchaseOrder[]>([])
  const totalItems       = ref(0)
  const page             = ref(1)
  const itemsPerPage     = ref(10)
  const sortKey          = ref('created_at')
  const sortOrder        = ref<'asc' | 'desc'>('desc')
  const searchInput      = ref(search.value)
  const stats = ref({ total: 0, pending: 0, complete: 0, totalCost: 0 })

  const prItemsCache  = ref<Record<number, PR>>({})
  const confirmDialog = ref({ show: false, poId: 0, poNumber: '', referenceNo: '' as string | null })


  // ─── Helpers ──────────────────────────────────────────────────────
  const resolveSupplier = (id: string | null) =>
    suppliers.value.find(s => Number(s.id) === Number(id))?.name ?? '—'

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      issued:   'Issued',
      complete: 'Complete',
      received: 'Received',
      pending:  'Pending',
    }
    return labels[status] ?? status
  }

  function getSupplierSummary(poId: number): SupplierSummary {
    const pr = prItemsCache.value[poId]
    if (!pr?.items?.length) return { names: [], display: '—', isMultiple: false }

    const unique = [...new Set(
      pr.items
        .map(i => i.supplier_name)
        .filter((n): n is string => !!n && n !== '—')
    )]

    if (!unique.length) return { names: [], display: '—', isMultiple: false }

    const display = unique.length > 1
      ? `${unique[0]} +${unique.length - 1} more`
      : unique[0]

    return { names: unique, display, isMultiple: unique.length > 1 }
  }

  // ─── Server Load ──────────────────────────────────────────────────
  async function loadItems({ page, itemsPerPage, sortBy }: {
    page:         number
    itemsPerPage: number
    sortBy:       { key: string; order: string }[]
  }) {

    if (!authStore.users.length) await authStore.getAllUsers()
      
    const { rows, totalCount } = await txStore.fetchPurchaseOrdersRPC({
      status:     filterStatus.value ?? undefined,
      search:     search.value.trim() || undefined,
      orderBy:    (sortBy[0]?.key ?? sortKey.value) as any,
      ascending:  sortBy[0] != null ? sortBy[0].order === 'asc' : sortOrder.value === 'asc',
      limit:      itemsPerPage,
      offset:     (page - 1) * itemsPerPage,
    })

    serverItems.value = rows.map((row: any) => ({
      id:             row.id,
      reference_no:   row.reference_no,
      requisition_no: row.requisition_no,
      po_no:          row.po_no,
      status:         row.status ?? 'issued',
      supplier_id:    row.supplier_id,
      total_amount:   row.total_amount,
      created_at:     row.created_at,
      created_by:     row.created_by,
      is_delivered:   row.status === 'complete',
      ship_via:       row.ship_via    ?? null,
      ship_method:    row.ship_method ?? null,
      requisition_id: row.id,
      updated_at:     row.updated_at  ?? null,
    }))

    totalItems.value = totalCount

    // Populate PR cache straight from the RPC row's embedded items — no more N+1 fetch
    rows.forEach(row => {
      const names = prsStore.resolveUserNames(row.created_by, row.approved_by)
      prItemsCache.value[row.id] = prsStore.mapRPCRowToPR(row, names)
    })
  }

  async function loadStats() {
    const { rows } = await txStore.fetchPurchaseOrdersRPC({
      orderBy: 'created_at',
      ascending: false,
      limit: 1000, // adjust upward if you expect more POs than this
      offset: 0,
    })

    stats.value = {
      total: rows.length,
      pending: rows.filter((r: any) => r.status !== 'complete').length,
      complete: rows.filter((r: any) => r.status === 'complete').length,
      totalCost: rows.reduce((sum: number, r: any) => sum + (r.total_amount ?? 0), 0),
    }
  }

  // ─── Actions ──────────────────────────────────────────────────────
  async function openDetail(po: PurchaseOrder) {
    selectedPO.value      = po
    selectedPR.value      = prItemsCache.value[po.id]
      ?? await prsStore.fetchPRByRequisitionId(po.id)
    showDetailModal.value = true
  }

  async function openDetailForSku(po: PurchaseOrder) {
    selectedPO.value       = po
    selectedPR.value       = prItemsCache.value[po.id]
      ?? await prsStore.fetchPRByRequisitionId(po.id)
    showSkuEditModal.value = true
  }

  function openConfirm(po: PurchaseOrder) {
      confirmDialog.value = {
    show:        true,
    poId:        po.id,
    poNumber:    po.po_no ?? po.reference_no,
    referenceNo: po.reference_no,
  }
  }

  async function handleMarkReceived() {
    const { poId, poNumber, referenceNo } = confirmDialog.value
    const success = await prsStore.markPOAsReceived({ id: poId, reference_no: referenceNo })
    if (success) {
      const { user } = await authStore.getCurrentUser()
      if (user) {
      await logsStore.createLog({
        created_by:     user.id,
        action:         'mark_received',
        description:    `Purchase order ${poNumber} marked as received`,
        transaction_id: poId,
        module:         'stock_in',
      })
    }

      // NEW — complete any reorder requests tied to the products just received
    const productIds = (selectedPR.value?.items ?? [])
        .map(i => i.product_id)
        .filter((id): id is number => id != null)
      if (productIds.length) {
        await productsStore.completeReorderRequests(productIds)
      }

      confirmDialog.value.show = false
      await Promise.all([
        loadItems({ page: page.value, itemsPerPage: itemsPerPage.value, sortBy: [] }),
        loadStats(),
      ])
    }
  }

  function commitSearch(){
    search.value = searchInput.value
  }
  
  function clearSearch(){
    searchInput.value = ''
    search.value = ''
  }

  watch([search, filterStatus], () =>
    loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
  )

  async function init() {
    await supplierStore.fetchSuppliers()
    await loadStats()
  }

  return {
    loading, search, filterStatus,
    showDetailModal, showSkuEditModal,
    selectedPO, selectedPR,
    confirmDialog, serverItems, totalItems,
    page, itemsPerPage, poStatusOptions: poStatusOptions,
    searchInput, commitSearch, clearSearch,
    resolveSupplier, statusLabel, getSupplierSummary,
    loadItems, openDetail, openDetailForSku,
    openConfirm, handleMarkReceived, init,
    stats,
  }
}