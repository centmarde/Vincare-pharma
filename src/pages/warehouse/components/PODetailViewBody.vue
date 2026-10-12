<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import type { PR, PRItem } from '@/stores/purchaseRequisitionData'
import { useProductsDataStore } from '@/stores/productsData'
import { generateSku } from '@/utils/generativeHelpers'
import POHeader from './POHeader.vue'
import POAddresses from './POAddresses.vue'
import POItemsTable from './POItemsTable.vue'
import POItemsMobile from './POItemsMobile.vue'
import POSignatures from './POSignatures.vue'

// Orchestrator: holds the shared SKU store-loading/generation logic and
// composes the smaller PO sections. Ang expiry picker ug uban pang presentational
// blocks kay gi-extract na ngadto's individual components (see ./ExpiryDateField.vue,
// ./POHeader.vue, ./POAddresses.vue, ./POItemsTable.vue, ./POItemsMobile.vue,
// ./POSignatures.vue).
const props = defineProps<{
  po: PurchaseOrder | null
  pr: PR | null
  mobile: boolean
  skuEditMode?: boolean
  transactionItems: PRItem[]
  effectiveEmptyRows: number
}>()

const productsStore = useProductsDataStore()

const skuInputItemIds = ref<Record<number, boolean>>({})

function needsSkuInput(item: PRItem): boolean {
  return skuInputItemIds.value[item.id] === true
}

/**
 * Puno ang walay-SKU nga field og bag-ong generated SKU (max 8 digits, integers
 * lang) pinaagi sa generateSku() sa generativeHelpers. Gigamit sa click sa
 * append-inner icon sa right side sa SKU input (gipasa sa table/mobile components).
 */
function generateSkuFor(item: PRItem) {
  item.sku = generateSku()
}

/**
 * Looks up the SKU for each item directly by product_name (via the products
 * store) and fills each item's sku input with the matched product SKU — only
 * if the item doesn't already carry its own SKU, so the user's value/override
 * is kept.
 */
async function loadSkuValues() {
  const items = props.transactionItems
  const names = [...new Set(items.map((i) => (i.product_name || '').trim()).filter(Boolean))]

  if (names.length) {
    const skuByName = await productsStore.fetchSkusByProductNames(names)

    for (const item of items) {
      const key = (item.product_name || '').trim().toLowerCase()
      const matchedSku = key ? skuByName.get(key) ?? '' : ''
      // Populate the input directly, keeping any SKU the user typed/saved first.
      if (matchedSku && !item.sku?.toString().trim()) {
        item.sku = matchedSku
      }
    }
  }

  for (const item of items) {
    if (!item.sku?.toString().trim()) {
      skuInputItemIds.value[item.id] = true
    }
  }
}

function itemIdentityKey(): string {
  return props.transactionItems.map((item) => `${item.id}:${item.product_name ?? ''}`).join('|')
}

// Reload whenever the item rows change (e.g. the dialog opens with the PO/PR).
watch(
  [() => props.transactionItems, itemIdentityKey],
  () => loadSkuValues(),
  { immediate: true },
)
</script>

<template>
  <div>
    <POHeader :po="po" :pr="pr" :mobile="mobile" />

    <v-divider :class="mobile ? 'mb-3' : 'mb-6'" />

    <POAddresses :mobile="mobile" />

    <POItemsTable
      v-if="!mobile"
      :po="po"
      :sku-edit-mode="skuEditMode"
      :transaction-items="transactionItems"
      :effective-empty-rows="effectiveEmptyRows"
      :needs-sku-input="needsSkuInput"
      :on-generate-sku="generateSkuFor"
    />

    <POItemsMobile
      v-else
      :po="po"
      :sku-edit-mode="skuEditMode"
      :transaction-items="transactionItems"
      :needs-sku-input="needsSkuInput"
      :on-generate-sku="generateSkuFor"
    />

    <POSignatures :mobile="mobile" :pr="pr" />
  </div>
</template>
