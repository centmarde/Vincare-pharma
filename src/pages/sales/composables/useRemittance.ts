import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRemittancesDataStore } from '@/stores/remittancesData'
import { EXELMED_OUTLET } from '@/stores/salesData'
import type { ExpectedSummary } from '@/stores/remittancesData'

export const headers = [
  { title: 'REMITTANCE #', key: 'remittance_no',   sortable: true,  align: 'center' as const },
  { title: 'DATE',         key: 'remittance_date',  sortable: true,  align: 'center' as const },
  { title: 'EXPECTED',     key: 'expected_amount',  sortable: false, align: 'center' as const },
  { title: 'ACTUAL',       key: 'actual_amount',    sortable: false, align: 'center' as const },
  { title: 'DISCREPANCY',  key: 'discrepancy',      sortable: false, align: 'center' as const },
] as const

export function useRemittance() {
  const remitStore = useRemittancesDataStore()
  const { remittances, loading } = storeToRefs(remitStore)

  // ─── State ────────────────────────────────────────────────────────
  const showSubmitDialog = ref(false)
  const expected = ref<ExpectedSummary>({ expected: 0, saleCount: 0 })
  const actualAmount = ref<number | null>(null)
  const notes = ref('')

  // ─── Computed ─────────────────────────────────────────────────────
  const discrepancy = computed(() => (actualAmount.value ?? 0) - expected.value.expected)
  const canSubmit = computed(() => expected.value.saleCount > 0 && actualAmount.value != null)

  // ─── Actions ──────────────────────────────────────────────────────
  async function init() {
    await remitStore.fetchRemittances({ outlet: EXELMED_OUTLET })
  }

  async function openSubmitDialog() {
    expected.value = await remitStore.computeExpected(EXELMED_OUTLET)
    actualAmount.value = null
    notes.value = ''
    showSubmitDialog.value = true
  }

  async function handleSubmit() {
    if (!canSubmit.value) return
    const result = await remitStore.submitRemittance({
      outlet:       EXELMED_OUTLET,
      actualAmount: actualAmount.value ?? 0,
      notes:        notes.value || undefined,
    })
    if (result.success) showSubmitDialog.value = false
  }

  return {
    remittances, loading,
    showSubmitDialog, expected, actualAmount, notes,
    discrepancy, canSubmit,
    init, openSubmitDialog, handleSubmit,
  }
}
