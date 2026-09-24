<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ProductType } from '@/stores/productsData'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { formatMonthYear } from '@/utils/helpers'
import DisposeProductDialog from './DisposeProductDialog.vue'

const disposableStockBuckets = ['expired', 'expiring-soon', 'low-stock']

const props = defineProps<{
  modelValue: boolean
  products: ProductType[]
  activeCard: { icon: string; color: string; label: string } | null | undefined
  stockDialogType: string
  isPurchaser: boolean
  canDispose: boolean
  disposalRequestInfo: Map<number, { id: number; status: string }>
  selectedReorderProductIds: number[]
  reorderRequestInfo: Map<number, { id: number; status: string }>
  canRequestReorder: (productId: number) => boolean
  reorderReasonMap: Record<string, string>
  searchQuery: string
  page: number
  itemsPerPage: number
  total: number
  loading: boolean
  totalPages: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:searchQuery': [value: string]
  'update:page': [value: number]
  'search': []
  'edit-product': [product: ProductType]
  'toggle-reorder': [productId: number, checked: boolean]
  'request-reorder': [product: ProductType]
  'request-disposal': [payload: { product: ProductType; qty: number; reason: string }]
  'create-pr': []
}>()

const { confirmDialog } = useConfirmDialog()

const hasSearch = computed(() => props.searchQuery.trim().length > 0)

// Dispose dialog state
const disposeTarget = ref<ProductType | null>(null)
const showDisposeDialog = ref(false)

const isDisposableBucket = computed(() =>
  disposableStockBuckets.includes(props.stockDialogType),
)

function disposalStatus(productId: number): string | null {
  return props.disposalRequestInfo.get(productId)?.status ?? null
}

function canDisposeProduct(product: ProductType): boolean {
  if (!props.canDispose || !isDisposableBucket.value) return false
  if ((product.current_stock ?? 0) <= 0) return false
  return disposalStatus(product.id) !== 'pending'
}

function openDisposeDialog(product: ProductType) {
  disposeTarget.value = product
  showDisposeDialog.value = true
}

function handleDisposeConfirm(payload: { product: ProductType; qty: number; reason: string }) {
  emit('request-disposal', payload)
  showDisposeDialog.value = false
  disposeTarget.value = null
}

