import { ref, computed } from 'vue'
import { useGLDataStore } from '@/stores/glData'

export function useBalanceSheet() {
  const gl = useGLDataStore()

  const asOf = ref(new Date().toISOString().slice(0, 10))

  const sheet = computed(() => gl.balanceSheet)
  const loading = computed(() => gl.loading)
  const tiesOut = computed(() => gl.balanceSheet?.tiesOut ?? false)

  async function load() {
    await gl.fetchBalanceSheet(asOf.value)
  }

  return { asOf, sheet, loading, tiesOut, load }
}
