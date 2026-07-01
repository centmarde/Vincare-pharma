<script setup lang="ts">
import { onMounted } from 'vue'
import { usePos } from '../composables/usePos'
import { usePosCheckout } from '../composables/usePosCheckout'
import PosPaymentDialog from '../dialogs/PosPaymentDialog.vue'
import PosReceiptDialog from '../dialogs/PosReceiptDialog.vue'
import { formatCurrency } from '@/utils/helpers'

const pos = usePos()
const {
  search, cart, loading,
  selectedOutletId, posOutletOptions,
  filteredProducts, subtotal, total, itemCount, isEmpty,
  addToCart, setQty, removeFromCart, clearCart, init, setOutlet,
} = pos

const checkout = usePosCheckout(pos)
const {
  loading: saleLoading,
  showPayment, showReceipt, amountTendered, changeDue, canComplete,
  customerName, customerAddress, customerMobile,
  lastReceipt, openPayment, confirmPayment,
} = checkout

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <v-row class="w-100" no-gutters>
      <!-- ── Product picker ─────────────────────────────────────── -->
      <v-col cols="12" md="7" class="pa-2">
        <v-card rounded="lg" elevation="1">
          <v-card-title class="d-flex justify-space-between align-center pa-4 flex-wrap" style="gap: 12px">
            <span class="text-h6 font-weight-bold">POS</span>
            <div class="d-flex align-center flex-wrap" style="gap: 12px">
              <v-select
                :model-value="selectedOutletId"
                :items="posOutletOptions"
                item-title="title"
                item-value="value"
                label="Branch"
                variant="outlined"
                density="compact"
                hide-details
                style="min-width: 200px"
                @update:model-value="setOutlet"
              />
              <v-text-field
                v-model="search"
                placeholder="Search product or SKU..."
                prepend-inner-icon="mdi-magnify"
                variant="outlined"
                density="compact"
                hide-details
                style="min-width: 240px"
              />
            </div>
          </v-card-title>
          <v-divider />

          <v-card-text class="pa-3" style="max-height: 70vh; overflow-y: auto">
            <div v-if="loading" class="text-center pa-6 text-medium-emphasis">Loading stock…</div>
            <div v-else-if="!filteredProducts.length" class="text-center pa-6 text-medium-emphasis">
              No sellable stock. Transfer stock into this branch first.
            </div>
            <v-row v-else dense>
              <v-col v-for="p in filteredProducts" :key="p.product_id" cols="6" sm="4">
                <v-card
                  variant="outlined"
                  rounded="lg"
                  class="pa-3 h-100 d-flex flex-column"
                  hover
                  @click="addToCart(p)"
                >
                  <div class="text-body-2 font-weight-medium">{{ p.product_name }}</div>
                  <div class="text-caption text-medium-emphasis mb-2">{{ p.sku ?? '—' }}</div>
                  <v-spacer />
                  <div class="d-flex justify-space-between align-center">
                    <span class="text-body-2 font-weight-bold text-primary">{{ formatCurrency(p.unit_price) }}</span>
                    <span class="text-caption text-medium-emphasis">{{ p.available }} left</span>
                  </div>
                </v-card>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- ── Cart ───────────────────────────────────────────────── -->
      <v-col cols="12" md="5" class="pa-2">
        <v-card rounded="lg" elevation="1">
          <v-card-title class="d-flex justify-space-between align-center pa-4">
            <span class="text-h6 font-weight-bold">Cart</span>
            <v-btn
              v-if="!isEmpty"
              variant="text"
              size="small"
              color="error"
              class="text-none"
              @click="clearCart"
            >
              Clear
            </v-btn>
          </v-card-title>
          <v-divider />

          <v-card-text class="pa-3" style="max-height: 50vh; overflow-y: auto">
            <div v-if="isEmpty" class="text-center pa-6 text-medium-emphasis">
              Tap a product to add it.
            </div>
            <div
              v-for="(line, i) in cart"
              :key="line.product_id"
              class="d-flex align-center py-2"
              style="gap: 8px"
            >
              <div class="flex-grow-1">
                <div class="text-body-2 font-weight-medium">{{ line.product_name }}</div>
                <div class="text-caption text-medium-emphasis">{{ formatCurrency(line.unit_price) }} each</div>
              </div>
              <v-text-field
                :model-value="line.quantity"
                type="number"
                min="1"
                :max="line.available"
                density="compact"
                variant="outlined"
                hide-details
                style="width: 72px"
                @update:model-value="setQty(i, Number($event))"
              />
              <div class="text-body-2 font-weight-bold" style="width: 80px; text-align: right">
                {{ formatCurrency(line.quantity * line.unit_price) }}
              </div>
              <v-btn
                variant="text"
                size="small"
                icon="mdi-close"
                color="error"
                @click="removeFromCart(i)"
              />
            </div>
          </v-card-text>

          <v-divider />

          <v-card-text class="pa-4">
            <div class="d-flex justify-space-between text-body-2 text-medium-emphasis mb-1">
              <span>Items</span><span>{{ itemCount }}</span>
            </div>
            <div class="d-flex justify-space-between text-h6 font-weight-bold">
              <span>Total</span><span>{{ formatCurrency(total) }}</span>
            </div>
          </v-card-text>

          <v-card-actions class="pa-4 pt-0">
            <v-btn
              color="success"
              class="text-none font-weight-bold"
              elevation="0"
              block
              size="large"
              :disabled="isEmpty"
              @click="openPayment"
            >
              Charge {{ formatCurrency(total) }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <PosPaymentDialog
      v-model="showPayment"
      :total="total"
      :tendered="amountTendered"
      :change-due="changeDue"
      :can-complete="canComplete"
      :loading="saleLoading"
      :customer-name="customerName"
      :customer-address="customerAddress"
      :customer-mobile="customerMobile"
      @update:tendered="amountTendered = $event"
      @update:customer-name="customerName = $event"
      @update:customer-address="customerAddress = $event"
      @update:customer-mobile="customerMobile = $event"
      @confirm="confirmPayment"
    />

    <PosReceiptDialog
      v-model="showReceipt"
      :receipt="lastReceipt"
    />
  </v-container>
</template>

<style scoped>
.bg-surface-variant {
  min-height: 100%;
}
</style>
