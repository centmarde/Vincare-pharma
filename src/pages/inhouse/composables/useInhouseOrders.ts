import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useInhouseDataStore } from '@/stores/inhouseData'
import type { InhouseOrderType } from '@/stores/inhouseData'

export const headers = [
  { title: 'ORDER #',   key: 'order_no',     sortable: true,  align: 'start' as const },
  { title: 'GOVT PO #', key: 'govt_po_no',   sortable: false, align: 'center' as const },
  { title: 'CUSTOMER',  key: 'customer',     sortable: false, align: 'start' as const },
  { title: 'TOTAL',     key: 'total_amount', sortable: true,  align: 'center' as const },
  { title: 'DELIVERED', key: 'delivered',    sortable: false, align: 'center' as const },
  { title: 'STATUS',    key: 'status',       sortable: true,  align: 'center' as const },
  { title: '',          key: 'actions',      sortable: false, align: 'end' as const },
] as const

const statusMeta: Record<string, { label: string; color: string }> = {
  negotiating:    { label: 'Negotiating',   color: 'warning' },
  awaiting_stock: { label: 'Awaiting Stock', color: 'orange' },
  ready:          { label: 'Ready',          color: 'info' },
  delivered:      { label: 'Delivered',      color: 'teal' },
  partial:        { label: 'Partially Paid', color: 'amber' },
  paid:           { label: 'Paid',           color: 'success' },
  cancelled:      { label: 'Cancelled',      color: 'error' },
}

export function deliveryPct(order: InhouseOrderType): number {
  const items = order.items ?? []
  const ordered = items.reduce((s, i) => s + i.qty, 0)
  if (ordered === 0) return 0
  const delivered = items.reduce((s, i) => s + (i.delivered_qty ?? 0), 0)
  return Math.round((delivered / ordered) * 100)
}

export function useInhouseOrders() {
  const store = useInhouseDataStore()
  const { orders, loading } = storeToRefs(store)

  const search = ref('')
  const filterStatus = ref<string | null>(null)
  const showRaise = ref(false)
  const showDetail = ref(false)
  const selected = ref<InhouseOrderType | null>(null)

  const statusOptions = [
    { title: 'All', value: null },
    { title: 'Negotiating', value: 'negotiating' },
    { title: 'Awaiting Stock', value: 'awaiting_stock' },
    { title: 'Ready', value: 'ready' },
    { title: 'Delivered', value: 'delivered' },
    { title: 'Partially Paid', value: 'partial' },
    { title: 'Paid', value: 'paid' },
  ]

  const filtered = computed(() =>
    orders.value.filter((o) => {
      if (filterStatus.value && o.status !== filterStatus.value) return false
      if (search.value.trim()) {
        const s = search.value.trim().toLowerCase()
        if (!o.order_no?.toLowerCase().includes(s) &&
            !o.govt_po_no?.toLowerCase().includes(s) &&
            !o.customer?.name?.toLowerCase().includes(s)) return false
      }
      return true
    }))

  const statusLabel = (s: string | null) => statusMeta[s ?? '']?.label ?? s ?? '—'
  const statusColor = (s: string | null) => statusMeta[s ?? '']?.color ?? 'grey'

  function openRaise() { showRaise.value = true }
  function openDetail(o: InhouseOrderType) { selected.value = o; showDetail.value = true }
  async function handleRaised() { showRaise.value = false; await store.fetchOrders() }
  async function handleChanged() {
    await store.fetchOrders()
    if (selected.value) selected.value = orders.value.find((o) => o.id === selected.value!.id) ?? null
  }

  async function init() { await store.fetchOrders() }

  return {
    orders, loading, search, filterStatus, statusOptions,
    filtered, showRaise, showDetail, selected,
    statusLabel, statusColor, deliveryPct,
    openRaise, openDetail, handleRaised, handleChanged, init,
  }
}
