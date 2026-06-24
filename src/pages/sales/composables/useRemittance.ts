import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRemittancesDataStore } from '@/stores/remittancesData'
import { useSalesDataStore } from '@/stores/salesData'
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
  const salesStore = useSalesDataStore()
  const { remittances, loading } = storeToRefs(remitStore)

  // ─── State ────────────────────────────────────────────────────────
  const showSubmitDialog = ref(false)
  const outletId = ref<number | null>(null)
  const expected = ref<ExpectedSummary>({ expected: 0, saleCount: 0, saleIds: [] })
  const actualAmount = ref<number | null>(null)
  const notes = ref('')

  // ─── Computed ─────────────────────────────────────────────────────
  const discrepancy = computed(() => (actualAmount.value ?? 0) - expected.value.expected)
  const canSubmit = computed(() => expected.value.saleCount > 0 && actualAmount.value != null)

  // ─── Actions ──────────────────────────────────────────────────────
  async function init() {
    outletId.value = (await salesStore.resolveExelmedOutletId()) ?? null
    await remitStore.fetchRemittances(
      outletId.value != null ? { outlet_id: outletId.value } : {},
    )
  }

  async function openSubmitDialog() {
    if (outletId.value == null) return
    expected.value = await remitStore.computeExpected(outletId.value)
    actualAmount.value = null
    notes.value = ''
    showSubmitDialog.value = true
  }

  async function handleSubmit() {
    if (outletId.value == null || !canSubmit.value) return
    const result = await remitStore.submitRemittance({
      outletId:     outletId.value,
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
