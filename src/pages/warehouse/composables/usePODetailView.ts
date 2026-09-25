import { ref, computed } from 'vue'
import { useToast } from 'vue-toastification'
import type { PR, PRItem } from '@/stores/purchaseRequisitionData'
import { useProductsDataStore } from '@/stores/productsData'
import type { SkuConflict } from '@/stores/productsData'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
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
  const { confirmDialog } = useConfirmDialog()

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

  const missingBatchNoCount = computed(
    () => transactionItems.value.filter((item) => !item.batch_no?.toString().trim()).length,
  )

  async function saveAllItems(receivingItems: PRItem[]): Promise<boolean> {
    const validItems = receivingItems.filter(
      (item) =>
        item.product_id &&
        item.sku?.toString().trim() &&
        item.batch_no?.toString().trim() &&
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
        batch_no: item.batch_no ?? null,
        cost_price: item.cost_per_unit ?? null,
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

  function describeSkuConflict(conflict: SkuConflict): string {
    if (conflict.inThisReceipt) {
      return `• SKU "${conflict.sku}" is entered for both ${conflict.receivingProduct} and ${conflict.existingProduct} in this delivery.`
    }
    return `• SKU "${conflict.sku}" on ${conflict.receivingProduct} is already used by ${conflict.existingProduct}.`
  }

  async function confirmDuplicateSkus(receivingItems: PRItem[]): Promise<boolean> {
    const skuItems = receivingItems
      .filter((item) => item.sku?.toString().trim())
      .map((item) => ({
        sku: item.sku!.toString().trim(),
        productName: item.product_name ?? '',
      }))

    const conflicts = await productsStore.findSkuConflicts(skuItems)
    if (conflicts === null) {
      toast.error('Could not check for duplicate SKUs. Please try again.')
      return false
    }
    if (!conflicts.length) return true

    const conflictLines = conflicts.map((conflict) => describeSkuConflict(conflict))

    return confirmDialog(
      `${conflictLines.join('\n')}\n\nThe SKU will still be saved. Continue receiving?`,
      { title: 'Duplicate SKU', confirmText: 'Save anyway', cancelText: 'Go back' },
    )
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
    if (missingBatchNoCount.value > 0) {
      toast.error(`Please fill in Batch No for all ${missingBatchNoCount.value} item(s).`)
      return
    }
    if (props.po?.id == null) {
      toast.error('No purchase order selected.')
      return
    }

    const receivingItems = transactionItems.value.map((item) => ({ ...item }))

    savingAll.value = true
    const confirmed = await confirmDuplicateSkus(receivingItems)
    savingAll.value = false
    if (!confirmed) {
      return
    }

    const saved = await saveAllItems(receivingItems)
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
    missingBatchNoCount,
    handleMarkAsReceived,
  }
}