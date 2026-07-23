import { ref, computed, onMounted } from 'vue'
import { useDeliveryReceiptsDataStore } from '@/stores/deliveryReceiptsData'
import type { DeliveryReceiptType } from '@/stores/deliveryReceiptsData'

export const drHeaders = [
  { title: 'DR #',        key: 'dr_no',         sortable: true },
  { title: 'SOURCE',      key: 'source',        sortable: true },
  { title: 'ORDER #',     key: 'order_no',      sortable: true },
  { title: 'CUSTOMER',    key: 'customer_name', sortable: false },
  { title: 'DATE',        key: 'created_at',    sortable: true },
  { title: 'RECEIVED BY', key: 'received_by',   sortable: false },
  { title: 'ITEMS',       key: 'items',         sortable: false, align: 'center' as const },
  { title: '',            key: 'actions',       sortable: false, align: 'end' as const },
]

export function useDeliveryReceipts() {
  const store = useDeliveryReceiptsDataStore()

  const loading = ref(false)
  const receipts = ref<DeliveryReceiptType[]>([])
  const search = ref('')

  // View dialog state — reuses the same printable DR as the order flow.
  const showReceipt = ref(false)
  const selected = ref<DeliveryReceiptType | null>(null)

  async function init() {
    loading.value = true
    receipts.value = await store.fetchDeliveryReceipts()
    loading.value = false
  }

  const filtered = computed(() => {
    const q = search.value.trim().toLowerCase()
    if (!q) return receipts.value
    return receipts.value.filter((r) =>
      [r.dr_no, r.order_no, r.customer_name, r.received_by]
        .some((f) => (f ?? '').toLowerCase().includes(q)),
    )
  })

  function openReceipt(dr: DeliveryReceiptType) {
    selected.value = dr
    showReceipt.value = true
  }

  onMounted(init)

  return {
    loading, receipts, search, filtered,
    showReceipt, selected,
    openReceipt, init,
  }
}
