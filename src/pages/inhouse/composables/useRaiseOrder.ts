import { ref, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useInhouseDataStore } from '@/stores/inhouseData'
import type { ProductPickerResult } from '@/stores/productsData'
import { useFormDraft } from '@/composables/useFormDraft'
import { formatCurrency } from '@/utils/helpers'
import { useCustomerPicker } from '@/composables/useCustomerPicker'

const toast = useToast()

type FormLine = {
  product_id: number | null
  // Name and unit are held ON the line, not looked up from the products store.
  // The store only ever holds the first page of a 2.4k-row file, so a product
  // picked through the search dialog is usually absent from it — resolving the
  // label from there rendered a blank field for most products.
  product_name: string
  unit: string
  qty: number
  offer_unit: number   // the PR price per unit (what the govt is offering)
  cost_unit: number    // company cost per unit
}

export function useRaiseOrder(onCreated: () => void) {
  const inhouse = useInhouseDataStore()

  const loading = ref(false)
  const customerId = ref<number | null>(null)
  const govtPoNo = ref('')   // the government's external PO # (documentation-only)
  const poAmount = ref<number | null>(null)  // the value on that PO (documentation-only)
  const remarks = ref('')
  const lines = ref<FormLine[]>([])

  // Persist a draft so a reload / crash mid-entry doesn't wipe the order.
  // Version bumped to 3 when each line gained product_name/unit — an older
  // draft has a different shape and is discarded rather than half-applied.
  const draft = useFormDraft({
    key: 'inhouse-raise-order',
    version: 3,
    refs: { customerId, govtPoNo, poAmount, remarks, lines },
    isEmpty: () => customerId.value == null && !govtPoNo.value && poAmount.value == null && !remarks.value
      && !lines.value.some((l) => l.product_id != null || l.offer_unit > 0 || l.cost_unit > 0),
  })

  // Searches ALL customers, not just department='inhouse' — see useCustomerPicker.
  // In-House prices are negotiated per line, so the profile is DISPLAY-ONLY
  // here — it never adjusts a price. It matters because 54 of 81 government
  // accounts carry an agreed basis the negotiator otherwise cannot see.
  const { search: customerSearch, customerOptions, selectedCustomer, discountProfile, init: initCustomerPicker } =
    useCustomerPicker(customerId)

  // The govt PO # field is documentation for actual government/LGU accounts only —
  // a private in-house client has no external govt PO to record.
  const isGovtCustomer = computed(() => {
    const c = selectedCustomer.value
    return c?.agency_type === 'government' || c?.agency_type === 'lgu'
  })

  const validLines = computed(() => lines.value.filter((l) => l.product_id != null && l.qty > 0))
  const offerTotal = computed(() => lines.value.reduce((s, l) => s + l.qty * l.offer_unit, 0))
  const costTotal = computed(() => lines.value.reduce((s, l) => s + l.qty * l.cost_unit, 0))
  // Ratio = Company Cost / Customer Offer. Below 1.00 the order earns; at or
  // above 1.00 it does not. Deliberately NOT shown as 0.00 when either side is
  // missing: 80% of the product file carries no cost_price, and a 0.00 ratio
  // reads as an outstanding margin when it really means nothing was entered.
  const costRatio = computed(() =>
    offerTotal.value > 0 && costTotal.value > 0 ? costTotal.value / offerTotal.value : null)

  // The ratio is rounded ONCE here and everything else derives from that value,
  // so the two figures on screen can never disagree: margin is the exact
  // complement of the displayed ratio (0.72 always reads alongside 28%).
  const ratioValue = computed(() => costRatio.value === null ? null : Number(costRatio.value.toFixed(2)))
  const ratioLabel = computed(() => ratioValue.value === null ? '—' : ratioValue.value.toFixed(2))
  const ratioClass = computed(() =>
    ratioValue.value === null ? 'text-medium-emphasis' : ratioValue.value < 1 ? 'text-success' : 'text-error')

  // Peso profit is exact; the percentage beside it is the ratio's complement.
  // Both go blank whenever the ratio does — showing the whole offer as "profit"
  // against an unentered cost is the misreading this pairing exists to prevent.
  const profit = computed(() => costRatio.value === null ? null : offerTotal.value - costTotal.value)
  const profitLabel = computed(() => profit.value === null ? '—' : formatCurrency(profit.value))
  const marginLabel = computed(() =>
    ratioValue.value === null ? '—' : `${Math.round((1 - ratioValue.value) * 100)}%`)

  // Clear a stale govt PO # if the user switches to a customer that isn't govt/LGU.
  watch(isGovtCustomer, (govt) => { if (!govt) { govtPoNo.value = ''; poAmount.value = null } })

  function addLine() { lines.value.push({ product_id: null, product_name: '', unit: '', qty: 1, offer_unit: 0, cost_unit: 0 }) }
  function removeLine(i: number) { lines.value.splice(i, 1) }

  // Applies a product chosen in the search dialog. Cost is snapshotted from the
  // master; the PR price is left for staff to type from the government's own
  // document (only 7 of 2,401 products carry a selling_price, so prefilling it
  // was doing nothing anyway).
  function applyPickedProduct(i: number, product: ProductPickerResult) {
    const line = lines.value[i]
    if (!line) return
    line.product_id = product.id
    line.product_name = product.product_name ?? ''
    line.unit = product.unit ?? ''
    if (product.cost_price != null) line.cost_unit = product.cost_price
    if (!line.offer_unit && product.selling_price != null) line.offer_unit = product.selling_price
  }

  async function submit() {
    if (!customerId.value) { toast.warning('Select a customer (government/LGU).'); return }
    if (!validLines.value.length) { toast.warning('Add at least one product with quantity.'); return }

    loading.value = true
    const result = await inhouse.createOrder({
      customerId: customerId.value,
      govtPoNo: govtPoNo.value || undefined,
      poAmount: poAmount.value ?? undefined,
      remarks: remarks.value || undefined,
      lines: validLines.value.map((l) => ({
        product_id: l.product_id!, qty: l.qty, unit_price: l.offer_unit, cost_price: l.cost_unit,
      })),
    })
    loading.value = false
    if (result.success) { draft.clear(); reset(); onCreated() }
  }

  function reset() {
    customerId.value = null; govtPoNo.value = ''; poAmount.value = null; remarks.value = ''; lines.value = []; addLine()
  }

  async function init() {
    await initCustomerPicker()
    // Restore a saved draft first; only seed an empty line if there's nothing to restore.
    if (!draft.restore() && !lines.value.length) addLine()
  }

  return {
    loading, customerId, govtPoNo, poAmount, remarks, lines,
    customerSearch, customerOptions, selectedCustomer, discountProfile, isGovtCustomer,
    offerTotal, costTotal, costRatio, ratioLabel, ratioClass, profitLabel, marginLabel,
    addLine, removeLine, applyPickedProduct, submit, reset, init,
  }
}
