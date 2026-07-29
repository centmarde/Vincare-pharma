<script setup lang="ts">
import { computed } from 'vue'
import type { ProductType } from '@/stores/productsData'
import { useProductIgnore, IGNORE_DURATIONS } from '@/components/products/composables/useProductIgnore'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { formatMonthYear } from '@/utils/helpers'

const props = defineProps<{
  modelValue: boolean
  products: ProductType[]
  activeCard: { icon: string; color: string; label: string } | null | undefined
  stockDialogType: string
  isPurchaser: boolean
  selectedReorderProductIds: number[]
  reorderRequestInfo: Map<number, { id: number; status: string }>
  canRequestReorder: (productId: number) => boolean
  reorderReasonMap: Record<string, string>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'edit-product': [product: ProductType]
  'toggle-reorder': [productId: number, checked: boolean]
  'request-reorder': [product: ProductType]
  'create-pr': []
}>()

const productIgnore = useProductIgnore()
const { confirmDialog } = useConfirmDialog()

async function confirmCreatePRFromSelection() {
  if (!props.selectedReorderProductIds.length) return

  const selectedProducts = props.products.filter(p => props.selectedReorderProductIds.includes(p.id))
  const productNames = selectedProducts.map(p => `  • ${p.product_name}`).join('\n')

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
        <v-list v-if="products.length > 0" density="comfortable">
          <v-list-item
            v-for="p in products"
            :key="p.id"
            @click="emit('edit-product', p); emit('update:modelValue', false)"
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
              </template>
            </v-list-item-subtitle>
            <template #append>
              <div class="d-flex align-center ga-2">
                <v-chip size="small" variant="outlined">{{ p.sku || 'No SKU' }}</v-chip>
                <!-- Ignore / Dismiss button -->
                <v-menu location="bottom" offset-y>
                  <template #activator="{ props: menuProps }">
                    <v-btn
                      v-bind="menuProps"
                      size="small"
                      variant="outlined"
                      color="blue"
                      @click.stop
                      class="ignore-btn"
                    >
                      <v-icon size="16">mdi-bell-off-outline</v-icon>
                      <v-tooltip activator="parent" location="top">Ignore this product item</v-tooltip>
                    </v-btn>
                  </template>
                  <v-list density="compact" min-width="200">
                    <template v-if="!productIgnore.isIgnored(p.id)">
                      <v-list-item
                        @click.stop="productIgnore.confirmIgnore(p.id, p.product_name ?? '', IGNORE_DURATIONS.ONE_DAY, '1 day')"
                      >
                        <template #prepend>
                          <v-icon size="small">mdi-clock-outline</v-icon>
                        </template>
                        <v-list-item-title>Ignore for 1 day</v-list-item-title>
                      </v-list-item>
                      <v-list-item
                        @click.stop="productIgnore.confirmIgnore(p.id, p.product_name ?? '', IGNORE_DURATIONS.ONE_WEEK, '1 week')"
                      >
                        <template #prepend>
                          <v-icon size="small">mdi-calendar-week</v-icon>
                        </template>
                        <v-list-item-title>Ignore for 1 week</v-list-item-title>
                      </v-list-item>
                      <v-list-item
                        @click.stop="productIgnore.confirmIgnore(p.id, p.product_name ?? '', IGNORE_DURATIONS.ONE_MONTH, '1 month')"
                      >
                        <template #prepend>
                          <v-icon size="small">mdi-calendar-month</v-icon>
                        </template>
                        <v-list-item-title>Ignore for 1 month</v-list-item-title>
                      </v-list-item>
                    </template>
                    <template v-else>
                      <v-list-item @click.stop="productIgnore.unignoreProduct(p.id)">
                        <template #prepend>
                          <v-icon size="small" color="warning">mdi-bell-ring-outline</v-icon>
                        </template>
                        <v-list-item-title>Unignore (show alerts)</v-list-item-title>
                        <v-list-item-subtitle>
                          Remaining: {{ productIgnore.formatRemainingTime(productIgnore.getIgnoreInfo(p.id)?.remainingMs ?? 0) }}
                        </v-list-item-subtitle>
                      </v-list-item>
                    </template>
                  </v-list>
                </v-menu>
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
        <div v-else class="text-center py-8">
          <v-icon icon="mdi-check-circle-outline" size="40" color="success"></v-icon>
          <p class="text-grey mt-2">No products in this category</p>
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
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
