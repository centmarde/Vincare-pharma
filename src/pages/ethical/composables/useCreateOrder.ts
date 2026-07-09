import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useEthicalDataStore } from '@/stores/ethicalData'
import { useCustomersDataStore } from '@/stores/customersData'
import { useProductsDataStore } from '@/stores/productsData'
import { useAgentsDataStore } from '@/stores/agentsData'
import { useOutletsDataStore } from '@/stores/outletsData'

const toast = useToast()

type FormLine = {
  product_id: number | null
  quantity: number
  unit_price: number
}

export function useCreateOrder(onCreated: () => void) {
  const ethical = useEthicalDataStore()
  const customersStore = useCustomersDataStore()
  const productsStore = useProductsDataStore()
  const agentsStore = useAgentsDataStore()
  const outletsStore = useOutletsDataStore()

  const { customers } = storeToRefs(customersStore)
  const { products } = storeToRefs(productsStore)
  const { agents } = storeToRefs(agentsStore)
  const { outlets } = storeToRefs(outletsStore)

  const loading = ref(false)
  const customerId = ref<number | null>(null)
  const agentId = ref<number | null>(null)
  const outletId = ref<number | null>(null)
  const discount = ref(0)
  const rebate = ref(0)
  const termsDays = ref(0)
  const remarks = ref('')
  const lines = ref<FormLine[]>([])

  const customerOptions = computed(() =>
    customers.value
      .filter(c => c.department === 'ethical')
      .map(c => ({ title: `${c.name}${c.agency_type ? ` (${c.agency_type})` : ''}`, value: c.id, agent: c.agent_id })))

  const agentOptions = computed(() =>
    agents.value.map(a => ({ title: a.name, value: a.id })))

  const outletOptions = computed(() =>
    outlets.value.filter(o => o.channel === 'ethical' && o.is_active).map(o => ({ title: o.name, value: o.id })))

  const productOptions = computed(() =>
    products.value.map(p => ({
      title: `${p.product_name ?? '—'}${p.sku ? ` (${p.sku})` : ''}`,
      value: p.id,
      selling: p.selling_price ?? 0,
      unit: p.unit ?? '—',
    })))

  // Unit (Box/Bottle/Piece/…) is a property of the product master, same as
  // Purchasing's PR table and In-House's Raise Order dialog.
  function unitFor(productId: number | null): string {
    return productOptions.value.find(o => o.value === productId)?.unit ?? '—'
  }

  const validLines = computed(() => lines.value.filter(l => l.product_id != null && l.quantity > 0))
  const subtotal = computed(() => lines.value.reduce((s, l) => s + l.quantity * l.unit_price, 0))
  const totalWithDiscount = computed(() => subtotal.value - discount.value - rebate.value)

  function addLine() { lines.value.push({ product_id: null, quantity: 1, unit_price: 0 }) }
  function removeLine(i: number) { lines.value.splice(i, 1) }

  function onProductChange(i: number) {
    const line = lines.value[i]
    const p = productOptions.value.find(o => o.value === line.product_id)
    if (p) { line.unit_price = p.selling }
  }

  function onCustomerChange() {
    const c = customerOptions.value.find(o => o.value === customerId.value)
    if (c && c.agent) agentId.value = c.agent
  }

  async function submit() {
    if (!customerId.value) { toast.warning('Select a customer.'); return }
    if (!outletId.value) { toast.warning('Select a branch.'); return }
    if (!validLines.value.length) { toast.warning('Add at least one product with quantity.'); return }

    loading.value = true
    const result = await ethical.createOrder({
      customerId: customerId.value,
      agentId: agentId.value,
      outletId: outletId.value,
      discount: discount.value || undefined,
      rebate: rebate.value || undefined,
      termsDays: termsDays.value || undefined,
      remarks: remarks.value || undefined,
      lines: validLines.value.map(l => ({
        product_id: l.product_id!,
        quantity: l.quantity,
        unit_price: l.unit_price,
      })),
    })
    loading.value = false
    if (result.success) { reset(); onCreated() }
  }

  function reset() {
    customerId.value = null
    agentId.value = null
    outletId.value = null
    discount.value = 0
    rebate.value = 0
    termsDays.value = 0
    remarks.value = ''
    lines.value = []
    addLine()
  }

  async function init() {
    await customersStore.fetchCustomers({ department: 'ethical', activeOnly: true })
    if (!agents.value.length) await agentsStore.fetchAgents({ activeOnly: true })
    if (!products.value.length) await productsStore.fetchProducts()
    if (!outlets.value.length) await outletsStore.fetchOutlets()
    if (!outletId.value) outletId.value = outletOptions.value[0]?.value ?? null
    if (!lines.value.length) addLine()
  }

  return {
    loading, customerId, agentId, outletId, discount, rebate, termsDays, remarks, lines,
    customerOptions, agentOptions, outletOptions, productOptions, subtotal, totalWithDiscount,
    addLine, removeLine, onProductChange, onCustomerChange, unitFor, submit, reset, init,
  }
}
