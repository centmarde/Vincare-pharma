import { ref, computed } from 'vue'
import { useSalesReturnsDataStore } from '@/stores/salesReturnsData'
import type { SalesReturnType } from '@/stores/salesReturnsData'
import type { ProductPickerResult } from '@/stores/productsData'
import { formatCurrency } from '@/utils/helpers'

// Issuing replacement goods against a recorded return.
//
// Separate from accepting the return on purpose: the return is a fact the
// moment the goods come back, while what the customer takes instead may be
// decided minutes later. Recording them apart also leaves the credit visible
// in 2065 in between, rather than assuming the swap completes in one motion.

type ReplacementLine = {
  product_id: number | null
  product_name: string
  unit: string
  qty: number
  unit_price: number
  cost_price: number | null
}

export function useIssueReplacement(onIssued: () => void) {
  const returnsStore = useSalesReturnsDataStore()

  const loading = ref(false)
  const source = ref<SalesReturnType | null>(null)
  const lines = ref<ReplacementLine[]>([])

  /** The credit this return created — the ceiling on what may be issued. */
  const creditAvailable = computed(() => source.value?.total_amount ?? 0)

  const validLines = computed(() =>
    lines.value.filter((l) => l.product_id != null && l.qty > 0),
  )

  const total = computed(() =>
    validLines.value.reduce((sum, l) => sum + l.qty * Number(l.unit_price || 0), 0),
  )

  /**
   * What stays on the customer's account.
   *
   * Shown live because it is the whole point of the uneven-swap rule: taking
   * less than was returned leaves real value owed, and the person at the
   * counter should see that before committing, not discover it in the ledger.
   */
  const remaining = computed(() => Math.max(0, creditAvailable.value - total.value))

  const exceedsCredit = computed(() => total.value > creditAvailable.value + 0.009)

  const blockers = computed(() => {
    const missing: string[] = []
    if (!validLines.value.length) missing.push('at least one replacement item')
    if (validLines.value.some((l) => Number(l.unit_price || 0) <= 0)) {
      missing.push('a price on every line')
    }
    if (exceedsCredit.value) {
      missing.push(`a total within the ${formatCurrency(creditAvailable.value)} credit`)
    }
    return missing
  })

  const canSubmit = computed(() => blockers.value.length === 0 && !loading.value)

  function addLine() {
    lines.value.push({
      product_id: null, product_name: '', unit: '', qty: 1, unit_price: 0, cost_price: null,
    })
  }

  function applyPickedProduct(index: number, product: ProductPickerResult) {
    const line = lines.value[index]
    if (!line) return
    line.product_id = product.id
    line.product_name = product.product_name ?? ''
    line.unit = product.unit ?? ''
    line.cost_price = product.cost_price
    if (!line.unit_price) line.unit_price = Number(product.selling_price ?? 0)
  }

  function removeLine(index: number) {
    lines.value.splice(index, 1)
  }

  function lineTotal(line: ReplacementLine): number {
    return line.qty * Number(line.unit_price || 0)
  }

  /** Loads the return being settled and starts a blank line. */
  function open(row: SalesReturnType) {
    source.value = row
    lines.value = []
    addLine()
  }

  function reset() {
    source.value = null
    lines.value = []
  }

  async function submit() {
    if (!canSubmit.value || !source.value) return { success: false }
    loading.value = true
    try {
      const result = await returnsStore.issueReplacement({
        returnId: source.value.id,
        lines: validLines.value.map((l) => ({
          product_id: l.product_id as number,
          qty: l.qty,
          unit_price: Number(l.unit_price || 0),
          cost_price: l.cost_price,
        })),
      })
      if (result.success) {
        reset()
        onIssued()
      }
      return result
    } finally {
      loading.value = false
    }
  }

  return {
    loading, source, lines,
    creditAvailable, validLines, total, remaining, exceedsCredit,
    blockers, canSubmit,
    addLine, applyPickedProduct, removeLine, lineTotal,
    open, reset, submit,
    formatCurrency,
  }
}
