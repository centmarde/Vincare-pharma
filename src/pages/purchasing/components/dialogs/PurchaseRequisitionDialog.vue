<script setup lang="ts">
import { usePurchaseRequisition, unitOptions } from '../../composables/usePurchaseRequisition'
import type { ReorderPrefillItem } from '../../composables/usePurchaseRequisition'
import type { ProductPickerResult } from '@/stores/productsData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import ProductPickerDialog from '@/components/products/ProductPicker.vue'
import { formatCurrency } from '@/utils/helpers'
import { useDisplay } from 'vuetify'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  prefillItems?: ReorderPrefillItem[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submitted', resolvedReorderIds: number[]): void
}>()

const supplierStore = useSuppliersDataStore()
const { activeSuppliers } = storeToRefs(supplierStore)
const { mobile } = useDisplay()
const {
  currentPR,
  items,
  loading,
  customerOfferTotal,
  companyCostTotal,
  profit,
  isProfitable,
  offerCostRatio,
  marginPercent,
  addItem,
  removeItem,
  handleSubmit,
  reset,
  clearForm,
  addReorderItems,
} = usePurchaseRequisition()

// ─── Product picker ─────────────────────────────────────────────
const showProductPicker = ref(false)
const productPickerTargetIndex = ref<number | null>(null)

function openProductPicker(index: number) {
  productPickerTargetIndex.value = index
  showProductPicker.value = true
}

function onProductSelected(product: ProductPickerResult) {
  const index = productPickerTargetIndex.value
  if (index === null || !items.value[index]) return

  const item = items.value[index]
  item.item_description = product.product_name || item.item_description
  if (product.unit) item.unit = product.unit
  item.cost_per_unit = product.cost_price ?? item.cost_per_unit
  // Starting value only — the person can still override per line item
  item.offer_per_unit = product.selling_price ?? item.offer_per_unit
  if (product.supplier_id != null) item.supplier_id = product.supplier_id
  item.product_id = product.id ?? null

  productPickerTargetIndex.value = null
}

// ─── Expiry date (month/year only) picker ──────────────────────
// Keyed by row index since each line item gets its own popover
const expiryMenuOpen = ref<Record<number, boolean>>({})
const expiryViewMode = ref<Record<number, 'month' | 'months' | 'year'>>({})

function onExpiryMonthSelect(item: { expiry_date: Date | null }, index: number, month: number) {
  const year = item.expiry_date ? item.expiry_date.getFullYear() : new Date().getFullYear()
  item.expiry_date = new Date(year, month + 1, 0)   // last day of the selected month
  expiryMenuOpen.value[index] = false
}

function onExpiryYearSelect(item: { expiry_date: Date | null }, index: number, year: number) {
  const month = item.expiry_date ? item.expiry_date.getMonth() : 0
  item.expiry_date = new Date(year, month + 1, 0)   // keep same "last day of month" semantics
}

