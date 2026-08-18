<script setup lang="ts">
import { company } from '@/pages/purchasing/composables/usePODetailModal'
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import { formatCurrency, formatDatePO_Written } from '@/utils/helpers'
import type { PR, PRItem } from '@/stores/purchaseRequisitionData'
import { useProductsDataStore } from '@/stores/productsData'

const props = defineProps<{
  po: PurchaseOrder | null
  pr: PR | null
  mobile: boolean
  skuEditMode?: boolean
  transactionItems: PRItem[]
  effectiveEmptyRows: number
}>()

const productsStore = useProductsDataStore()

// Returns the existing SKU from the linked product record (if any) so it can
// be shown as the placeholder while editing the SKU input.
function productSkuFor(item: PRItem): string {
  if (item.product_id == null) return ''
  const product = productsStore.products.find((p) => p.id === item.product_id)
  const sku = product?.sku?.toString().trim() ?? ''
  console.log('[PODetailViewBody] Retrieved SKU for product', item.product_id, '=>', sku)
  return sku
}
</script>

<template>
  <div>
    <!-- Header -->
    <v-row class="mb-4" align="start">
      <v-col :cols="mobile ? 12 : undefined">
        <div class="d-flex align-center ga-3 mb-2">
          <v-img src="/vincare.png" :max-width="mobile ? 36 : 48" :max-height="mobile ? 36 : 48" contain />
          <div :class="mobile ? 'text-subtitle-1 font-weight-bold' : 'text-h6 font-weight-bold'">{{ company.name }}</div>
        </div>
        <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">{{ company.address }}</div>
        <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">Butuan City</div>
        <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">{{ company.contact }}</div>
        <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">{{ company.email }}</div>
      </v-col>

      <v-col :cols="mobile ? 12 : undefined" :class="mobile ? 'text-left' : 'text-right'">
        <div :class="mobile ? 'text-subtitle-1 font-weight-bold mb-1' : 'text-h6 font-weight-bold mb-2'">PURCHASE ORDER</div>
        <div :class="mobile ? 'text-caption' : 'text-body-2'">DATE: {{ formatDatePO_Written(po?.created_at ?? '—') }}</div>
        <div :class="mobile ? 'text-caption' : 'text-body-2'">PR #: {{ pr?.requisition_no ?? '—' }}</div>
        <div :class="mobile ? 'text-caption' : 'text-body-2'">
          PO #: <span class="font-weight-bold text-primary">{{ po?.reference_no }}</span>
        </div>
        <div v-if="po?.is_delivered" :class="mobile ? 'text-caption text-green font-weight-bold' : 'text-body-2 text-green font-weight-bold'">
          <v-icon start size="14">mdi-check-circle</v-icon> Delivered
        </div>
      </v-col>
    </v-row>

    <v-divider :class="mobile ? 'mb-3' : 'mb-6'" />

    <!-- Supplier / Ship To -->
    <v-row class="mb-4" align="stretch">
      <v-col :cols="mobile ? 12 : 6" class="d-flex flex-column">
        <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-1' : 'text-caption font-weight-bold text-medium-emphasis mb-2'">
          SUPPLIER
        </div>
        <v-card flat border rounded="lg" class="pa-3 flex-grow-1 d-flex align-center justify-center">
          <span class="text-body-2 text-medium-emphasis">—</span>
        </v-card>
      </v-col>

      <v-col :cols="mobile ? 12 : 6" class="d-flex flex-column">
        <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-1' : 'text-caption font-weight-bold text-medium-emphasis mb-2'">
          SHIP TO
        </div>
        <v-card flat border rounded="lg" class="pa-3 flex-grow-1">
          <div class="text-body-1 font-weight-medium mb-1">{{ company.name }}</div>
          <div class="text-body-2">{{ company.address }}</div>
          <div class="text-body-2">{{ company.contact }}</div>
          <div class="text-body-2">{{ company.email }}</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- ── Desktop: Items Table ─────────────────────────────── -->
    <v-table v-if="!mobile" density="compact" class="po-table mb-6 border rounded-lg">
      <thead>
        <tr class="bg-blue-darken-3">
          <th class="text-white">ITEM #</th>
          <th class="text-white">DESCRIPTION</th>
          <th class="text-white text-right">UNIT PRICE</th>
          <th class="text-white text-right">TOTAL</th>
          <th class="text-white text-center" style="width: 130px">ACTUAL COUNT</th>
          <th class="text-white text-center" style="width: 130px">SKU</th>
        </tr>
      </thead>

      <tbody>
        <tr v-if="transactionItems.length === 0">
          <td colspan="6" class="text-center pa-4">No items found.</td>
        </tr>

        <tr v-for="(item, index) in transactionItems" :key="item.id">
          <td>{{ index + 1 }}</td>
          <td>{{ item.item_description ?? '—' }}</td>
          <td class="text-right">{{ formatCurrency(item.cost_per_unit ?? 0) }}</td>
          <td class="text-right">
            {{ formatCurrency((item.qty ?? 0) * (item.cost_per_unit ?? 0)) }}
          </td>
          <td class="text-center" style="width: 130px">
            <v-text-field
              v-if="skuEditMode"
              v-model.number="item.actual_count_stock_in"
              type="number"
              density="compact"
              variant="outlined"
              hide-details
              min="1"
              class="input-number"
              style="width: 120px"
            />
            <span v-else>{{ item.actual_count_stock_in ?? '—' }}</span>
          </td>
          <td class="text-center" style="width: 130px">
            <v-text-field
              v-if="skuEditMode"
              v-model="item.sku"
              density="compact"
              variant="outlined"
              hide-details
              :placeholder="productSkuFor(item) || 'Enter SKU'"
              style="width: 120px"
            />
            <span v-else>{{ item.sku ?? '—' }}</span>
          </td>
        </tr>

        <tr v-for="n in effectiveEmptyRows" :key="`empty-${n}`">
          <td colspan="6">&nbsp;</td>
        </tr>
      </tbody>

      <tfoot>
        <tr class="bg-grey-lighten-3">
          <td colspan="5" class="text-right font-weight-bold">TOTAL</td>
          <td class="text-center font-weight-bold">
            {{ formatCurrency(po?.total_amount ?? 0) }}
          </td>
        </tr>
      </tfoot>
    </v-table>

    <!-- ── Mobile: Items as Cards ──────────────────────────── -->
    <div v-else class="mb-4">
      <div class="text-caption font-weight-bold text-medium-emphasis mb-2">ITEMS</div>
      <v-card
        v-for="(item, index) in transactionItems"
        :key="item.id"
        class="mb-2"
        variant="outlined"
        rounded="lg"
      >
        <v-card-text class="pa-3">
          <!-- Item header -->
          <div class="d-flex align-center ga-2 mb-2">
            <span class="text-caption font-weight-bold text-primary">#{{ index + 1 }}</span>
            <span class="text-body-2 font-weight-medium">{{ item.item_description ?? '—' }}</span>
          </div>

          <v-divider class="mb-2" />

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
            <div class="flex-1 pa-2 rounded-lg bg-grey-lighten-4">
              <div class="text-caption text-medium-emphasis">Price</div>
              <div class="text-caption font-weight-medium">{{ formatCurrency(item.cost_per_unit ?? 0) }}</div>
            </div>
            <div class="flex-1 pa-2 rounded-lg bg-grey-lighten-4">
              <div class="text-caption text-medium-emphasis">Total</div>
              <div class="text-caption font-weight-medium">
                {{ formatCurrency((item.qty ?? 0) * (item.cost_per_unit ?? 0)) }}
              </div>
            </div>
          </div>

          <!-- Actual count + SKU inputs (always visible when in edit mode) -->
          <div v-if="skuEditMode" class="d-flex ga-3">
            <div style="flex: 1; min-width: 0;">
              <div class="text-caption text-medium-emphasis mb-1">Actual count</div>
              <v-text-field
                v-model.number="item.actual_count_stock_in"
                type="number"
                density="compact"
                variant="outlined"
                hide-details
                min="1"
                style="width: 100%"
              />
            </div>
            <div style="flex: 1; min-width: 0;">
              <div class="text-caption text-medium-emphasis mb-1">SKU</div>
              <v-text-field
                v-model="item.sku"
                density="compact"
                variant="outlined"
                hide-details
                :placeholder="productSkuFor(item) || 'SKU'"
                style="width: 100%"
              />
            </div>
          </div>
          <!-- Read-only display -->
          <div v-else class="d-flex ga-3 text-caption">
            <div>
              <span class="text-medium-emphasis">Actual: </span>
              <span class="font-weight-medium">{{ item.actual_count_stock_in ?? '—' }}</span>
            </div>
            <div>
              <span class="text-medium-emphasis">SKU: </span>
              <span class="font-weight-medium">{{ item.sku ?? '—' }}</span>
            </div>
          </div>
        </v-card-text>
      </v-card>
      <v-card variant="outlined" rounded="lg" class="bg-grey-lighten-3">
        <v-card-text class="pa-3 d-flex justify-space-between text-caption font-weight-bold">
          <span>TOTAL</span>
          <span>{{ formatCurrency(po?.total_amount ?? 0) }}</span>
        </v-card-text>
      </v-card>
    </div>

    <!-- Signatures -->
    <v-row class="mb-6">
      <v-col :cols="mobile ? 6 : 6" class="d-flex flex-column align-center text-center">
        <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-3' : 'text-caption font-weight-bold text-medium-emphasis mb-6'">REQUESTED BY:</div>
        <div :class="mobile ? 'text-caption font-weight-medium' : 'text-body-2 font-weight-medium'">{{ pr?.requester_name }}</div>
        <v-divider :style="mobile ? 'width: 120px' : 'width: 200px'" class="mb-1" />
        <div class="text-caption text-medium-emphasis">REQUESTER</div>
      </v-col>
      <v-col :cols="mobile ? 6 : 6" class="d-flex flex-column align-center text-center">
        <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-3' : 'text-caption font-weight-bold text-medium-emphasis mb-6'">APPROVED BY:</div>
        <div :class="mobile ? 'text-caption font-weight-medium' : 'text-body-2 font-weight-medium'">{{ pr?.reviewer_name }}</div>
        <v-divider :style="mobile ? 'width: 120px' : 'width: 200px'" class="mb-1" />
        <div class="text-caption text-medium-emphasis">APPROVER</div>
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
.po-table {
  table-layout: fixed;
}
.po-table th {
  height: 38px !important;
}
.po-table th:nth-child(5),
.po-table th:nth-child(6) {
  width: 130px;
}
.input-number :deep(input[type="number"]) {
  -moz-appearance: textfield;
  appearance: textfield;
}
.input-number :deep(input[type="number"]::-webkit-outer-spin-button),
.input-number :deep(input[type="number"]::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}
</style>