async function confirmCreatePRFromSelection() {
  if (!props.selectedReorderProductIds.length) return

  const selectedProducts = props.products.filter(p => props.selectedReorderProductIds.includes(p.id))
  const productNames = selectedProducts.map(p => `  \u2022 ${p.product_name}`).join('\n')

  const confirmed = await confirmDialog(
    `You're about to flag **${props.selectedReorderProductIds.length}** product(s) for reorder and start a new Purchase Requisition:\n\n${productNames}`,
    {
      title: 'Confirm Reorder Selection',
      confirmText: 'Continue',
      cancelText: 'Cancel',
    },
  )

  if (confirmed) {
    emit('create-pr')
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="600"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center pa-4">
        <v-icon
          :icon="activeCard?.icon"
          :color="activeCard?.color"
          class="mr-2"
          size="28"
        ></v-icon>
        <span class="text-h6 font-weight-bold">{{ activeCard?.label }}</span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)"></v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text class="pa-0" style="max-height: 400px; overflow-y: auto;">
        <div class="d-flex align-center ga-2 pa-3 pb-0">
          <v-text-field
            :model-value="searchQuery"
            density="compact"
            variant="outlined"
            placeholder="Search product name..."
            prepend-inner-icon="mdi-magnify"
            clearable
            hide-details
            single-line
            @update:model-value="emit('update:searchQuery', $event)"
            @keyup.enter="emit('search')"
            @click:clear="emit('search')"
          ></v-text-field>
          <v-btn
            color="primary"
            variant="tonal"
            class="text-none"
            prepend-icon="mdi-magnify"
            @click="emit('search')"
          >
            Search
          </v-btn>
        </div>
        <v-list v-if="products.length > 0" density="comfortable">
          <v-list-item
            v-for="p in products"
            :key="p.id"
          >
            <template #prepend>
              <v-checkbox-btn
                v-if="isPurchaser && stockDialogType !== 'no-reorder-level' && canRequestReorder(p.id)"
                :model-value="selectedReorderProductIds.includes(p.id)"
                @click.stop
                @update:model-value="(val) => emit('toggle-reorder', p.id, !!val)"
              />
            </template>
            <v-list-item-title class="font-weight-medium">
              {{ p.product_name }}
              <v-tooltip activator="parent" location="top">
                {{ p.product_name || '' }}
              </v-tooltip>
            </v-list-item-title>
            <v-list-item-subtitle>
              <template v-if="stockDialogType === 'out-of-stock' || stockDialogType === 'low-stock'">
                Stock: {{ p.current_stock ?? 0 }}
                <span v-if="p.reorder_level != null"> · reorder at {{ p.reorder_level }}</span>
              </template>
              <template v-else-if="stockDialogType === 'no-reorder-level'">
                Current stock: {{ p.current_stock ?? 0 }} units
              </template>
              <template v-else-if="stockDialogType === 'expiring-soon' || stockDialogType === 'expired'">
                Expiry: {{ p.expiry_date ? formatMonthYear(p.expiry_date) : 'N/A' }}
                <span class="text-grey">· Stock: {{ p.current_stock ?? 0 }}</span>
              </template>
            </v-list-item-subtitle>
            <v-list-item-subtitle class="text-caption text-grey">
              SKU: {{ p.sku || 'No SKU' }} · Batch: {{ p.batch_no || '—' }}
            </v-list-item-subtitle>
            <template #append>
              <div class="d-flex align-center ga-2">
                <!-- Dispose button -->
                <v-btn
                  v-if="canDisposeProduct(p)"
                  size="small"
                  variant="outlined"
                  color="error"
                  prepend-icon="mdi-delete-alert-outline"
                  class="text-none"
                  @click.stop="openDisposeDialog(p)"
                >
                  Dispose
                </v-btn>
                <v-chip
                  v-else-if="disposalStatus(p.id) === 'pending'"
                  size="small"
                  color="error"
                  variant="tonal"
                  class="font-weight-medium"
                >
                  <v-icon start size="14">mdi-delete-clock-outline</v-icon>
                  Disposal pending
                </v-chip>
                <v-chip
                  v-else-if="disposalStatus(p.id) === 'approved'"
                  size="small"
                  color="grey"
                  variant="tonal"
                  class="font-weight-medium"
                >
                  <v-icon start size="14">mdi-delete-off-outline</v-icon>
                  Disposed
                </v-chip>
                <v-btn
                  v-if="stockDialogType !== 'no-reorder-level' && canRequestReorder(p.id)"
                  size="small"
                  variant="outlined"
                  color="primary"
                  prepend-icon="mdi-cart-plus"
                  class="text-none"
                  @click.stop="emit('request-reorder', p)"
                >
                  Reorder
                </v-btn>
                <v-chip
                  v-if="reorderRequestInfo.get(p.id)?.status === 'pending'"
                  size="small"
                  color="green"
                  variant="tonal"
                  class="font-weight-medium"
                >
                  <v-icon start size="14">mdi-check-circle</v-icon>
                  Pending
                </v-chip>
                <v-chip
                  v-else-if="reorderRequestInfo.get(p.id)?.status === 'approved'"
                  size="small"
                  color="blue"
                  variant="tonal"
                  class="font-weight-medium"
                >
                  <v-icon start size="14">mdi-clipboard-check-outline</v-icon>
                  Approved
                </v-chip>
                <v-chip
                  v-else-if="reorderRequestInfo.get(p.id)?.status === 'awaiting_stock'"
                  size="small"
                  color="indigo"
                  variant="tonal"
                  class="font-weight-medium"
                >
                  <v-icon start size="14">mdi-truck-delivery-outline</v-icon>
                  Awaiting Stock
                </v-chip>
                <v-chip
                  v-else-if="reorderRequestInfo.get(p.id)?.status === 'rejected'"
                  size="small"
                  color="red"
                  variant="tonal"
                  class="font-weight-medium"
                >
                  <v-icon start size="14">mdi-close-circle-outline</v-icon>
                  Rejected
                </v-chip>
              </div>
            </template>
          </v-list-item>
        </v-list>
        <div v-else-if="!loading && total === 0" class="text-center py-8">
          <v-icon icon="mdi-check-circle-outline" size="40" color="success"></v-icon>
          <p class="text-grey mt-2">No products in this category</p>
        </div>
        <div v-else-if="!loading && hasSearch" class="text-center py-8">
          <v-icon icon="mdi-magnify-close" size="40" color="grey"></v-icon>
          <p class="text-grey mt-2">No products match your search</p>
        </div>
        <div v-else class="text-center py-8">
          <v-progress-circular indeterminate color="primary" size="40"></v-progress-circular>
          <p class="text-grey mt-2">Loading products...</p>
        </div>
        <v-divider v-if="isPurchaser && selectedReorderProductIds.length" />
        <v-card-actions
          v-if="isPurchaser && selectedReorderProductIds.length"
          class="pa-4 d-flex justify-end"
        >
          <v-btn
            color="primary"
            class="text-none font-weight-bold"
            prepend-icon="mdi-file-document-edit-outline"
            @click="confirmCreatePRFromSelection"
          >
            Create Purchase Requisition ({{ selectedReorderProductIds.length }})
          </v-btn>
        </v-card-actions>
        <v-divider v-if="total > 0" />
        <div v-if="total > 0" class="d-flex align-center justify-space-between pa-3">
          <span class="text-caption text-grey">
            {{ total }} product{{ total !== 1 ? 's' : '' }}
          </span>
          <v-pagination
            :model-value="page"
            :length="totalPages"
            :total-visible="5"
            density="compact"
            size="small"
            @update:model-value="(val) => emit('update:page', val)"
          ></v-pagination>
        </div>
      </v-card-text>
    </v-card>
    <DisposeProductDialog
      v-model="showDisposeDialog"
      :product="disposeTarget"
      @confirm="handleDisposeConfirm"
    />
  </v-dialog>
</template>

<style scoped></style>
