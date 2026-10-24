import { computed, ref, watch } from 'vue'
import type { SalesReturnType } from '@/stores/salesReturnsData'
import { useCreditMemosStore } from '@/stores/creditMemosData'
import { useFinanceDataStore } from '@/stores/financeData'
import type { ARAgingRow } from '@/stores/financeData'
import { formatCurrency } from '@/utils/helpers'

// Taking a return's credit off what the customer owes, by CREDIT MEMO — the
// other way to settle a return besides replacement goods (the two can be
// combined, up to the return's value). Mostly consignment customers returning
// expired stock. The memo goes to an executive; once approved it gets its
// CM number and comes off the bill.

export function useApplyReturnCredit(onApplied: () => void) {
  const creditMemosStore = useCreditMemosStore()
  const financeStore = useFinanceDataStore()

  const source = ref<SalesReturnType | null>(null)
  /** The customer's open bills, oldest delivery first. Null = could not be read. */
  const receivables = ref<ARAgingRow[] | null>([])
  const loadingBills = ref(false)
  const saving = ref(false)
  const selectedKey = ref<string | null>(null)
  const amount = ref(0)
  /** Printed on the credit memo; defaults to naming the return. */
  const note = ref('')

  const keyOf = (row: ARAgingRow) => `${row.source}:${row.id}`

  const creditLeft = computed(() => source.value?.credit_remaining ?? 0)
  const selected = computed(() => receivables.value?.find((r) => keyOf(r) === selectedKey.value) ?? null)

  /** Never more than the credit left or than the bill still owes. */
  const maxAmount = computed(() => Math.min(creditLeft.value, selected.value?.balance ?? 0))

  // Picking another bill resets the amount to what fits it.
  watch(selectedKey, () => {
    amount.value = Math.round(maxAmount.value * 100) / 100
  })

  const blockers = computed(() => {
    const missing: string[] = []
    if (!selected.value) missing.push('a bill to take it off')
    if (!(amount.value > 0)) missing.push('an amount')
    if (!note.value.trim()) missing.push('a reason for the credit memo')
    if (selected.value && amount.value > maxAmount.value + 0.005) {
      missing.push(`an amount within ${formatCurrency(maxAmount.value)}`)
    }
    return missing
  })
  const canSubmit = computed(() => blockers.value.length === 0 && !saving.value && !loadingBills.value)

  async function open(row: SalesReturnType) {
    source.value = row
    selectedKey.value = null
    amount.value = 0
    note.value = `Returned goods — ${row.return_no ?? `return #${row.id}`}`
    receivables.value = []
    if (row.customer_id == null) return
    loadingBills.value = true
    try {
      receivables.value = await financeStore.fetchCustomerReceivables(row.customer_id)
      // The oldest bill first — the same order payments are applied in.
      const first = receivables.value?.[0]
      selectedKey.value = first ? keyOf(first) : null
    } finally {
      loadingBills.value = false
    }
  }

  function reset() {
    source.value = null
    receivables.value = []
    selectedKey.value = null
    amount.value = 0
    note.value = ''
  }

  async function submit() {
    if (!canSubmit.value || !source.value || !selected.value) return { success: false }
    saving.value = true
    try {
      const result = await creditMemosStore.requestCreditMemo({
        target: { source: selected.value.source, id: selected.value.id },
        amount: amount.value,
        reasonCode: 'returned_goods',
        reason: note.value,
        salesReturnId: source.value.id,
      })
      if (result.success) {
        reset()
        onApplied()
      }
      return result
    } finally {
      saving.value = false
    }
  }

  return {
    source, receivables, loadingBills, saving, selectedKey, amount, note,
    creditLeft, selected, maxAmount, blockers, canSubmit,
    keyOf, open, reset, submit,
    formatCurrency,
  }
}
