import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRemittancesDataStore, LARGE_DISCREPANCY_THRESHOLD } from '@/stores/remittancesData'
import { useOutletsDataStore } from '@/stores/outletsData'
import type { ExpectedSummary } from '@/stores/remittancesData'

export const headers = [
  { title: 'REMITTANCE #', key: 'remittance_no',   sortable: true,  align: 'center' as const },
  { title: 'BRANCH',       key: 'outlet',           sortable: false, align: 'center' as const },
  { title: 'DATE',         key: 'remittance_date',  sortable: true,  align: 'center' as const },
  { title: 'EXPECTED',     key: 'expected_amount',  sortable: false, align: 'center' as const },
  { title: 'ACTUAL',       key: 'actual_amount',    sortable: false, align: 'center' as const },
  { title: 'DISCREPANCY',  key: 'discrepancy',      sortable: false, align: 'center' as const },
  { title: 'RESOLUTION',   key: 'resolution',       sortable: false, align: 'center' as const },
  { title: 'NOTES',        key: 'notes',            sortable: false, align: 'center' as const },
] as const

export function useRemittance() {
  const remitStore = useRemittancesDataStore()
  const outletsStore = useOutletsDataStore()
  const { remittances, loading } = storeToRefs(remitStore)
  const { outlets } = storeToRefs(outletsStore)

  // ─── State ────────────────────────────────────────────────────────
  const selectedOutletId = ref<number | null>(null)
  const showSubmitDialog = ref(false)
  const expected = ref<ExpectedSummary>({ expected: 0, saleCount: 0 })
  const actualAmount = ref<number | null>(null)
  const notes = ref('')
  const resolution = ref<'paid_on_spot' | 'employee_receivable' | null>(null)

  // ─── Computed ─────────────────────────────────────────────────────
  const outletOptions = computed(() =>
    outlets.value.filter(o => o.channel === 'pos').map(o => ({ title: o.name, value: o.id })),
  )
  const discrepancy = computed(() => (actualAmount.value ?? 0) - expected.value.expected)
  // A cash mismatch must carry a reason in the audit trail — only a balanced
  // count (discrepancy === 0) can submit with notes left blank. Gated on
  // actualAmount being entered so the "required" flag doesn't flash red
  // before the cashier has typed anything (null defaults to 0 in the
  // discrepancy calc, which would otherwise read as a mismatch on open).
  const requiresNote = computed(() => actualAmount.value != null && discrepancy.value !== 0)
  // A shortfall (till has less than expected) is money owed BY the till —
  // it needs an explicit resolution choice. An overage isn't owed by anyone,
  // so it's just banked as-is.
  const isShortfall = computed(() => actualAmount.value != null && discrepancy.value < 0)
  const recommendReceivable = computed(() => Math.abs(discrepancy.value) >= LARGE_DISCREPANCY_THRESHOLD)
  const requiresResolution = computed(() => isShortfall.value)
  const canSubmit = computed(() =>
    expected.value.saleCount > 0 &&
    actualAmount.value != null &&
    (!requiresNote.value || notes.value.trim().length > 0) &&
    (!requiresResolution.value || resolution.value != null),
  )

  // ─── Actions ──────────────────────────────────────────────────────
  async function loadRemittances() {
    if (!selectedOutletId.value) return
    await remitStore.fetchRemittances({ outletId: selectedOutletId.value })
  }

  async function setOutlet(outletId: number) {
    selectedOutletId.value = outletId
    await loadRemittances()
  }

  async function init() {
    if (!outlets.value.length) await outletsStore.fetchOutlets()
    if (!selectedOutletId.value) selectedOutletId.value = outletOptions.value[0]?.value ?? null
    await loadRemittances()
  }

  async function openSubmitDialog() {
    if (!selectedOutletId.value) return
    expected.value = await remitStore.computeExpected(selectedOutletId.value)
    actualAmount.value = null
    notes.value = ''
    resolution.value = null
    showSubmitDialog.value = true
  }

  async function handleSubmit() {
    if (!canSubmit.value || !selectedOutletId.value) return
    const result = await remitStore.submitRemittance({
      outletId:     selectedOutletId.value,
      actualAmount: actualAmount.value ?? 0,
      notes:        notes.value || undefined,
      resolution:   resolution.value,
    })
    if (result.success) showSubmitDialog.value = false
  }

  return {
    remittances, loading,
    selectedOutletId, outletOptions, setOutlet,
    showSubmitDialog, expected, actualAmount, notes, resolution,
    discrepancy, requiresNote, canSubmit, isShortfall, recommendReceivable,
    init, openSubmitDialog, handleSubmit,
  }
}
