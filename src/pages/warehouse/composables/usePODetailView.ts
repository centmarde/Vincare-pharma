import { ref, computed } from 'vue'
import { useToast } from 'vue-toastification'
import type { PR } from '@/stores/purchaseRequisitionData'
import { useProductsDataStore } from '@/stores/productsData'
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'

type PODetailEmits = {
  (e: 'update:modelValue', value: boolean): void
  (e: 'mark-received', poId: number): void
}

/**
 * Business logic for the SKU / "mark as received" PO detail modal.
 * Extracted from PODetailViewModal.vue so the view stays thin.
 */
export function usePODetailView(
  props: { po: PurchaseOrder | null; pr: PR | null },
  emit: PODetailEmits,
) {
  const productsStore = useProductsDataStore()
  const toast = useToast()

  const savingAll = ref(false)

  const transactionItems = computed(() => props.pr?.items ?? [])
  const effectiveEmptyRows = computed(() => Math.max(0, 7 - transactionItems.value.length))

  const missingSkuCount = computed(
    () => transactionItems.value.filter((item) => !item.sku?.toString().trim()).length,
  )

  const missingActualCount = computed(
    () =>
      transactionItems.value.filter((item) => {
        const value = item.actual_count_stock_in

        return value == null || Number(value) <= 0
      }).length,
  )

  async function saveAllItems(): Promise<boolean> {
    const validItems = transactionItems.value.filter(
      (item) =>
        item.product_id &&
        item.sku?.toString().trim() &&
        Number(item.actual_count_stock_in) > 0,
    )

    if (!validItems.length) return true

    savingAll.value = true
    try {
      // Update product SKU and count
      const updates = validItems.map((item) => ({
        transaction_item_id: item.id,
        product_id: item.product_id!,
        sku: item.sku!.toString().trim(),
        actual_count_stock_in: Number(item.actual_count_stock_in),
        expiry_date: item.expiry_date ?? null,
      }))

      const skuSuccess = await productsStore.updateProductSkuAndCount(updates)
      if (!skuSuccess) {
        toast.error('Failed saving product information.')
        return false
      }

      return true
    } finally {
      savingAll.value = false
    }
  }

  async function handleMarkAsReceived() {
    if (missingSkuCount.value > 0) {
      toast.error(`Please fill in SKU for all ${missingSkuCount.value} item(s).`)
      return
    }
    if (missingActualCount.value > 0) {
      toast.error(`Please fill in Actual Count for all ${missingActualCount.value} item(s).`)
      return
    }
    if (props.po?.id == null) {
      toast.error('No purchase order selected.')
      return
    }
    const saved = await saveAllItems()
    if (!saved) {
      return
    }
    toast.success('All items saved successfully.')
    emit('mark-received', props.po.id)
  }

  return {
    savingAll,
    transactionItems,
    effectiveEmptyRows,
    missingSkuCount,
    missingActualCount,
    handleMarkAsReceived,
  }
}