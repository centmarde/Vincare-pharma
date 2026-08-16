import { ref, computed, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import type { PR } from '@/stores/purchaseRequisitionData'
import { useProductsDataStore } from '@/stores/productsData'
import { useWarehousesDataStore } from '@/stores/warehouseData'
import { useWarehouseProductsDataStore } from '@/stores/warehouseProductsData'
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
  const warehousesStore = useWarehousesDataStore()
  const warehouseProductsStore = useWarehouseProductsDataStore()
  const toast = useToast()

  const savingAll = ref(false)

  const transactionItems = computed(() => props.pr?.items ?? [])
  const effectiveEmptyRows = computed(() => Math.max(0, 7 - transactionItems.value.length))
  const warehouses = computed(() => warehousesStore.warehouses)

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

  const missingWarehouseCount = computed(
    () =>
      transactionItems.value.filter((item) => {
        const wid = item.warehouse_id
        return wid == null || Number(wid) <= 0
      }).length,
  )

  onMounted(async () => {
    await warehousesStore.fetchWarehouses()
  })

  async function saveAllItems(): Promise<boolean> {
    const validItems = transactionItems.value.filter(
      (item) =>
        item.product_id &&
        item.sku?.toString().trim() &&
        Number(item.actual_count_stock_in) > 0 &&
        item.warehouse_id != null &&
        Number(item.warehouse_id) > 0,
    )

    if (!validItems.length) return true

    savingAll.value = true
    try {
      // 1. Update product SKU and count
      const updates = validItems.map((item) => ({
        transaction_item_id: item.id,
        product_id: item.product_id!,
        sku: item.sku!.toString().trim(),
        actual_count_stock_in: Number(item.actual_count_stock_in),
      }))

      const skuSuccess = await productsStore.updateProductSkuAndCount(updates)
      if (!skuSuccess) {
        toast.error('Failed saving product information.')
        return false
      }

      // 2. Create/update warehouse product records for stock tracking
      for (const item of validItems) {
        const productId = item.product_id!
        const warehouseId = Number(item.warehouse_id)
        const qty = Number(item.actual_count_stock_in)

        // Check if a warehouse_product record already exists
        const existing = await warehouseProductsStore.fetchWarehouseProductByProductAndWarehouse(
          productId,
          warehouseId,
        )

        if (existing) {
          // Update: add the new qty to existing total_qty
          const updated = await warehouseProductsStore.updateWarehouseProduct(existing.id, {
            total_qty: (existing.total_qty ?? 0) + qty,
          })
          if (!updated) {
            toast.error(`Failed updating warehouse stock for ${item.item_description}.`)
            return false
          }
        } else {
          // Create a new warehouse_product record
          const created = await warehouseProductsStore.createWarehouseProduct({
            product_id: productId,
            warehouse_id: warehouseId,
            total_qty: qty,
            notes: `Initial stock from PO ${props.po?.reference_no ?? ''}`,
          })
          if (!created) {
            toast.error(`Failed creating warehouse stock for ${item.item_description}.`)
            return false
          }
        }
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
    if (missingWarehouseCount.value > 0) {
      toast.error(`Please select warehouse for all ${missingWarehouseCount.value} item(s).`)
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
    warehouses,
    missingSkuCount,
    missingActualCount,
    missingWarehouseCount,
    handleMarkAsReceived,
  }
}