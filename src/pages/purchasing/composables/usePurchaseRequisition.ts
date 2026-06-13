import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisition'
import { useSuppliersDataStore } from '@/stores/suppliersDataStore'

// Re-export for convenience
export { formatCurrency } from '@/utils/helpers'

export const unitOptions = ['Box', 'Pcs', 'Set', 'Unit', 'Kg', 'M']

export function usePurchaseRequisition() {
  const supplierStore = useSuppliersDataStore()
  const { activeSuppliers } = storeToRefs(supplierStore)

  const store = usePurchaseRequisitionStore()
  const {
    currentPR,
    items,
    loading,
    customerOfferTotal,
    companyCostTotal,
    profit,
    isProfitable,
    offerCostRatio,
    marginPercent,
  } = storeToRefs(store)

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
    await store.savePurchaseRequisition()
  }

  // ─── Init ─────────────────────────────────────────────────────────
  if (items.value.length === 0) addItem()

  onMounted(() => supplierStore.fetchSuppliers({ activeOnly: true }))

  return {
    // store refs
    activeSuppliers,
    currentPR,
    items,
    loading,
    customerOfferTotal,
    companyCostTotal,
    profit,
    isProfitable,
    offerCostRatio,
    marginPercent,
    // actions
    addItem,
    removeItem,
    handleSubmit,
  }
}