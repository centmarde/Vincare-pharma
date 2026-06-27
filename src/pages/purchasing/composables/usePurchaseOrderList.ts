import { useTransactionsDataStore } from '@/stores/transactionsData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import type { PurchaseOrder } from './usePODetailModal'
import { useLogsDataStore } from '@/stores/logsData'
import { useAuthUserStore } from '@/stores/authUser'
import type { PR } from '@/stores/transactionsData'
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

// ─── Types ────────────────────────────────────────────────────────────────────
export type SupplierSummary = {
  names:      string[]
  display:    string
  isMultiple: boolean
}

export function usePurchaseOrderList() {
  const supplierStore = useSuppliersDataStore()
  const txStore       = useTransactionsDataStore()
  const { suppliers } = storeToRefs(supplierStore)
  const { loading }   = storeToRefs(txStore)
  const logsStore = useLogsDataStore()
  const authStore = useAuthUserStore()

  // ─── State ────────────────────────────────────────────────────────
  const search           = ref('')
  const filterStatus     = ref<string | null>(null)
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

  const prItemsCache  = ref<Record<number, PR>>({})
  const confirmDialog = ref({ show: false, poId: 0, poNumber: '' })

  // ─── Computed ─────────────────────────────────────────────────────
  const statusOptions = computed(() => {
    const unique = [...new Set(serverItems.value.map(po => po.status).filter(Boolean))]
    const mapped = unique.map(s => ({ title: s.charAt(0).toUpperCase() + s.slice(1), value: s }))
    return [{ title: 'All', value: null }, ...mapped]
  })

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
    const [data, count] = await Promise.all([txStore.fetchTransactions({
      po_no_not_null: true,
      status:         filterStatus.value ?? undefined,
      search:         search.value.trim() || undefined,
      orderBy:        (sortBy[0]?.key ?? sortKey.value) as any,
      ascending:      sortBy[0] != null ? sortBy[0].order === 'asc' : sortOrder.value === 'asc',
      limit:          itemsPerPage,
      offset:         (page - 1) * itemsPerPage,
    }),
    txStore.fetchTransactionsCount({ 
      po_no_not_null: true, 
      status: filterStatus.value ?? undefined, 
      search: search.value.trim() || undefined})
  ])

    serverItems.value = data.map((tx: any) => ({
      id:             tx.id,
      reference_no:   tx.po_no,
      requisition_no: tx.requisition_no,
      po_no:          tx.po_no,
      status:         tx.status ?? 'issued',
      supplier_id:    tx.supplier_id,
      total_amount:   tx.total_amount,
      created_at:     tx.created_at,
      created_by:     tx.created_by,
      is_delivered:   tx.status === 'complete',
      ship_via:       tx.ship_via    ?? null,
      ship_method:    tx.ship_method ?? null,
      requisition_id: tx.id,
      updated_at:     tx.updated_at  ?? null,
    }))

    totalItems.value = count

    // Pre-fetch linked PRs for supplier summary + PODetailModal
    await Promise.all(
      serverItems.value.map(async po => {
        if (!prItemsCache.value[po.id]) {
          const pr = await txStore.fetchPRByRequisitionId(po.id)
          if (pr) prItemsCache.value[po.id] = pr
        }
      })
    )
  }

  // ─── Actions ──────────────────────────────────────────────────────
  async function openDetail(po: PurchaseOrder) {
    selectedPO.value      = po
    selectedPR.value      = prItemsCache.value[po.id]
      ?? await txStore.fetchPRByRequisitionId(po.id)
    showDetailModal.value = true
  }

  async function openDetailForSku(po: PurchaseOrder) {
    selectedPO.value       = po
    selectedPR.value       = prItemsCache.value[po.id]
      ?? await txStore.fetchPRByRequisitionId(po.id)
    showSkuEditModal.value = true
  }

  function openConfirm(po: PurchaseOrder) {
    confirmDialog.value = { show: true, poId: po.id, poNumber: po.po_no ?? po.reference_no }
  }

  async function handleMarkReceived() {
    const { poId, poNumber } = confirmDialog.value
    const success = await txStore.markPOAsReceived(poId)
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
      confirmDialog.value.show = false
      await loadItems({ page: page.value, itemsPerPage: itemsPerPage.value, sortBy: [] })
    }
  }

  watch([search, filterStatus], () =>
    loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
  )

  async function init() {
    await supplierStore.fetchSuppliers()
  }

  return {
    loading, search, filterStatus,
    showDetailModal, showSkuEditModal,
    selectedPO, selectedPR,
    confirmDialog, serverItems, totalItems,
    page, itemsPerPage, statusOptions,
    resolveSupplier, statusLabel, getSupplierSummary,
    loadItems, openDetail, openDetailForSku,
    openConfirm, handleMarkReceived, init,
  }
}