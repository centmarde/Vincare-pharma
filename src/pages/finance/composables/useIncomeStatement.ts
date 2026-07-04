import { ref, computed } from 'vue'
import { useGLDataStore } from '@/stores/glData'

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`
}
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function useIncomeStatement() {
  const gl = useGLDataStore()

  const dateFrom = ref(startOfYear())
  const dateTo = ref(today())

  const statement = computed(() => gl.incomeStatement)
  const loading = computed(() => gl.loading)

  async function load() {
    await gl.fetchIncomeStatement(dateFrom.value, dateTo.value)
  }

  return { dateFrom, dateTo, statement, loading, load }
}
