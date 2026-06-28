import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import { useLogRequisition } from './useLogRequisition'
import { useToast } from 'vue-toastification'
import { ref, computed } from 'vue'

export const unitOptions = ['Box', 'Pcs', 'Set', 'Unit', 'Kg', 'M']

type PRFormItem = {
  no: number
  unit: string
  item_description: string
  supplier_id: string | null
  qty: number
  offer_per_unit: number
  cost_per_unit: number
}

export function usePurchaseRequisition() {
  const toast = useToast()
  const prStore = usePurchaseRequisitionStore()
  const { logPRSubmission } = useLogRequisition()

  // ─── State ────────────────────────────────────────────────────────
  const loading = ref(false)

  const currentPR = ref({
    remarks: '',
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
      supplier_id:      null ,
    })
  }

  function removeItem(index: number) {
    items.value.splice(index, 1)
    items.value.forEach((item, i) => (item.no = i + 1))
  }

  // ─── Submit ───────────────────────────────────────────────────────
  async function handleSubmit() {

    const validItems = items.value.filter(i => i.item_description.trim())
    if (!validItems.length) {
      toast.warning('Please add at least one item.')
      return
    }
    
    const missingSupplier = validItems.some(i => !i.supplier_id)
    if (missingSupplier) {
      toast.warning('Please select a supplier for each item.')
      return
    }

    loading.value = true

    // Sync to store state so savePurchaseRequisition can read it
    prStore.currentPR.remarks     = currentPR.value.remarks || null
    prStore.currentPR.supplier_id = null
    prStore.items                 = validItems

    const result = await prStore.savePurchaseRequisition()

    if (result?.success && result.transactionId && result.requisitionNo) {
      // Log the PR submission to the logs table with module = transaction_type
      await logPRSubmission(
        result.transactionId,
        result.requisitionNo,
        'purchase_requisition',
        validItems.length,
      )
      reset()
    }

    loading.value = false
  }

  // ─── Reset ────────────────────────────────────────────────────────
  function reset() {
    currentPR.value = { remarks: '' }
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