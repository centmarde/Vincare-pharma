import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { useTransactionsDataStore } from '@/stores/transactionsData'
import type { PR } from '@/stores/transactionsData'
import type { PurchaseOrder } from './usePODetailModal'

export const headers = [
  { title: 'PO #',           key: 'reference_no',  sortable: true,  align: 'center' as const },
  { title: 'SUPPLIER',       key: 'supplier_id',   sortable: false, align: 'center' as const },
  { title: 'DECLARED VALUE', key: 'total_amount',  sortable: false, align: 'center' as const },
  { title: 'SHIP VIA',       key: 'ship_via',      sortable: true,  align: 'center' as const },
  { title: 'SHIP METHOD',    key: 'ship_method',   sortable: true,  align: 'center' as const },
  { title: 'ISSUED AT',      key: 'created_at',    sortable: true,  align: 'center' as const },
  { title: 'STATUS',         key: 'status',        sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',        key: 'actions',       sortable: false, align: 'center' as const },
] as const

export function usePurchaseOrderList() {
  const supplierStore      = useSuppliersDataStore()
  const txStore            = useTransactionsDataStore()
  const { suppliers }      = storeToRefs(supplierStore)
  const { loading }        = storeToRefs(txStore)

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
      issued: 'Issued', complete: 'Complete', pending: 'Pending',
    }
    return labels[status] ?? status
  }

  // ─── Server Load ──────────────────────────────────────────────────
  async function loadItems({ page, itemsPerPage, sortBy }: {
    page: number
    itemsPerPage: number
    sortBy: { key: string; order: string }[]
  }) {
    const data = await txStore.fetchTransactions({
      transaction_type: 'purchase_order',
      status:           filterStatus.value ?? undefined,
      search:           search.value.trim() || undefined,
      orderBy:          (sortBy[0]?.key ?? sortKey.value) as any,
      ascending: sortBy[0] != null ? sortBy[0].order === 'asc' : sortOrder.value === 'asc',
      limit:            itemsPerPage,
      offset:           (page - 1) * itemsPerPage,
    })

    serverItems.value = data.map((tx: any) => ({
      id:             tx.id,
      reference_no:   tx.reference_no,
      status:         tx.status ?? 'issued',
      supplier_id:    tx.supplier_id,
      total_amount:   tx.total_amount,
      created_at:     tx.created_at,
      created_by:     tx.created_by,
      is_delivered:   tx.status === 'complete',
      ship_via:       tx.ship_via    ?? null,
      ship_method:    tx.ship_method ?? null,
      requisition_id: tx.requisition_id ?? null,
      updated_at:     tx.updated_at ?? null,
    }))

    totalItems.value = data.length
  }

  // ─── Actions ──────────────────────────────────────────────────────
  async function openDetail(po: PurchaseOrder) {
    selectedPO.value = po
    selectedPR.value = po.requisition_id
      ? await txStore.fetchPRByRequisitionId(po.requisition_id)
      : null
    showDetailModal.value = true
  }

  async function openDetailForSku(po: PurchaseOrder) {
    selectedPO.value = po
    selectedPR.value = po.requisition_id
      ? await txStore.fetchPRByRequisitionId(po.requisition_id)
      : null
    showSkuEditModal.value = true
  }

  function openConfirm(po: PurchaseOrder) {
    confirmDialog.value = { show: true, poId: po.id, poNumber: po.reference_no }
  }

  async function handleMarkReceived() {
    const success = await txStore.markPOAsReceived(confirmDialog.value.poId)
    if (success) {
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
    resolveSupplier, statusLabel,
    loadItems, openDetail, openDetailForSku,
    openConfirm, handleMarkReceived, init,
  }
}