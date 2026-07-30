import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useInhouseDataStore } from '@/stores/inhouseData'
import { useCustomersDataStore } from '@/stores/customersData'
import { useProductsDataStore } from '@/stores/productsData'
import { useFormDraft } from '@/composables/useFormDraft'

const toast = useToast()

type FormLine = {
  product_id: number | null
  qty: number
  offer_unit: number   // what the govt is offering per unit
  cost_unit: number    // company cost per unit
}

export function useRaiseOrder(onCreated: () => void) {
  const inhouse = useInhouseDataStore()
  const customersStore = useCustomersDataStore()
  const productsStore = useProductsDataStore()
  const { customers } = storeToRefs(customersStore)
  const { products } = storeToRefs(productsStore)

  const loading = ref(false)
  const customerId = ref<number | null>(null)
  const govtPoNo = ref('')   // the government's external PO # (documentation-only)
  const poAmount = ref<number | null>(null)  // the value on that PO (documentation-only)
  const remarks = ref('')
  const lines = ref<FormLine[]>([])

  // Persist a draft so a reload / crash mid-entry doesn't wipe the order.
  // Version bumped to 2 when poAmount was added — an older draft has a
  // different shape and is discarded rather than half-applied.
  const draft = useFormDraft({
    key: 'inhouse-raise-order',
    version: 2,
    refs: { customerId, govtPoNo, poAmount, remarks, lines },
    isEmpty: () => customerId.value == null && !govtPoNo.value && poAmount.value == null && !remarks.value
      && !lines.value.some((l) => l.product_id != null || l.offer_unit > 0 || l.cost_unit > 0),
  })

  const customerOptions = computed(() =>
    customers.value.map((c) => ({ title: `${c.name}${c.agency_type ? ` (${c.agency_type})` : ''}`, value: c.id })))

  // The govt PO # field is documentation for actual government/LGU accounts only —
  // a private in-house client has no external govt PO to record.
  const isGovtCustomer = computed(() => {
    const c = customers.value.find((x) => x.id === customerId.value)
    return c?.agency_type === 'government' || c?.agency_type === 'lgu'
  })

  const productOptions = computed(() =>
    products.value.map((p) => ({
      title: `${p.product_name ?? '—'}${p.sku ? ` (${p.sku})` : ''}`,
      value: p.id,
      cost: p.cost_price ?? 0,
      selling: p.selling_price ?? 0,
      unit: p.unit ?? '—',
    })))

  // Unit (Box/Bottle/Piece/…) is a property of the product master, same as
  // Purchasing's PR table — not something staff choose per order line.
  function unitFor(productId: number | null): string {
    return productOptions.value.find((o) => o.value === productId)?.unit ?? '—'
  }

  const validLines = computed(() => lines.value.filter((l) => l.product_id != null && l.qty > 0))
  const offerTotal = computed(() => lines.value.reduce((s, l) => s + l.qty * l.offer_unit, 0))
  const costTotal = computed(() => lines.value.reduce((s, l) => s + l.qty * l.cost_unit, 0))
  const profit = computed(() => offerTotal.value - costTotal.value)
  const marginPct = computed(() => offerTotal.value === 0 ? 0 : Math.round((profit.value / offerTotal.value) * 100))

  // Clear a stale govt PO # if the user switches to a customer that isn't govt/LGU.
  watch(isGovtCustomer, (govt) => { if (!govt) { govtPoNo.value = ''; poAmount.value = null } })

  function addLine() { lines.value.push({ product_id: null, qty: 1, offer_unit: 0, cost_unit: 0 }) }
  function removeLine(i: number) { lines.value.splice(i, 1) }

  // When a product is picked, prefill cost (snapshot) and a starting offer.
  function onProductChange(i: number) {
    const line = lines.value[i]
    const p = productOptions.value.find((o) => o.value === line.product_id)
    if (p) { line.cost_unit = p.cost; if (!line.offer_unit) line.offer_unit = p.selling }
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
    await customersStore.fetchCustomers({ activeOnly: true, department: 'inhouse' })
    if (!products.value.length) await productsStore.fetchProducts()
    // Restore a saved draft first; only seed an empty line if there's nothing to restore.
    if (!draft.restore() && !lines.value.length) addLine()
  }

  return {
    loading, customerId, govtPoNo, poAmount, remarks, lines,
    customerOptions, productOptions, isGovtCustomer,
    offerTotal, costTotal, profit, marginPct,
    addLine, removeLine, onProductChange, unitFor, submit, reset, init,
  }
}
