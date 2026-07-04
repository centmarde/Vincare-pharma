import { ref, computed } from 'vue'
import { useGLDataStore } from '@/stores/glData'

export function useTrialBalance() {
  const gl = useGLDataStore()

  const asOf = ref(new Date().toISOString().slice(0, 10))

  const rows = computed(() => gl.trialBalance)
  const loading = computed(() => gl.loading)

  const totalDebit = computed(() => rows.value.reduce((s, r) => s + (r.debit_balance ?? 0), 0))
  const totalCredit = computed(() => rows.value.reduce((s, r) => s + (r.credit_balance ?? 0), 0))
  const isBalanced = computed(() => Math.abs(totalDebit.value - totalCredit.value) < 0.01)

  async function load() {
    await gl.fetchTrialBalance(asOf.value)
  }

  return { asOf, rows, loading, totalDebit, totalCredit, isBalanced, load }
}
