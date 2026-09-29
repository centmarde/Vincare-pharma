import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEthicalDataStore } from '@/stores/ethicalData'
import type { EthicalOrderType } from '@/stores/ethicalData'

export function useEthicalOrders() {
  const ethical = useEthicalDataStore()
  const { orders, loading } = storeToRefs(ethical)

  const searchText = ref('')
  const statusFilter = ref('')
  const agentIdFilter = ref<number | null>(null)

  const headers = [
    { title: 'Order No', key: 'order_no', width: '120px' },
    { title: 'Customer', key: 'customer.name' },
    { title: 'TIN', key: 'customer.tin_number' },
    { title: 'VAT', key: 'customer.is_vat_registered', align: 'center' as const },
    { title: 'MSR', key: 'agent.name' },
    { title: 'Total', key: 'total_amount', align: 'end' as const },
    { title: 'Balance', key: 'balance', align: 'end' as const },
    { title: 'Due Date', key: 'due_date', width: '120px' },
    { title: 'Status', key: 'status', width: '120px' },
  ]

  const statusOptions = [
    { title: 'All', value: '' },
    { title: 'Draft', value: 'draft' },
    { title: 'Invoiced', value: 'invoiced' },
    { title: 'Partial', value: 'partial' },
    { title: 'Paid', value: 'paid' },
    { title: 'Cancelled', value: 'cancelled' },
  ]

  const statusMeta = (status: string | null): { label: string; color: string } => {
    const map: Record<string, { label: string; color: string }> = {
      draft: { label: 'Draft', color: 'grey' },
      invoiced: { label: 'Invoiced', color: 'warning' },
      partial: { label: 'Partial', color: 'info' },
      paid: { label: 'Paid', color: 'success' },
      cancelled: { label: 'Cancelled', color: 'error' },
    }
    return map[status ?? ''] ?? { label: '—', color: 'grey' }
  }

  const isOverdue = (order: EthicalOrderType): boolean => {
    if (!order.due_date || order.status === 'paid') return false
    return new Date(order.due_date) < new Date()
  }

  // A draft is still being haggled — nothing is owed on it yet.
  const balanceAmount = (order: EthicalOrderType): number => {
    if (order.status === 'draft') return 0
    return Math.max(0, (order.total_amount ?? 0) - (order.amount_paid ?? 0))
  }

  const isDraft = (order: { status: string | null }): boolean => order.status === 'draft'

  // A draft has no EO number yet (minted at invoicing), so it shows its row id.
  const orderLabel = (order: { id: number; order_no: string | null; status: string | null }): string =>
    order.order_no ?? (isDraft(order) ? `Draft #${order.id}` : '—')

  const filteredOrders = computed(() => {
    let result = orders.value
    if (searchText.value) {
      const s = searchText.value.toLowerCase()
      result = result.filter(o =>
        (orderLabel(o).toLowerCase().includes(s)) ||
        (o.customer?.name?.toLowerCase().includes(s)) ||
        (o.agent?.name?.toLowerCase().includes(s))
      )
    }
    if (statusFilter.value) {
      result = result.filter(o => o.status === statusFilter.value)
    }
    if (agentIdFilter.value) {
      result = result.filter(o => o.agent_id === agentIdFilter.value)
    }
    return result.map(o => ({ ...o, balance: balanceAmount(o), isOverdue: isOverdue(o) }))
  })

  async function init() {
    await ethical.fetchOrders()
  }

  return {
    orders: filteredOrders,
    loading,
    searchText,
    statusFilter,
    agentIdFilter,
    headers,
    statusOptions,
    statusMeta,
    isOverdue,
    balanceAmount,
    isDraft,
    orderLabel,
    init,
  }
}
