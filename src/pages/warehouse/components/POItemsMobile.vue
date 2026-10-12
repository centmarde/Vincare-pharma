<script setup lang="ts">
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import type { PRItem } from '@/stores/purchaseRequisitionData'
import { formatCurrency, formatExpiryMonthYear } from '@/utils/helpers'
import ExpiryDateField from './ExpiryDateField.vue'

// Mobile items (cards) — editable SKU / actual count / batch no / expiry.
defineProps<{
  po: PurchaseOrder | null
  skuEditMode?: boolean
  transactionItems: PRItem[]
  needsSkuInput: (item: PRItem) => boolean
  onGenerateSku: (item: PRItem) => void
}>()
</script>

<template>
  <div class="mb-4">
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
          <span class="text-body-2 font-weight-medium">{{ item.product_name ?? '—' }}</span>
        </div>

        <v-divider class="mb-2" />

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
          <div class="pa-2 rounded-lg bg-surface-variant">
            <div class="text-caption">Price</div>
            <div class="text-body-2 font-weight-bold">{{ formatCurrency(item.cost_per_unit ?? 0) }}</div>
          </div>
          <div class="pa-2 rounded-lg bg-surface-variant">
            <div class="text-caption">Total</div>
            <div class="text-body-2 font-weight-bold">
              {{ formatCurrency((item.qty ?? 0) * (item.cost_per_unit ?? 0)) }}
            </div>
          </div>
        </div>

        <!-- Actual count + SKU inputs (always visible when in edit mode) -->
        <div v-if="skuEditMode">
          <div class="d-flex ga-3">
            <div style="flex: 1; min-width: 0;">
              <div class="text-caption text-medium-emphasis mb-1">Actual count</div>
              <v-text-field
                v-model.number="item.actual_count_stock_in"
                type="number"
                density="compact"
                variant="outlined"
                hide-details
                min="1"
                autocomplete="off"
                style="width: 100%"
              />
            </div>
            <div style="flex: 1; min-width: 0;">
              <div class="text-caption text-medium-emphasis mb-1 text-center">SKU</div>
              <v-text-field
                v-if="needsSkuInput(item)"
                v-model="item.sku"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Enter SKU"
                autocomplete="off"
                style="width: 100%"
                :append-inner-icon="item.sku ? '' : 'mdi-dice-multiple'"
                :title="item.sku ? '' : 'Generate SKU'"
                @click:append-inner="onGenerateSku(item)"
              />
              <div v-else class="d-flex align-center justify-center" style="min-height: 40px;">
                <v-chip :color="item.sku ? 'green' : 'error'" variant="tonal" size="small" label>
                  {{ item.sku || 'No SKU' }}
                </v-chip>
              </div>
            </div>
          </div>
          <div class="mt-3 d-flex ga-3">
            <div style="flex: 1; min-width: 0;">
              <div class="text-caption text-medium-emphasis mb-1">Batch No</div>
              <v-text-field
                v-model="item.batch_no"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Batch no"
                autocomplete="off"
                style="width: 100%"
              />
            </div>
            <div style="flex: 1; min-width: 0;">
              <div class="text-caption text-medium-emphasis mb-1">Expiry</div>
              <ExpiryDateField :item="item" width="100%" />
            </div>
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
          <div>
            <span class="text-medium-emphasis">Batch: </span>
            <span class="font-weight-medium">{{ item.batch_no ?? '—' }}</span>
          </div>
          <div>
            <span class="text-medium-emphasis">Expiry: </span>
            <span class="font-weight-medium">{{ formatExpiryMonthYear(item.expiry_date) }}</span>
          </div>
        </div>
      </v-card-text>
    </v-card>
    <v-card variant="outlined" rounded="lg" class="bg-surface-variant">
      <v-card-text class="pa-3 d-flex justify-space-between text-caption font-weight-bold">
        <span>TOTAL</span>
        <span>{{ formatCurrency(po?.total_amount ?? 0) }}</span>
      </v-card-text>
    </v-card>
  </div>
</template>
