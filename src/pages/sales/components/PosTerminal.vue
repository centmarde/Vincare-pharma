<script setup lang="ts">
import { onMounted } from 'vue'
import { usePosCheckout } from '../composables/usePosCheckout'
import PosPaymentDialog from '../dialogs/PosPaymentDialog.vue'
import PosReceiptDialog from '../dialogs/PosReceiptDialog.vue'
import { formatCurrency } from '@/utils/helpers'
import { usePos } from '../composables/usePos'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const pos = usePos()
const {
  search, cart, loading,
  isSearching, resultCount, submitSearch, clearSearch,
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
  <v-container fluid class="pa-2 fill-height align-start">
    <v-row>
      <!-- ── Product picker ─────────────────────────────────────── -->
      <v-col cols="12" lg="7" class="pa-2">
        <v-card rounded="lg" elevation="1">
          <v-card-title class="d-flex justify-space-between align-center pa-4 flex-wrap ga-3">
            <span class="text-h6 font-weight-bold">POS</span>
            <div class="d-flex align-center flex-wrap ga-3" :class="mobile ? 'w-100' : ''">
              <v-select
                :model-value="selectedOutletId"
                :items="posOutletOptions"
                item-title="title"
                item-value="value"
                label="Branch"
                variant="outlined"
                density="compact"
                hide-details
                :style="mobile ? 'width: 100%' : 'min-width: 200px'"
                @update:model-value="setOutlet"
              />
              <!-- Enter (or the button) adds a single exact match straight to
                   the cart, so a barcode scanner works and the counter saves a
                   click per item. Typing still filters live. -->
              <v-text-field
                v-model="search"
                placeholder="Scan barcode or search name / generic / SKU"
                prepend-inner-icon="mdi-magnify"
                :clearable="isSearching"
                variant="outlined"
                density="compact"
                hide-details
                :style="mobile ? 'width: 100%' : 'min-width: 300px'"
                @keyup.enter="submitSearch"
                @click:clear="clearSearch"
              />
              <v-btn
                color="primary"
                variant="flat"
                class="text-none font-weight-bold"
                prepend-icon="mdi-magnify"
                :disabled="!isSearching"
                :block="mobile"
                @click="submitSearch"
              >
                Search
              </v-btn>
            </div>
          </v-card-title>
          <v-divider />

          <v-card-text class="pa-3" :style="mobile ? 'max-height: 50vh; overflow-y: auto' : 'max-height: 70vh; overflow-y: auto'">
            <div v-if="loading" class="text-center pa-6 text-medium-emphasis">Loading stock…</div>

            <template v-else>
              <div v-if="isSearching" class="d-flex align-center justify-space-between px-1 pb-2">
                <span class="text-caption text-medium-emphasis">
                  {{ resultCount }} match{{ resultCount === 1 ? '' : 'es' }} for "{{ search }}"
                </span>
                <v-btn size="x-small" variant="text" class="text-none" @click="clearSearch">
                  Show all
                </v-btn>
              </div>

              <!-- An empty RESULT is not an empty BRANCH. Telling a cashier to
                   "transfer stock in" because their search typo matched nothing
                   is misleading, so the two cases read differently. -->
              <div v-if="!filteredProducts.length" class="text-center pa-6 text-medium-emphasis">
                <template v-if="isSearching">
                  No product matches "{{ search }}" in this branch.
                </template>
                <template v-else>
                  No sellable stock. Transfer stock into this branch first.
                </template>
              </div>

              <v-row v-else dense>
              <v-col v-for="p in filteredProducts" :key="p.product_id" cols="6" sm="4" lg="3">
                <v-card
                  variant="outlined"
                  rounded="lg"
                  class="pa-3 h-100 d-flex flex-column"
                  hover
                  @click="addToCart(p)"
                >
                  <div class="text-body-2 font-weight-medium text-truncate">{{ p.product_name }}</div>
                  <!-- Brand is shown because search matches on it: a customer
                       asks for "Fluimucil" but the card is titled by molecule,
                       so without it a hit looks like an unrelated result. -->
                  <div class="text-caption text-medium-emphasis text-truncate mb-2">
                    <span v-if="p.brand" class="font-weight-medium">{{ p.brand }}</span>
                    <span v-if="p.brand"> · </span>{{ p.sku ?? '—' }}
                  </div>
                  <v-spacer />
                  <div class="d-flex justify-space-between align-center ga-1">
                    <span class="text-body-2 font-weight-bold text-primary text-truncate">{{ formatCurrency(p.unit_price) }}</span>
                    <span class="text-caption text-medium-emphasis flex-shrink-0">{{ p.available }} left</span>
                  </div>
                </v-card>
              </v-col>
              </v-row>
            </template>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- ── Cart ───────────────────────────────────────────────── -->
      <v-col cols="12" lg="5" class="pa-2">
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

          <v-card-text class="pa-3" :style="mobile ? 'max-height: 40vh; overflow-y: auto' : 'max-height: 50vh; overflow-y: auto'">
            <div v-if="isEmpty" class="text-center pa-6 text-medium-emphasis">
              Tap a product to add it.
            </div>
            <div
              v-for="(line, i) in cart"
              :key="line.product_id"
              class="d-flex align-center py-2 ga-2"
            >
              <div class="flex-grow-1" style="min-width: 0">
                <div class="text-body-2 font-weight-medium text-truncate">{{ line.product_name }}</div>
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
                class="input-number flex-shrink-0"
                :style="mobile ? 'width: 70px' : 'width: 90px'"
                @update:model-value="setQty(i, Number($event))"
              />

              <!-- Mobile: total below qty -->
              <div
                v-if="mobile"
                class="text-body-2 font-weight-bold text-right"
                style="width: 85px; min-width: 0"
              >
                <div class="text-truncate">{{ formatCurrency(line.quantity * line.unit_price) }}</div>
              </div>
              <!-- Desktop: total -->
              <div v-else class="text-body-2 font-weight-bold flex-shrink-0" style="width: 80px; text-align: right">
                {{ formatCurrency(line.quantity * line.unit_price) }}
              </div>

              <v-btn
                variant="text"
                size="small"
                icon="mdi-close"
                color="error"
                class="flex-shrink-0"
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