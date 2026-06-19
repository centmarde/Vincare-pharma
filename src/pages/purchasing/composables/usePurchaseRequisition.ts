import { ref, computed } from 'vue'
import { useToast } from 'vue-toastification'
import { useTransactionsDataStore } from '@/stores/transactionsData'

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
  const prStore = useTransactionsDataStore()

  // ─── State ────────────────────────────────────────────────────────
  const loading = ref(false)

  const currentPR = ref({
    supplier_id:  null as number | null,
    remarks:      '',
  })

  const items = ref<PRFormItem[]>([])

  // ─── Computed ─────────────────────────────────────────────────────
  const customerOfferTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.offer_per_unit, 0)
  )

  const companyCostTotal = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)
  )

  const profit        = computed(() => customerOfferTotal.value - companyCostTotal.value)
  const isProfitable  = computed(() => profit.value > 0)

  const offerCostRatio = computed(() =>
    companyCostTotal.value === 0
      ? '0.00'
      : (customerOfferTotal.value / companyCostTotal.value).toFixed(2)
  )

  const marginPercent = computed(() =>
    customerOfferTotal.value === 0
      ? '0'
      : Math.floor((profit.value / customerOfferTotal.value) * 100)
  )

  // ─── Item Actions ─────────────────────────────────────────────────
  function addItem() {
    items.value.push({
      no:               items.value.length + 1,
      unit:             'Box',
      item_description: '',
      qty:              0,
      offer_per_unit:   0,
      cost_per_unit:    0,
    })
  }

  function removeItem(index: number) {
    items.value.splice(index, 1)
    items.value.forEach((item, i) => (item.no = i + 1))
  }

  // ─── Submit ───────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!currentPR.value.supplier_id) {
      toast.warning('Please select a supplier.')
      return
    }

    const validItems = items.value.filter(i => i.item_description.trim())
    if (!validItems.length) {
      toast.warning('Please add at least one item.')
      return
    }

    loading.value = true

    // Sync to store state so savePurchaseRequisition can read it
    prStore.currentPR.supplier_id = String(currentPR.value.supplier_id)
    prStore.currentPR.remarks     = currentPR.value.remarks || null
    prStore.items                 = validItems

    const result = await prStore.savePurchaseRequisition()

    if (result?.success) {
      reset()
    }

    loading.value = false
  }

  // ─── Reset ────────────────────────────────────────────────────────
  function reset() {
    currentPR.value = { supplier_id: null, remarks: '' }
    items.value     = []
    addItem()
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