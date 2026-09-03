import { ref, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useStockTransfersDataStore } from '@/stores/stockTransfersData'
import type { StockTransferType } from '@/stores/stockTransfersData'

const toast = useToast()

export function useStockTransferDetail(
  transfer: () => StockTransferType | null,
  onReceived: () => void,
) {
  const transfersStore = useStockTransfersDataStore()

  // ─── State ────────────────────────────────────────────────────────
  const loading = ref(false)
  const receivedQtys = ref<Record<number, number>>({})

  // ─── Computed ─────────────────────────────────────────────────────
  const items = computed(() => transfer()?.stock_transfer_items ?? [])
  const isPendingApproval = computed(() => transfer()?.status === 'pending_approval')
  const isApproved = computed(() => transfer()?.status === 'approved')

  const missingReceivedQty = computed(() =>
    items.value.filter(i => !receivedQtys.value[i.id] || receivedQtys.value[i.id] <= 0).length
  )

  // Pre-fill received qty inputs with the requested qty as a sane default
  watch(items, (newItems) => {
    for (const item of newItems) {
      if (receivedQtys.value[item.id] == null) {
        receivedQtys.value[item.id] = item.requested_qty
      }
    }
  }, { immediate: true })

  // ─── Actions ──────────────────────────────────────────────────────
  async function handleApprove() {
    const t = transfer()
    if (!t) return
    loading.value = true
    await transfersStore.approveTransfer(t.id)
    loading.value = false
  }

  async function handleReject() {
    const t = transfer()
    if (!t) return
    loading.value = true
    await transfersStore.rejectTransfer(t.id)
    loading.value = false
  }

  async function handleMarkReceived() {
    const t = transfer()
    if (!t || !t.warehouse_id) return

    if (missingReceivedQty.value > 0) {
      toast.warning('Please enter a received quantity for every item.')
      return
    }

    loading.value = true

    const receivedItems = items.value.map(item => ({
      item_id:      item.id,
      received_qty: receivedQtys.value[item.id],
    }))

    const success = await transfersStore.receiveTransfer(t.id, receivedItems)

    loading.value = false

    if (success) onReceived()
  }

  return {
    loading, receivedQtys, items,
    isPendingApproval, isApproved, missingReceivedQty,
    handleApprove, handleReject, handleMarkReceived,
  }
}
