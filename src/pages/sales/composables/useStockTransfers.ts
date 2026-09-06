import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useStockTransfersDataStore } from '@/stores/stockTransfersData'
import type { StockTransferType } from '@/stores/stockTransfersData'
import { useWarehousesDataStore } from '@/stores/warehouseData'
import type { WarehouseType } from '@/stores/warehouseData'

export const headers = [
  { title: 'TRANSFER #', key: 'transfer_no', sortable: true,  align: 'center' as const },
  { title: 'WAREHOUSE',  key: 'warehouse',   sortable: false, align: 'center' as const },
  { title: 'REQUESTED',  key: 'created_at',  sortable: true,  align: 'center' as const },
  { title: 'STATUS',     key: 'status',      sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',    key: 'actions',     sortable: false, align: 'center' as const },
] as const

const statusLabels: Record<string, string> = {
  pending_approval: 'Pending Approval',
  approved:         'Approved',
  completed:        'Completed',
  rejected:         'Rejected',
}

const statusColors: Record<string, string> = {
  pending_approval: 'warning',
  approved:         'info',
  completed:        'success',
  rejected:         'error',
}

export function useStockTransfers() {
  const transfersStore = useStockTransfersDataStore()
  const warehouseStore = useWarehousesDataStore()
  const { transfers, loading } = storeToRefs(transfersStore)
  const { warehouses } = storeToRefs(warehouseStore)

  const search       = ref('')
  const filterStatus = ref<string | null>(null)
  const filterWarehouseId = ref<number | null>(null)

  const showRequestDialog = ref(false)
  const showDetailDialog  = ref(false)
  const selectedTransfer  = ref<StockTransferType | null>(null)

  const filteredTransfers = computed(() => {
    return transfers.value.filter(t => {
      if (filterStatus.value && t.status !== filterStatus.value) return false
      if (filterWarehouseId.value && t.warehouse_id !== filterWarehouseId.value) return false
      if (search.value.trim()) {
        const s = search.value.trim().toLowerCase()
        if (!t.transfer_no?.toLowerCase().includes(s)) return false
      }
      return true
    })
  })

  const statusOptions = [
    { title: 'All', value: null },
    { title: 'Pending Approval', value: 'pending_approval' },
    { title: 'Approved', value: 'approved' },
    { title: 'Completed', value: 'completed' },
    { title: 'Rejected', value: 'rejected' },
  ]

  const warehouseOptions = computed(() => [
    { title: 'All Warehouses', value: null },
    ...warehouses.value.map((w: WarehouseType) => ({ title: w.name, value: w.id })),
  ])

  const statusLabel = (status: string | null) => statusLabels[status ?? ''] ?? status ?? '—'
  const statusColor = (status: string | null) => statusColors[status ?? ''] ?? 'grey'

  async function init() {
    if (!warehouses.value.length) await warehouseStore.fetchWarehouses()
    await transfersStore.fetchTransfers()
  }

  function openRequestDialog() {
    showRequestDialog.value = true
  }

  function openDetailDialog(transfer: StockTransferType) {
    selectedTransfer.value = transfer
    showDetailDialog.value = true
  }

  async function handleRequestCreated() {
    showRequestDialog.value = false
    await transfersStore.fetchTransfers()
  }

  async function handleDialogChanged() {
    await transfersStore.fetchTransfers()
    if (selectedTransfer.value) {
      selectedTransfer.value =
        transfers.value.find(t => t.id === selectedTransfer.value!.id) ?? null
    }
  }

  return {
    loading, search, filterStatus, filterWarehouseId,
    statusOptions, warehouseOptions,
    showRequestDialog, showDetailDialog, selectedTransfer,
    filteredTransfers,
    statusLabel, statusColor,
    init, openRequestDialog, openDetailDialog,
    handleRequestCreated, handleDialogChanged,
  }
}