function formatMonthYear(value: Date | null): string {
  if (!value) return ''
  return value.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function close() {
  // reset()
  emit('update:modelValue', false)
}

async function onSubmit() {
  const result = await handleSubmit()
  if (result.success) {
    // handleSubmit already resets currentPR/items internally on success,
    // so there's no meaningful payload to pass along here
    emit('submitted', result.resolvedReorderIds)

    close()
  }
  // on failure, handleSubmit already surfaced a toast — dialog stays open so the
  // person can fix the item/supplier issue without losing what they've entered
}

// Fetch suppliers once when dialog opens; start from a clean form each time
watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      supplierStore.fetchSuppliers({ activeOnly: true })
      
      if (props.prefillItems?.length) {
        reset()
        addReorderItems(props.prefillItems)
      }
      expiryMenuOpen.value = {}
    }
  }
)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :fullscreen="mobile"
    :max-width="mobile ? undefined : 1500"
    scrollable
    persistent
  >
    <v-card :rounded="mobile ? 0 : 'lg'">
      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-4 pa-sm-5">
        <div class="d-flex align-center">
          <v-icon icon="mdi-file-document-edit-outline" size="30" class="mr-2 text-primary" />
          <span class="text-subtitle-1 text-sm-h6 font-weight-bold"
            >Place Purchase Requisition</span
          >
        </div>
        <div class="d-flex align-center" style="gap: 12px">
          <span v-if="!mobile" class="text-caption text-medium-emphasis">
            Customer offer vs. company cost
          </span>
          <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
        </div>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-3 pa-sm-5">
        <!-- ── DESKTOP TABLE VIEW ── -->
        <template v-if="!mobile">
          <!-- Table Header -->
          <v-row class="text-caption font-weight-bold mb-1 px-1" no-gutters>
            <v-col cols="auto" style="width: 36px" class="text-center">NO.</v-col>
            <v-col cols="1" class="pl-2">UNIT</v-col>
            <v-col cols="2" class="pl-2">PRODUCT</v-col>
            <v-col cols="1.5" class="pl-2">SUPPLIER</v-col>
            <v-col cols="1.5" class="pl-2">EXPIRY</v-col>
            <v-col cols="1" class="pl-2">QTY</v-col>
            <v-col cols="1" class="pl-2">OFFER/UNIT</v-col>
            <v-col cols="1" class="text-right pr-4">OFFER TOTAL</v-col>
            <v-col cols="1" class="pl-2">COST/UNIT</v-col>
            <v-col cols="1" class="text-right pr-2">COST TOTAL</v-col>
            <v-col cols="auto" style="width: 40px" />
          </v-row>

          <!-- Desktop Line Items -->
          <v-row
            v-for="(item, index) in items"
            :key="index"
            class="align-center mb-2 px-1"
            no-gutters
          >
            <v-col cols="auto" style="width: 36px" class="text-center text-body-2">
              {{ index + 1 }}
            </v-col>

            <v-col cols="1" class="pl-2">
              <v-select
                v-model="item.unit"
                :items="unitOptions"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="2" class="pl-2">
              <v-text-field
                v-model="item.item_description"
                placeholder="Item description"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-database-search-outline"
                @click:append-inner="openProductPicker(index)"
              />
            </v-col>

            <v-col cols="1.5" class="pl-2">
              <v-select
                v-model="item.supplier_id"
                :items="activeSuppliers"
                item-title="name"
                item-value="id"
                placeholder="Select supplier..."
                variant="outlined"
                density="compact"
                hide-details
                clearable
              />
            </v-col>

            <v-col cols="1.5" class="pl-2">
              <v-menu
                    :model-value="expiryMenuOpen[index] ?? false"
                    @update:model-value="(val) => (expiryMenuOpen[index] = val)"
                    :close-on-content-click="false"
                    location="bottom"
                    >
                    <template #activator="{ props: menuProps }">
                        <v-text-field
                        v-bind="menuProps"
                        :model-value="formatMonthYear(item.expiry_date)"
                        placeholder="MM/YYYY"
                        variant="outlined"
                        density="compact"
                        hide-details
                        readonly
                        prepend-inner-icon="mdi-calendar-month-outline"
                        />
                    </template>
                    <v-date-picker
                        view-mode="months"
                        @update:month="(m) => onExpiryMonthSelect(item, index, m)"
                        @update:year="(y) => onExpiryYearSelect(item, index, y)"
                    />
                </v-menu>
            </v-col>

            <v-col cols="1" class="pl-2">
              <v-text-field
                v-model.number="item.qty"
                type="number"
                placeholder="Qty"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="1" class="pl-2">
              <v-text-field
                v-model.number="item.offer_per_unit"
                type="number"
                placeholder="0.00"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="1" class="text-right pr-4">
              <span class="text-body-2">
                {{ formatCurrency((item.qty || 0) * (item.offer_per_unit || 0)) }}
              </span>
            </v-col>

            <v-col cols="1" class="pl-2">
              <v-text-field
                v-model.number="item.cost_per_unit"
                type="number"
                placeholder="0.00"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="1" class="text-right pr-2">
              <span class="text-body-2 font-weight-bold text-blue-darken-2">
                {{ formatCurrency((item.qty || 0) * (item.cost_per_unit || 0)) }}
              </span>
            </v-col>

            <v-col cols="auto" style="width: 40px" class="text-center">
              <v-btn
                icon="mdi-close"
                variant="tonal"
                color="red-lighten-1"
                size="small"
                @click="removeItem(index)"
              />
            </v-col>
          </v-row>
        </template>

        <!-- ── MOBILE CARD VIEW ── -->
        <template v-else>
          <div
            v-for="(item, index) in items"
            :key="index"
            class="mobile-item-card mb-3 pa-3 rounded-lg border"
          >
            <!-- Card header: item number + remove -->
            <div class="d-flex justify-space-between align-center mb-3">
              <span class="text-caption font-weight-bold text-medium-emphasis">
                ITEM {{ index + 1 }}
              </span>
              <v-btn
                icon="mdi-close"
                variant="tonal"
                color="red-lighten-1"
                size="x-small"
                @click="removeItem(index)"
              />
            </div>

            <!-- Description -->
            <div class="mb-2">
              <div class="field-label">Product Description</div>
              <v-text-field
                v-model="item.item_description"
                placeholder="Item description"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-database-search-outline"
                @click:append-inner="openProductPicker(index)"
              />
            </div>

            <!-- Unit + Qty side by side -->
            <v-row no-gutters class="mb-2" style="gap: 8px">
              <v-col>
                <div class="field-label">Unit</div>
                <v-select
                  v-model="item.unit"
                  :items="unitOptions"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
              <v-col>
                <div class="field-label">Quantity</div>
                <v-text-field
                  v-model.number="item.qty"
                  type="number"
                  placeholder="0"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
            </v-row>

            <!-- Supplier + Expiry side by side -->
            <v-row no-gutters class="mb-2" style="gap: 8px">
              <v-col>
                <div class="field-label">Supplier</div>
                <v-select
                  v-model="item.supplier_id"
                  :items="activeSuppliers"
                  item-title="name"
                  item-value="id"
                  placeholder="Select supplier..."
                  variant="outlined"
                  density="compact"
                  hide-details
                  clearable
                />
              </v-col>
              <v-col>
                <div class="field-label">Expiry Date</div>
                <v-menu
                    :model-value="expiryMenuOpen[index] ?? false"
                    @update:model-value="(val) => (expiryMenuOpen[index] = val)"
                    :close-on-content-click="false"
                    location="bottom"
                    >
                    <template #activator="{ props: menuProps }">
                        <v-text-field
                        v-bind="menuProps"
                        :model-value="formatMonthYear(item.expiry_date)"
                        placeholder="MM/YYYY"
                        variant="outlined"
                        density="compact"
                        hide-details
                        readonly
                        prepend-inner-icon="mdi-calendar-month-outline"
                        />
                    </template>
                    <v-date-picker
                        view-mode="months"
                        @update:month="(m) => onExpiryMonthSelect(item, index, m)"
                        @update:year="(y) => onExpiryYearSelect(item, index, y)"
                    />
                </v-menu>
              </v-col>
            </v-row>

            <!-- Offer/unit + Cost/unit side by side -->
            <v-row no-gutters class="mb-3" style="gap: 8px">
              <v-col>
                <div class="field-label">Offer / Unit</div>
                <v-text-field
                  v-model.number="item.offer_per_unit"
                  type="number"
                  placeholder="0.00"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
              <v-col>
                <div class="field-label">Cost / Unit</div>
                <v-text-field
                  v-model.number="item.cost_per_unit"
                  type="number"
                  placeholder="0.00"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
            </v-row>

            <!-- Computed totals row -->
            <v-divider class="mb-2" />
            <div class="d-flex justify-space-between align-center">
              <div class="text-caption">
                <span class="text-medium-emphasis">Offer Total </span>
                <span class="font-weight-bold">
                  {{ formatCurrency((item.qty || 0) * (item.offer_per_unit || 0)) }}
                </span>
              </div>
              <div class="text-caption">
                <span class="text-medium-emphasis">Cost Total </span>
                <span class="font-weight-bold text-blue-darken-2">
                  {{ formatCurrency((item.qty || 0) * (item.cost_per_unit || 0)) }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- Add Item / Clear Form -->
        <div class="d-flex ga-2" :class="{ 'flex-column': mobile }">
          <v-btn
            prepend-icon="mdi-plus"
            variant="outlined"
            density="compact"
            :block="mobile"
            class="mt-3 text-none"
            @click="addItem"
          >
            Add Item
          </v-btn>
          <v-btn
            prepend-icon="mdi-refresh"
            variant="tonal"
            color="primary"
            density="compact"
            :block="mobile"
            class="mt-3 text-none"
            @click="clearForm"
          >
            Clear Form
          </v-btn>
        </div>

        <div class="text-caption mt-3 font-italic text-medium-emphasis">
          "Offer" = what the customer offered · "Cost" = the item's actual cost in inventory
        </div>

        <v-divider class="my-6" />

        <!-- Justification -->
        <label class="text-subtitle-2 font-weight-bold d-block mb-2">Justification / Notes</label>
        <v-textarea
          v-model="currentPR.remarks"
          placeholder="Reason for requisition..."
          variant="outlined"
          rows="3"
          hide-details
          class="mb-6"
        />

        <!-- Summary -->
        <v-row align="end">
          <v-col cols="12" md="6" :order="mobile ? 1 : 2">
            <v-card variant="flat" rounded="lg" class="pa-4 border mb-4 mb-md-0">
              <div class="d-flex justify-space-between align-center mb-2">
                <span class="text-body-2">Customer Offer Total</span>
                <span class="text-h6 font-weight-bold">{{
                  formatCurrency(customerOfferTotal)
                }}</span>
              </div>

              <div class="d-flex justify-space-between align-center mb-4">
                <span class="text-body-2">Company Cost Total</span>
                <span class="text-h6 font-weight-bold">{{ formatCurrency(companyCostTotal) }}</span>
              </div>

              <v-divider class="mb-4" />

              <div class="d-flex justify-space-between align-center mb-2">
                <span class="text-body-2">Profit / (Loss)</span>
                <div class="d-flex align-center" style="gap: 8px">
                  <span
                    class="text-h6 font-weight-bold"
                    :class="isProfitable ? 'text-green-darken-2' : 'text-red-darken-2'"
                  >
                    {{ formatCurrency(profit) }}
                  </span>
                  <v-chip
                    :color="isProfitable ? 'green-lighten-4' : 'red-lighten-4'"
                    size="small"
                    class="font-weight-bold"
                    :class="isProfitable ? 'text-green-darken-3' : 'text-red-darken-3'"
                  >
                    {{ isProfitable ? '● Profitable' : '● Loss' }}
                  </v-chip>
                </div>
              </div>

              <div class="d-flex justify-space-between align-center">
                <span class="text-body-2">Offer : Cost Ratio</span>
                <span class="text-body-2 font-weight-bold">
                  {{ offerCostRatio }}x · {{ marginPercent }}% margin
                </span>
              </div>
            </v-card>
          </v-col>

          <v-col cols="12" md="6" :order="mobile ? 2 : 1" class="d-flex flex-column justify-end">
            <v-btn
              color="primary"
              size="large"
              class="text-none text-white font-weight-bold mb-2"
              rounded="lg"
              elevation="0"
              block
              :loading="loading"
              @click="onSubmit"
            >
              Submit for Approval
            </v-btn>
            <div class="text-caption text-medium-emphasis">
              Saved as one record <strong>(Pending Approval)</strong> even if not profitable — the
              admin decides. → Manager approves → Issue PO.
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <ProductPickerDialog v-model="showProductPicker" @select="onProductSelected" />
  </v-dialog>
</template>

<style scoped>
:deep(.v-field__outline) {
  --v-field-border-opacity: 0.15;
}
:deep(.v-field--focused .v-field__outline) {
  --v-field-border-opacity: 0.5;
}

.mobile-item-card {
  background-color: rgb(var(--v-theme-surface));
}

.field-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 4px;
}
</style>