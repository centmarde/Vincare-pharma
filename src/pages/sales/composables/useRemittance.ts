import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRemittancesDataStore, largeDiscrepancyThreshold } from '@/stores/remittancesData'
import { useWarehousesDataStore } from '@/stores/warehouseData'
import type { WarehouseType } from '@/stores/warehouseData'
import { useFinanceDataStore } from '@/stores/financeData'
import { formatCurrency } from '@/utils/helpers'
import type { ExpectedSummary } from '@/stores/remittancesData'

export const headers = [
  { title: 'REMITTANCE #', key: 'remittance_no',   sortable: true,  align: 'center' as const },
  { title: 'BRANCH',       key: 'warehouse',        sortable: false, align: 'center' as const },
  { title: 'DATE',         key: 'remittance_date',  sortable: true,  align: 'center' as const },
  { title: 'EXPECTED',     key: 'expected_amount',  sortable: false, align: 'center' as const },
  { title: 'ACTUAL',       key: 'actual_amount',    sortable: false, align: 'center' as const },
  { title: 'DISCREPANCY',  key: 'discrepancy',      sortable: false, align: 'center' as const },
  { title: 'RESOLUTION',   key: 'resolution',       sortable: false, align: 'center' as const },
  { title: 'NOTES',        key: 'notes',            sortable: false, align: 'center' as const },
  { title: '',             key: 'cr_actions',       sortable: false, align: 'center' as const },
] as const

export function useRemittance() {
  const remitStore = useRemittancesDataStore()
  const warehousesStore = useWarehousesDataStore()
  const financeStore = useFinanceDataStore()
  const { remittances, loading } = storeToRefs(remitStore)
  const { warehouses } = storeToRefs(warehousesStore)
  const { cashAccounts } = storeToRefs(financeStore)

  // ─── State ────────────────────────────────────────────────────────
  const selectedWarehouseId = ref<number | null>(null)
  const showSubmitDialog = ref(false)
  const expected = ref<ExpectedSummary>({ expected: 0, saleCount: 0, nonCash: [], nonCashTotal: 0 })
  const actualAmount = ref<number | null>(null)
  const notes = ref('')
  // Which Cash on Hand account the counted cash is handed into. It sits there
  // as undeposited collections until a bank deposit banks it.
  const cashAccountId = ref<number | null>(null)
  const resolution = ref<'paid_on_spot' | 'employee_receivable' | null>(null)

  // ─── Computed ─────────────────────────────────────────────────────
  const warehouseOptions = computed(() =>
    warehouses.value.map((w: WarehouseType) => ({ title: w.name, value: w.id })),
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
  const recommendReceivable = computed(() => Math.abs(discrepancy.value) >= largeDiscrepancyThreshold)
  const requiresResolution = computed(() => isShortfall.value)
  // Cash on Hand accounts only — remitted cash is held, not banked. The bank
  // deposit that follows is what turns it into Cash in Bank.
  const cashOnHandOptions = computed(() =>
    cashAccounts.value
      .filter((a) => a.is_active && a.classification === 'PETTY_CASH')
      .map((a) => ({ value: a.id, title: `${a.name} — ${formatCurrency(a.balance ?? 0)} on hand` })),
  )

  const canSubmit = computed(() =>
    expected.value.saleCount > 0 &&
    actualAmount.value != null &&
    cashAccountId.value != null &&
    (!requiresNote.value || notes.value.trim().length > 0) &&
    (!requiresResolution.value || resolution.value != null),
  )

  // ─── Actions ──────────────────────────────────────────────────────
  async function loadRemittances() {
    if (!selectedWarehouseId.value) return
    await remitStore.fetchRemittances({ warehouseId: selectedWarehouseId.value })
  }

  async function setWarehouse(warehouseId: number) {
    selectedWarehouseId.value = warehouseId
    await loadRemittances()
  }

  async function init() {
    if (!warehouses.value.length) await warehousesStore.fetchWarehouses()
    if (!selectedWarehouseId.value) selectedWarehouseId.value = warehouseOptions.value[0]?.value ?? null
    await loadRemittances()
  }

  async function openSubmitDialog() {
    if (!selectedWarehouseId.value) return
    expected.value = await remitStore.computeExpected(selectedWarehouseId.value)
    actualAmount.value = null
    notes.value = ''
    resolution.value = null
    cashAccountId.value = null
    await financeStore.fetchCashAccounts()
    // Usually only one cash-on-hand account exists, so don't make staff pick it.
    if (cashOnHandOptions.value.length === 1) cashAccountId.value = cashOnHandOptions.value[0].value
    showSubmitDialog.value = true
  }

  async function handleSubmit() {
    if (!canSubmit.value || !selectedWarehouseId.value) return
    const result = await remitStore.submitRemittance({
      warehouseId:  selectedWarehouseId.value,
      actualAmount: actualAmount.value ?? 0,
      notes:        notes.value || undefined,
      resolution:   resolution.value,
      cashAccountId: cashAccountId.value ?? 0,
    })
    if (result.success) showSubmitDialog.value = false
  }

  return {
    remittances, loading,
    selectedWarehouseId, warehouseOptions, setWarehouse,
    showSubmitDialog, expected, actualAmount, notes, resolution,
    cashAccountId, cashOnHandOptions,
    discrepancy, requiresNote, canSubmit, isShortfall, recommendReceivable,
    init, openSubmitDialog, handleSubmit,
  }
}
