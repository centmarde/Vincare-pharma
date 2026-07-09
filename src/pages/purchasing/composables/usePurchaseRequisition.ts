import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import { useLogRequisition } from './useLogRequisition'
import { useToast } from 'vue-toastification'
import { ref, computed } from 'vue'
import { useFormDraft } from '@/composables/useFormDraft'

export const unitOptions = ['Box', 'Pcs', 'Set', 'Unit', 'Kg', 'M']

type PRFormItem = {
  no: number
  unit: string
  item_description: string
  supplier_id: number | null
  qty: number
  offer_per_unit: number
  cost_per_unit: number
  expiry_date: Date | null
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

  // Persist a draft so a reload / crash mid-entry doesn't wipe the requisition.
  // expiry_date is a Date; JSON stores it as an ISO string, so revive it on
  // restore or the datepicker's .getFullYear()/.getMonth() calls would crash.
  const draft = useFormDraft({
    key: 'purchasing-requisition',
    version: 1,
    refs: { currentPR, items },
    isEmpty: () => !currentPR.value.remarks
      && !items.value.some((i) => i.item_description.trim() || i.supplier_id != null
        || i.qty > 0 || i.offer_per_unit > 0 || i.cost_per_unit > 0 || i.expiry_date != null),
    deserialize: (data) => ({
      ...data,
      items: Array.isArray(data.items)
        ? (data.items as PRFormItem[]).map((i) => ({
            ...i,
            expiry_date: i.expiry_date ? new Date(i.expiry_date as unknown as string) : null,
          }))
        : data.items,
    }),
  })

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
      supplier_id:      null,
      expiry_date:      null,
    })
  }

  function removeItem(index: number) {
    items.value.splice(index, 1)
    items.value.forEach((item, i) => (item.no = i + 1))
  }

  // ─── Submit ───────────────────────────────────────────────────────
  async function handleSubmit(): Promise<boolean> {

    const validItems = items.value.filter(i => i.item_description.trim())
    if (!validItems.length) {
      toast.warning('Please add at least one item.')
      return false
    }

    const rules: { check: (i: typeof validItems[number]) => boolean; message: string }[] = [
      { check: i => !i.item_description.trim(), message: 'description' },
      { check: i => !i.supplier_id, message: 'supplier' },
      { check: i => !i.expiry_date, message: 'expiry date' },
      { check: i => i.qty <= 0, message: 'quantity greater than zero' },
      { check: i => i.offer_per_unit <= 0, message: 'offer per unit greater than zero' },
      { check: i => i.cost_per_unit <= 0, message: 'cost per unit greater than zero' },
    ]

    const failedMessages = rules
      .filter(rule => validItems.some(rule.check))
      .map(rule => rule.message)

    if (failedMessages.length) {
      toast.info(`Please provide ${failedMessages.join(', ')} for each item.`)
      return false
    }

    loading.value = true

    // Sync to store state so savePurchaseRequisition can read it
    prStore.currentPR.remarks     = currentPR.value.remarks || null
    prStore.currentPR.supplier_id = null
    prStore.items                 = validItems.map(i => ({
      ...i,
      supplier_id: i.supplier_id != null ? String(i.supplier_id) : null,
      expiry_date: i.expiry_date ? i.expiry_date.toISOString().slice(0, 10) : null,
    }))

    const result = await prStore.savePurchaseRequisition()

    loading.value = false

    if (result?.success && result.transactionId && result.requisitionNo) {
      // Log the PR submission to the logs table with module = transaction_type
      await logPRSubmission(
        result.transactionId,
        result.requisitionNo,
        'purchase_requisition',
        validItems.length,
      )
      draft.clear()
      reset()
      return true
    }

    return false
  }

  // ─── Reset ────────────────────────────────────────────────────────
  function reset() {
    currentPR.value = { remarks: '' }
    items.value     = []
    addItem()
  }

  // ─── Init ─────────────────────────────────────────────────────────
  // Restore a saved draft first; only seed an empty row if there's nothing to restore.
  if (!draft.restore() && items.value.length === 0) addItem()

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
    reset,
  }
}