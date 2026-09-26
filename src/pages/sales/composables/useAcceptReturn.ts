import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useSalesReturnsDataStore } from '@/stores/salesReturnsData'
import type { ReturnCondition, ReturnSettlement } from '@/stores/salesReturnsData'
import { useStockSourcingStore } from '@/stores/stockSourcingData'
import type { StockLocationId } from '@/stores/stockSourcingData'
import { useCustomersDataStore } from '@/stores/customersData'
import type { ProductPickerResult } from '@/stores/productsData'
import { useFormDraft } from '@/composables/useFormDraft'
import { formatCurrency, formatExpiryLabel } from '@/utils/helpers'

const toast = useToast()

// Accepting a customer return. The company never refunds money — goods come
// back and other goods go out in their place (see docs/RETURNS_PLAN.md).
//
// This form owns the INBOUND half only: what came back, in what condition, and
// how it is being settled. Issuing the replacement is a separate step.

type ReturnLineItem = {
  product_id: number | null
  /**
   * Held on the line rather than looked up from the products store, which only
   * ever returns the first 1,000 rows — a product picked through the batch
   * dialog is usually not among them. Same reason the transfer request form
   * carries its own copy.
   */
  product_name: string
  batch_no: string | null
  expiry_date: string | null
  unit: string
  qty: number
  /** What the customer is credited per unit. */
  unit_price: number
  /** Company cost, snapshotted for the GL's inventory leg. */
  cost_price: number | null
  condition: ReturnCondition
}

export const returnConditions: { value: ReturnCondition; title: string; hint: string }[] = [
  { value: 'good', title: 'Good — resalable', hint: 'Goes back into stock on its original batch' },
  { value: 'expired', title: 'Expired', hint: 'Written off — never re-enters stock' },
  { value: 'broken', title: 'Broken / damaged', hint: 'Written off — never re-enters stock' },
]

