import { ref, computed } from 'vue'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useTransactionsDataStore } from '@/stores/transactionsData'
import { useTransactionItemsDataStore } from '@/stores/transactionsItemsData'
import { useProductsDataStore } from '@/stores/productsData'

export const unitOptions = ['Box', 'Pcs', 'Set', 'Unit', 'Kg', 'M']

type PRFormItem = {
  no: number
  unit: string
  item_description: string
  qty: number
  offer_per_unit: number
  cost_per_unit: number
}

export function usePurchaseRequisition() {
  const toast = useToast()
  const authStore = useAuthUserStore()
  const transactionsStore = useTransactionsDataStore()
  const transactionItemsStore = useTransactionItemsDataStore()
  const productsStore = useProductsDataStore()

  // ─── State ────────────────────────────────────────────────────────
  const loading = ref(false)

  const currentPR = ref({
    supplier_id: null as number | null,
    justification: '',
  })

  const items = ref<PRFormItem[]>([])

  // ─── Computed ─────────────────────────────────────────────────────
  const customerOfferTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.offer_per_unit, 0),
  )

  const companyCostTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0),
  )

  const profit = computed(() => customerOfferTotal.value - companyCostTotal.value)

  const isProfitable = computed(() => profit.value > 0)

  const offerCostRatio = computed(() => {
    if (companyCostTotal.value === 0) return '0.00'
    return (customerOfferTotal.value / companyCostTotal.value).toFixed(2)
  })

  const marginPercent = computed(() => {
    if (customerOfferTotal.value === 0) return '0'
    return Math.floor((profit.value / customerOfferTotal.value) * 100)
  })

  // ─── Actions ──────────────────────────────────────────────────────
  function addItem() {
    items.value.push({
      no: items.value.length + 1,
      unit: 'Box',
      item_description: '',
      qty: 0,
      offer_per_unit: 0,
      cost_per_unit: 0,
    })
  }

  function removeItem(index: number) {
    items.value.splice(index, 1)
    items.value.forEach((item, i) => (item.no = i + 1))
  }

  async function handleSubmit() {
    if (!currentPR.value.supplier_id) {
      toast.warning('Please select a supplier')
      return
    }

    loading.value = true

    try {
      const prNumber = `PR-${Date.now()}`

      // Build items summary for remarks
      const itemsSummary = items.value
        .map(item =>
          `#${item.no} ${item.item_description || '(no desc)'} — ${item.qty} ${item.unit} | Offer: ${item.offer_per_unit} | Cost: ${item.cost_per_unit}`
        )
        .join('\n')

      // Create a transaction with type = "requisition"
      const created = await transactionsStore.createTransaction({
        reference_no: prNumber,
        transaction_type: 'requisition',
        status: 'pending_approval',
        supplier_id: currentPR.value.supplier_id,
        total_amount: customerOfferTotal.value,
        remarks:
          `Justification: ${currentPR.value.justification || 'N/A'}\n\nItems:\n${itemsSummary}`,
        created_by: authStore.userData?.id ?? null,
        approved_by: null,
      })

      if (!created) {
        throw new Error('Failed to create requisition transaction')
      }

      // For each line item, insert a product and link via transaction_items
      for (const item of items.value) {
        if (!item.item_description.trim()) continue

        const newProduct = await productsStore.createProduct({
          product_name: item.item_description,
          item_decription: item.item_description,
          unit: unitOptions.indexOf(item.unit) + 1 || null,
          offer_per_unit: item.offer_per_unit || null,
          cost_per_unit: item.cost_per_unit || null,
          no: item.no,
          supplier_id: currentPR.value.supplier_id,
          status: 'pending',
        })

        if (!newProduct) {
          throw new Error(`Failed to create product for item #${item.no}`)
        }

        const tiCreated = await transactionItemsStore.createTransactionItem({
          transaction_id: created.id,
          product_id: newProduct.id,
        })

        if (!tiCreated) {
          throw new Error(`Failed to create transaction item for product ID ${newProduct.id}`)
        }
      }

      toast.success('Purchase requisition submitted for approval!')

      // Reset form
      currentPR.value = { supplier_id: null, justification: '' }
      items.value = []
      addItem()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit purchase requisition')
    } finally {
      loading.value = false
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────
  if (items.value.length === 0) addItem()

  return {
    currentPR,
    items,
    loading,
    customerOfferTotal,
    companyCostTotal,
    profit,
    isProfitable,
    offerCostRatio,
    marginPercent,
    addItem,
    removeItem,
    handleSubmit,
  }
}