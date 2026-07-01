import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEthicalDataStore } from '@/stores/ethicalData'

export function useCommissions() {
  const ethical = useEthicalDataStore()
  const { collections, commissionSummary, loading } = storeToRefs(ethical)

  const statusFilter = ref<'all' | 'paid' | 'unpaid'>('all')
  const agentIdFilter = ref<number | null>(null)

  const headers = [
    { title: 'Date', key: 'created_at', width: '120px' },
    { title: 'Amount', key: 'amount', align: 'end' as const },
    { title: 'Commission Rate', key: 'commission_rate', align: 'end' as const, width: '100px' },
    { title: 'Commission Amt', key: 'commission_amount', align: 'end' as const },
    { title: 'Status', key: 'commission_status' },
  ]

  const filteredCollections = computed(() => {
    let result = collections.value
    if (statusFilter.value !== 'all') {
      result = result.filter(c => c.commission_status === statusFilter.value)
    }
    if (agentIdFilter.value) {
      result = result.filter(c => c.agent_id === agentIdFilter.value)
    }
    return result
  })

  async function init() {
    await Promise.all([ethical.fetchCommissionSummary(), ethical.fetchCollections()])
  }

  return {
    collections: filteredCollections,
    commissionSummary,
    loading,
    statusFilter,
    agentIdFilter,
    headers,
    init,
  }
}
