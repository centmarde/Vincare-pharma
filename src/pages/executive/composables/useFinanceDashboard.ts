import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'

export function useFinanceDashboard() {
  const store = useFinanceDataStore()
  const { pnl, loading } = storeToRefs(store)

  const dateFrom = ref<string | null>(null)
  const dateTo = ref<string | null>(null)

  async function load() {
    await store.fetchPnL({ dateFrom: dateFrom.value ?? undefined, dateTo: dateTo.value ?? undefined })
  }

  function applyFilter() {
    load()
  }

  function clearFilter() {
    dateFrom.value = null
    dateTo.value = null
    load()
  }

  onMounted(load)

  return {
    pnl, loading,
    dateFrom, dateTo,
    applyFilter, clearFilter,
  }
}
