import { computed, ref, watch } from 'vue'
import { useTermsApprovalStore } from '@/stores/termsApprovalData'
import type { TermsDecision, DecisionLine } from '@/stores/termsApprovalData'
import { formatCurrency } from '@/utils/helpers'

// The figures an executive decides a terms request on: what the order earns,
// what it costs, how it sits against the government's PR, and whether the stock
// is there. Read live when the request is opened (see fetchDecisionDetails).
//
// The ratio is Company Cost / what the business keeps, rounded ONCE and
// everything else derived from it — the same rule the order screens use, so
// the executive sees the figure staff saw (0.72 always beside 28%).
export function useTermsDecision(request: () => any) {
  const store = useTermsApprovalStore()

  const details = ref<TermsDecision | null>(null)
  const loading = ref(false)
  let loadSeq = 0

  watch(
    () => request()?.id,
    async () => {
      const r = request()
      details.value = null
      if (!r?.transaction_id || !r.order_type) return
      const seq = ++loadSeq
      loading.value = true
      const d = await store.fetchDecisionDetails(r.transaction_id, r.order_type, r.request_type, r.created_by ?? null)
      // A newer request was opened meanwhile.
      if (seq !== loadSeq) return
      details.value = d
      loading.value = false
    },
    { immediate: true },
  )

  const isUnlock = computed(() => request()?.request_type === 'unlock_terms')
  const isEthical = computed(() => details.value?.order_type === 'ethical_order')
  const lines = computed<DecisionLine[]>(() => details.value?.lines ?? [])

  const grossTotal = computed(() => lines.value.reduce((s, l) => s + l.line_total, 0))
  const costTotal = computed(() => lines.value.reduce((s, l) => s + (l.cost_unit ?? 0) * l.qty, 0))
  const missingCostLines = computed(() => lines.value.filter((l) => l.cost_unit == null || l.cost_unit <= 0).length)
  const belowCostLines = computed(() => lines.value.filter((l) => l.cost_unit != null && l.cost_unit > l.unit_price).length)

  /**
   * What the business keeps. In-House: the agreed total. Ethical: the invoice
   * (after discount) less the rebate and ads, which are paid out separately —
   * judging an Ethical deal on the invoice alone overstates what it earns.
   */
  const keptRevenue = computed(() => {
    const d = details.value
    if (!d) return 0
    return isEthical.value ? d.total - d.rebate - d.ads : d.total
  })

  // No ratio when a side is missing: a 0.00 ratio reads as an outstanding
  // margin when it really means no cost was entered.
  const ratioValue = computed(() =>
    keptRevenue.value > 0 && costTotal.value > 0 ? Number((costTotal.value / keptRevenue.value).toFixed(2)) : null)
  const ratioLabel = computed(() => (ratioValue.value === null ? '—' : ratioValue.value.toFixed(2)))
  // Explicit green, not 'success': the theme derives success from the brand red,
  // so a healthy ratio would read exactly like a losing one.
  const ratioClass = computed(() =>
    ratioValue.value === null ? 'text-medium-emphasis' : ratioValue.value < 1 ? 'text-green-darken-1' : 'text-error')
  const profitLabel = computed(() =>
    ratioValue.value === null ? '—' : formatCurrency(keptRevenue.value - costTotal.value))
  const marginLabel = computed(() =>
    ratioValue.value === null ? '—' : `${Math.round((1 - ratioValue.value) * 100)}%`)

  /** In-House: the order against the government PR it answers. */
  const prComparison = computed(() => {
    const d = details.value
    if (!d || !d.govt_pr_amount) return null
    const share = d.total / d.govt_pr_amount
    return {
      amount: d.govt_pr_amount,
      label: d.total > d.govt_pr_amount
        ? `Exceeds the PR by ${formatCurrency(d.total - d.govt_pr_amount)}`
        : `${Math.round(share * 100)}% of the PR`,
      over: d.total > d.govt_pr_amount,
    }
  })

  // Same rule as the totals: round the ratio once, derive the margin from it —
  // otherwise a one-line order shows 37% above and 38% on its own line.
  function lineMargin(line: DecisionLine): string {
    if (line.cost_unit == null || line.cost_unit <= 0 || line.unit_price <= 0) return '—'
    const ratio = Number((line.cost_unit / line.unit_price).toFixed(2))
    return `${Math.round((1 - ratio) * 100)}%`
  }

  const qtyLabel = (line: DecisionLine) => (line.unit ? `${line.qty} ${line.unit}` : String(line.qty))

  /** What approving actually does, in the executive's words. */
  const effect = computed(() => {
    if (isUnlock.value) {
      return isEthical.value
        ? 'Approving puts the stock back, reverses the sale in the ledger and returns the order to draft. Its EO number is kept.'
        : 'Approving returns the order to negotiation so its terms can change. Its PO number is kept.'
    }
    return isEthical.value
      ? 'Approving invoices this order: its EO number is issued, the stock is drawn and the sale is booked.'
      : 'Approving locks these terms: the order moves on to stock and delivery, and its company PO number is issued once stock is confirmed.'
  })

  return {
    details, loading, isUnlock, isEthical, lines,
    grossTotal, costTotal, missingCostLines, belowCostLines, keptRevenue,
    ratioLabel, ratioClass, profitLabel, marginLabel, prComparison,
    lineMargin, qtyLabel, effect,
  }
}
