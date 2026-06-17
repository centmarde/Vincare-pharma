import { ref, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { useTransactionsDataStore } from '@/stores/transactionsData'
import { useTransactionItemsDataStore } from '@/stores/transactionsItemsData'
import type { PurchaseOrder } from './usePODetailModal'
import type { PR, PRItem } from './usePurchaseRequisitionList'

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

/**
 * Maps a transaction of type 'purchase_order' into a shape that the PO list
 * templates can consume (mimicking PurchaseOrder + inline purchase_requisition).
 */
function txToPO(tx: any): any {
  // Parse ship_via / ship_method from remarks if stored as "SHIP_VIA|SHIP_METHOD"
  let ship_via: string | null = null
  let ship_method: string | null = null
  if (tx.remarks) {
    const parts = tx.remarks.split('|')
    ship_via = parts[0]?.trim() || null
    ship_method = parts[1]?.trim() || null
  }

  return {
    id:               tx.id,
    created_at:       tx.created_at,
    po_number:        tx.reference_no ?? `PO-${tx.id}`,
    requisition_id:   null,
    supplier_id:      tx.supplier_id,
    ship_via,
    ship_method,
    declared_value:   tx.total_amount,
    issued_by:        tx.created_by,
    issued_at:        tx.created_at,
    status:           tx.status ?? 'issued',
    is_delivered:     tx.status === 'received',
    received_at:      tx.status === 'received' ? tx.updated_at ?? tx.created_at : null,
  }
}

export function usePurchaseOrderList(options: UsePurchaseOrderListOptions = {}) {
  const { excludePRStatuses = [] } = options
  const toast              = useToast()
  const supplierStore      = useSuppliersDataStore()
  const transactionsStore  = useTransactionsDataStore()
  const transactionItemsStore = useTransactionItemsDataStore()

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

  // ─── Helpers ────────────────────────────────────────────────────
  async function buildPRFromTx(tx: any): Promise<PR | null> {
    try {
      const itemsData = await transactionItemsStore.fetchTransactionItems({ transaction_id: tx.id })
      const items: PRItem[] = (itemsData || []).map((ti) => {
        const p = ti.product
        return {
          id: ti.id,
          no: p?.no ?? 0,
          unit: '',
          item_description: p?.product_name ?? p?.item_decription ?? '(no description)',
          qty: 0,
          offer_per_unit: p?.offer_per_unit ?? 0,
          cost_per_unit: p?.cost_per_unit ?? 0,
          product_id: p?.id ?? 0,
        }
      })

      let justification: string | null = null
      if (tx.remarks) {
        const match = tx.remarks.match(/Justification:\s*(.+?)(?:\n|$)/)
        justification = match ? match[1].trim() : tx.remarks
      }

      return {
        id: tx.id,
        created_at: tx.created_at,
        pr_number: tx.reference_no,
        status: tx.status,
        supplier_id: tx.supplier_id,
        requester_name: tx.created_by,
        reviewer_name: tx.approved_by,
        reviewed_at: tx.updated_at,
        reviewed_by: tx.approved_by,
        justification,
        total_amount: tx.total_amount,
        items,
      } as PR
    } catch {
      return null
    }
  }

  // ─── Server Load ────────────────────────────────────────────────
  async function loadItems({ page, itemsPerPage, sortBy }: {
    page: number
    itemsPerPage: number
    sortBy: { key: string; order: string }[]
  }) {
    loading.value = true

    try {
      // Fetch transactions where transaction_type == 'purchase_order'
      const data = await transactionsStore.fetchTransactions({
        transaction_type: 'purchase_order',
      })

      if (!data) {
        serverItems.value = []
        totalItems.value = 0
        return
      }

      // Map all transactions to PO shape
      let allPos = data.map(txToPO)

      // Apply status filter
      if (filterStatus.value) {
        allPos = allPos.filter(po => po.status === filterStatus.value)
      }

      // Apply search filter
      if (search.value.trim()) {
        const s = search.value.trim().toLowerCase()
        allPos = allPos.filter(po => po.po_number.toLowerCase().includes(s))
      }

      // Apply sorting
      const key = sortBy[0]?.key ?? 'created_at'
      const asc = sortBy[0]?.order === 'asc'
      allPos.sort((a, b) => {
        const aVal = (a as any)[key] ?? ''
        const bVal = (b as any)[key] ?? ''
        if (aVal < bVal) return asc ? -1 : 1
        if (aVal > bVal) return asc ? 1 : -1
        return 0
      })

      // Paginate
      const from = (page - 1) * itemsPerPage
      const paginated = allPos.slice(from, from + itemsPerPage)

      // Load suppliers if not already loaded
      if (supplierStore.suppliers.length === 0) {
        await supplierStore.fetchSuppliers()
      }

      // Build result with PR data joined
      const result: any[] = []
      for (const po of paginated) {
        const tx = data.find((t: any) => t.id === po.id)
        const pr = tx ? await buildPRFromTx(tx) : null

        // Filter out POs where the PR status is in the excluded list
        if (excludePRStatuses.length > 0 && pr?.status && excludePRStatuses.includes(pr.status)) {
          continue
        }

        result.push({ ...po, purchase_requisition: pr ?? undefined })
      }

      serverItems.value = result
      totalItems.value  = allPos.length
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
      const updated = await transactionsStore.updateTransaction(confirmDialog.value.poId, {
        status: 'received',
        transaction_type: 'stock_in',
        updated_at: new Date().toISOString(),
      })

      if (!updated) throw new Error('Failed to update purchase order')

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
    // Fetch suppliers first for supplier name resolution
    if (supplierStore.suppliers.length === 0) {
      await supplierStore.fetchSuppliers()
    }
    // Initial load will be triggered by the first data-table update event
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