export function useAcceptReturn(onCreated: () => void) {
  const returnsStore = useSalesReturnsDataStore()
  const sourcingStore = useStockSourcingStore()
  const customersStore = useCustomersDataStore()

  const { locations } = storeToRefs(sourcingStore)
  const { customers } = storeToRefs(customersStore)

  // ─── State ────────────────────────────────────────────────────────
  const loading = ref(false)
  const customerId = ref<number | null>(null)
  const locationId = ref<StockLocationId>(null)
  const settlement = ref<ReturnSettlement>('swapped')
  const remarks = ref('')
  const lines = ref<ReturnLineItem[]>([])

  // Persist a draft so a reload or a dropped connection mid-entry doesn't wipe
  // a half-recorded return with the customer standing at the counter.
  const draft = useFormDraft({
    key: 'accept-return',
    version: 1,
    refs: { customerId, locationId, settlement, remarks, lines },
    // Every ref that persists is checked here too: a form filled in with only
    // one of them must not be judged empty and silently discarded.
    isEmpty: () => customerId.value == null && locationId.value == null
      && !remarks.value && settlement.value === 'swapped'
      && !lines.value.some((l) => l.product_id != null),
  })

  // ─── Options ──────────────────────────────────────────────────────
  const locationOptions = computed(() =>
    locations.value.map((l) => ({ title: l.name, value: l.id })),
  )

  const customerOptions = computed(() =>
    customers.value.map((c) => ({ title: c.name, value: c.id })),
  )

  // ─── Derived ──────────────────────────────────────────────────────
  const validLines = computed(() =>
    lines.value.filter((l) => l.product_id != null && l.qty > 0),
  )

  const totalAmount = computed(() =>
    validLines.value.reduce((sum, l) => sum + l.qty * Number(l.unit_price || 0), 0),
  )

  /** Lines that go back into sellable stock. */
  const restockLines = computed(() => validLines.value.filter((l) => l.condition === 'good'))

  /**
   * Lines written off. Shown as its own figure because it is the part of the
   * credit the company eats: the customer is credited for these just the same,
   * but nothing comes back to sell.
   */
  const writeOffLines = computed(() => validLines.value.filter((l) => l.condition !== 'good'))

  const writeOffValue = computed(() =>
    writeOffLines.value.reduce((sum, l) => sum + l.qty * Number(l.unit_price || 0), 0),
  )

  const blockers = computed(() => {
    const missing: string[] = []
    if (!validLines.value.length) missing.push('at least one returned item with a quantity')
    if (validLines.value.some((l) => Number(l.unit_price || 0) <= 0)) {
      missing.push('a credit value on every line')
    }
    // A credit has to be owed to somebody: without a customer there is no
    // account to carry it. The store refuses this too — repeated here so the
    // button explains itself rather than failing on submit.
    if (settlement.value === 'credited' && customerId.value == null) {
      missing.push('a customer, to leave the value as credit')
    }
    return missing
  })

  const canSubmit = computed(() => blockers.value.length === 0 && !loading.value)

  // ─── Line actions ─────────────────────────────────────────────────
  function addLine() {
    lines.value.push({
      product_id: null, product_name: '', batch_no: null, expiry_date: null,
      unit: '', qty: 1, unit_price: 0, cost_price: null, condition: 'good',
    })
  }

  /**
   * Fills a line from the batch picker.
   *
   * The credit defaults to the batch's selling price — what the customer most
   * likely paid — and stays editable, because the actual sale may have carried
   * a discount. Cost comes along for the GL's inventory leg.
   */
  function applyPickedProduct(index: number, product: ProductPickerResult) {
    const line = lines.value[index]
    if (!line) return
    line.product_id = product.id
    line.product_name = product.product_name ?? ''
    line.batch_no = product.batch_no
    line.expiry_date = product.expiry_date
    line.unit = product.unit ?? ''
    line.cost_price = product.cost_price
    if (!line.unit_price) line.unit_price = Number(product.selling_price ?? 0)
  }

  function removeLine(index: number) {
    lines.value.splice(index, 1)
  }

  function batchLabel(line: ReturnLineItem): string {
    const batch = line.batch_no || '—'
    return `Batch ${batch} · Exp ${formatExpiryLabel(line.expiry_date)}`
  }

  function lineTotal(line: ReturnLineItem): number {
    return line.qty * Number(line.unit_price || 0)
  }

  // ─── Submit ───────────────────────────────────────────────────────
  function reset() {
    customerId.value = null
    locationId.value = null
    settlement.value = 'swapped'
    remarks.value = ''
    lines.value = []
    draft.clear()
  }

  async function submit() {
    if (!canSubmit.value) return { success: false }
    loading.value = true
    try {
      const result = await returnsStore.createReturn({
        customerId: customerId.value,
        locationId: locationId.value,
        settlement: settlement.value,
        remarks: remarks.value || null,
        lines: validLines.value.map((l) => ({
          product_id: l.product_id as number,
          qty: l.qty,
          unit_price: Number(l.unit_price || 0),
          cost_price: l.cost_price,
          condition: l.condition,
        })),
      })
      if (result.success) {
        reset()
        onCreated()
      }
      return result
    } catch {
      toast.error('Failed to record the return.')
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  async function init() {
    // Unconditional fetches: `customers` is one shared list across modules, so
    // guarding on length lets whichever module loaded first decide what this
    // form can see.
    await Promise.all([
      sourcingStore.fetchLocations(),
      customersStore.fetchCustomers({ activeOnly: true }),
    ])
    draft.restore()
    if (!lines.value.length) addLine()
  }

  return {
    loading,
    customerId, locationId, settlement, remarks, lines,
    locationOptions, customerOptions, returnConditions,
    validLines, totalAmount, restockLines, writeOffLines, writeOffValue,
    blockers, canSubmit,
    addLine, applyPickedProduct, removeLine, batchLabel, lineTotal,
    submit, reset, init,
    formatCurrency,
  }
}
