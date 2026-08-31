import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useEthicalDataStore } from '@/stores/ethicalData'
import type { ProductPickerResult } from '@/stores/productsData'
import { useAgentsDataStore } from '@/stores/agentsData'
import { useOutletsDataStore } from '@/stores/outletsData'
import { parseTermDays } from '@/utils/helpers'
import { useCustomerPicker } from '@/composables/useCustomerPicker'
import { useFormDraft } from '@/composables/useFormDraft'

const toast = useToast()

const round2 = (n: number) => Math.round(n * 100) / 100

type FormLine = {
  product_id: number | null
  // The product's own details are held ON the line. The products store only
  // ever returns the first 1,000 of 2,401 rows (Supabase caps an unranged
  // request), so a product chosen through the search dialog is usually absent
  // from it — the below-cost guard and the re-price-on-customer-change below
  // both used to silently find nothing for those products.
  product_name: string
  brand: string | null
  unit: string
  /** System price snapshot — re-priced against the customer's markup. */
  selling: number
  /** Company cost snapshot — drives the below-cost guard. */
  cost: number | null
  quantity: number
  unit_price: number
}

export function useCreateOrder(onCreated: () => void) {
  const ethical = useEthicalDataStore()
  const agentsStore = useAgentsDataStore()
  const outletsStore = useOutletsDataStore()

  const { agents } = storeToRefs(agentsStore)
  const { outlets } = storeToRefs(outletsStore)

  const loading = ref(false)
  const customerId = ref<number | null>(null)
  const agentId = ref<number | null>(null)
  const outletId = ref<number | null>(null)
  const remarks = ref('')
  const lines = ref<FormLine[]>([])

  // Persist a draft so a reload / crash mid-entry doesn't wipe the order.
  // outletId is deliberately excluded from the "touched" check — it auto-defaults
  // to the first branch on open, so it isn't a sign the user actually started.
  // v2: discount/rebate/terms are no longer hand-entered refs (they derive from
  // the customer's trade profile now), so they're dropped from the persisted set
  // — the version bump discards any old v1 draft that still carried them.
  const draft = useFormDraft({
    key: 'ethical-create-order',
    version: 3,
    refs: { customerId, agentId, outletId, remarks, lines },
    isEmpty: () => customerId.value == null && agentId.value == null && !remarks.value
      && !lines.value.some((l) => l.product_id != null || l.unit_price > 0),
  })

  // Searches ALL customers, not just department='ethical' — see useCustomerPicker.
  const { search: customerSearch, customerOptions, selectedCustomer, discountProfile, init: initCustomerPicker } =
    useCustomerPicker(customerId)

  const agentOptions = computed(() =>
    agents.value.map(a => ({ title: a.name, value: a.id })))

  const outletOptions = computed(() =>
    outlets.value.filter(o => o.channel === 'ethical' && o.is_active).map(o => ({ title: o.name, value: o.id })))

  // PRICE = SYSTEM PRICE / DIVISOR, DIVISOR = (100 - MARKUP)% — the client's
  // trade-profile pricing formula (customersData.ts markup_percent). Falls
  // back to the plain system price when the customer has no markup set.
  function priceForCustomer(systemPrice: number): number {
    const markup = discountProfile.value.markupPercent ?? selectedCustomer.value?.markup_percent
    if (markup == null) return systemPrice
    const divisor = (100 - markup) / 100
    if (divisor <= 0) return systemPrice
    return round2(systemPrice / divisor)
  }

  const markupDivisorLabel = computed(() => {
    const markup = discountProfile.value.markupPercent ?? selectedCustomer.value?.markup_percent
    if (markup == null) return null
    return `System Price / ${100 - markup}%`
  })

  const validLines = computed(() => lines.value.filter(l => l.product_id != null && l.quantity > 0))
  const subtotal = computed(() => lines.value.reduce((s, l) => s + l.quantity * l.unit_price, 0))

  // Discount & rebate rates come from the customer's trade profile — locked, not
  // hand-entered per order (single source of truth on the customer). Discount is
  // a real on-invoice price reduction, so it lowers the total. A REBATE is a
  // deferred incentive PAID OUT SEPARATELY to the customer/MSR (cash/GCash per
  // the customer's rebate_payment_mode); it is accrued here for the eventual
  // payout but is intentionally NOT subtracted from what the customer owes.
  // Rates come from the `discounts` table (one row per component of the deal),
  // not from the customer's single-value columns — see discountsData.
  //
  // A profile that doesn't reconcile is NOT priced from: 126 of 1,142 customers
  // have components that don't add up to the agreed total (mostly dropped parts
  // of a multi-recipient split), and guessing there would misstate the invoice.
  // Those fall back to 0% so staff enter the figure deliberately against the
  // recorded terms.
  const termsNeedReview = computed(() =>
    discountProfile.value.rows.length > 0 && !discountProfile.value.reconciles)
  const priceable = computed(() => !termsNeedReview.value)

  const discountRate = computed(() => priceable.value ? discountProfile.value.discountRate : 0)
  const rebateRate = computed(() => priceable.value ? discountProfile.value.rebateRate : 0)
  // In-kind marketing give ("food and drinks instead of cash"). Economically the
  // same erosion as a rebate and it must count against the markup, but it posts
  // to 6010 Ads & Promo rather than 6030, so it is tracked as its own rate.
  const adsRate = computed(() => priceable.value ? discountProfile.value.adsRate : 0)
  const discountAmount = computed(() => round2(subtotal.value * discountRate.value / 100))
  const rebateAmount = computed(() => round2(subtotal.value * rebateRate.value / 100))
  const adsAmount = computed(() => round2(subtotal.value * adsRate.value / 100))
  // term_days is free text in the live data ('60 Days', 'COD', 'Consignment ').
  // Falls back to 0 (due on invoice) when the customer's arrangement carries no
  // day count — the order still needs a concrete due date, unlike AR aging,
  // which deliberately leaves such rows un-aged.
  const termsDays = computed(() => parseTermDays(selectedCustomer.value?.term_days) ?? 0)
  const total = computed(() => subtotal.value - discountAmount.value)
  const dueDatePreview = computed(() => {
    const d = new Date()
    d.setDate(d.getDate() + termsDays.value)
    return d.toISOString().slice(0, 10)
  })

  // ---- Profitability guardrails -------------------------------------------
  // Discount and rebate BOTH scale off the line price, so together they're the
  // share of the price we don't keep. What we actually realize per unit is
  //   net = unit_price * (1 - (discount + rebate)/100)
  // — the invoice alone overstates this, because the rebate is real cash paid
  // out later even though it never appears on the invoice.
  const giveawayRate = computed(() => discountRate.value + rebateRate.value + adsRate.value)
  const netUnitPrice = (unitPrice: number) => round2(unitPrice * (1 - giveawayRate.value / 100))
  const netRevenue = computed(() => round2(subtotal.value * (1 - giveawayRate.value / 100)))

  // 🔴 Hard floor — a line whose net lands under the product's cost is sold at a
  // real loss. Blocks submit. Lines with no cost_price on the master can't be
  // judged, so they're skipped rather than guessed at.
  type BelowCostLine = { index: number; name: string; net: number; cost: number }
  const belowCostLines = computed<BelowCostLine[]>(() =>
    lines.value.flatMap((l, index) => {
      if (l.product_id == null || l.cost == null) return []
      const net = netUnitPrice(l.unit_price)
      return net < l.cost ? [{ index, name: l.product_name, net, cost: l.cost }] : []
    }))
  const hasBelowCostLine = computed(() => belowCostLines.value.length > 0)
  const lineBelowCost = (i: number) => belowCostLines.value.some(b => b.index === i)

  // 🟡 The markup is the budget that funds the discount + rebate: net returns to
  // exactly the system price when (discount + rebate) == markup. Past that the
  // order still clears cost but nets below system price — worth flagging, not
  // blocking (a deliberate promo is the business's call).
  const erodesSystemPrice = computed(() => {
    if (giveawayRate.value === 0) return false
    const markup = discountProfile.value.markupPercent ?? selectedCustomer.value?.markup_percent
    // No markup set -> price IS the system price, so any giveaway erodes it.
    return markup == null ? true : giveawayRate.value > markup
  })

  function addLine() {
    lines.value.push({
      product_id: null, product_name: '', brand: null, unit: '',
      selling: 0, cost: null, quantity: 1, unit_price: 0,
    })
  }
  function removeLine(i: number) { lines.value.splice(i, 1) }

  function applyPickedProduct(i: number, product: ProductPickerResult) {
    const line = lines.value[i]
    if (!line) return
    line.product_id   = product.id
    line.product_name = product.product_name ?? ''
    line.brand        = product.brand
    line.unit         = product.unit ?? ''
    line.selling      = product.selling_price ?? 0
    line.cost         = product.cost_price
    line.unit_price   = priceForCustomer(line.selling)
  }

  function onCustomerChange() {
    const c = customerOptions.value.find(o => o.value === customerId.value)
    if (c && c.agent) agentId.value = c.agent
    // Re-price existing lines for the newly selected customer's markup —
    // still just a default, unit_price stays manually editable per line.
    for (const line of lines.value) {
      if (line.product_id != null) line.unit_price = priceForCustomer(line.selling)
    }
  }

  async function submit() {
    if (!customerId.value) { toast.warning('Select a customer.'); return }
    if (!outletId.value) { toast.warning('Select a branch.'); return }
    if (!validLines.value.length) { toast.warning('Add at least one product with quantity.'); return }
    // Never let a below-cost sale through — after discount + rebate this order
    // would realize less than the goods cost us.
    if (hasBelowCostLine.value) {
      toast.error(`Cannot create: ${belowCostLines.value.length} line(s) sell below cost after discount and rebate.`)
      return
    }

    loading.value = true
    const result = await ethical.createOrder({
      customerId: customerId.value,
      agentId: agentId.value,
      outletId: outletId.value,
      discount: discountAmount.value || undefined,
      rebate: rebateAmount.value || undefined,
      ads: adsAmount.value || undefined,
      termsDays: termsDays.value || undefined,
      remarks: remarks.value || undefined,
      lines: validLines.value.map(l => ({
        product_id: l.product_id!,
        quantity: l.quantity,
        unit_price: l.unit_price,
        // Snapshotted at order time — the same figure the below-cost guard
        // above checks against, so the ledger and the guard agree.
        cost_price: l.cost,
      })),
    })
    loading.value = false
    if (result.success) { draft.clear(); reset(); onCreated() }
  }

  function reset() {
    customerId.value = null
    agentId.value = null
    outletId.value = null
    remarks.value = ''
    lines.value = []
    addLine()
  }

  async function init() {
    await initCustomerPicker()
    if (!agents.value.length) await agentsStore.fetchAgents({ activeOnly: true })
    if (!outlets.value.length) await outletsStore.fetchOutlets()
    // Restore a saved draft first, then fall back to defaults for anything blank.
    draft.restore()
    if (!outletId.value) outletId.value = outletOptions.value[0]?.value ?? null
    if (!lines.value.length) addLine()
  }

  return {
    loading, customerId, agentId, outletId, remarks, lines,
    customerSearch, customerOptions, selectedCustomer, agentOptions, outletOptions,
    subtotal, discountRate, discountAmount, rebateRate, rebateAmount, adsRate, adsAmount,
    termsDays, total, dueDatePreview, discountProfile, termsNeedReview,
    markupDivisorLabel,
    giveawayRate, netRevenue, belowCostLines, hasBelowCostLine, lineBelowCost, erodesSystemPrice,
    addLine, removeLine, applyPickedProduct, onCustomerChange, submit, reset, init,
  }
}
