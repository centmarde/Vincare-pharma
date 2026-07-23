<script setup lang="ts">
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import type { PR } from '@/stores/purchaseRequisitionData'
import { useDisplay } from 'vuetify'
import { ref, watch, computed } from 'vue'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { storeToRefs } from 'pinia'
import ProductPickerDialog from './ProductPicker.vue'
import type { ProductPickerResult } from '@/stores/productsData'

const { mobile } = useDisplay()
const supplierStore = useSuppliersDataStore()
const { activeSuppliers } = storeToRefs(supplierStore)

// Map supplier IDs to strings so v-model (string | null) can match v-select (number)
const supplierOptions = computed(() =>
  activeSuppliers.value.map((s) => ({ ...s, id: String(s.id) })),
)

const props = defineProps<{
  modelValue: boolean
  pr: PR | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [data: { items: any[]; remarks: string }]
}>()

const localRemarks = ref('')
const showProductPicker = ref(false)
const productPickerTargetIndex = ref<number | null>(null)
const expiryMenuOpen = ref<Record<number, boolean>>({})

const items = computed(() => props.pr?.items || [])

watch(
  () => props.pr,
  (newPr) => {
    if (newPr) {
      localRemarks.value = newPr.remarks ?? ''
      expiryMenuOpen.value = {}
    }
  },
  { immediate: true },
)

function close() {
  emit('update:modelValue', false)
}

function onProductSelected(product: ProductPickerResult) {
  const index = productPickerTargetIndex.value
  if (index === null || !items.value[index]) return

  const item = items.value[index]
  item.item_description = product.product_name || item.item_description
  if (product.unit) item.unit = product.unit
  item.cost_per_unit = product.cost_price ?? item.cost_per_unit
  item.offer_per_unit = product.selling_price ?? item.offer_per_unit
  if (product.supplier_id != null) item.supplier_id = String(product.supplier_id)
  item.product_id = product.id ?? null

  productPickerTargetIndex.value = null
}

function openProductPicker(index: number) {
  productPickerTargetIndex.value = index
  showProductPicker.value = true
}

function addItem() {
  if (!props.pr) return
  const maxNo = props.pr.items.reduce((max, item) => Math.max(max, item.no || 0), 0)
  props.pr.items.push({
    id: Date.now(),
    no: maxNo + 1,
    unit: 'Box',
    item_description: '',
    qty: 1,
    offer_per_unit: 0,
    cost_per_unit: 0,
    product_id: undefined,
    supplier_id: null,
    expiry_date: null,
  })
}

function removeItem(index: number) {
  if (!props.pr) return
  props.pr.items.splice(index, 1)
}

function onExpiryMonthSelect(item: any, index: number, month: number) {
  const current = item.expiry_date ? new Date(item.expiry_date) : new Date()
  const year = current.getFullYear()
  item.expiry_date = new Date(year, month + 1, 0).toISOString()
  expiryMenuOpen.value[index] = false
}

function onExpiryYearSelect(item: any, index: number, year: number) {
  const current = item.expiry_date ? new Date(item.expiry_date) : new Date()
  const month = current.getMonth()
  item.expiry_date = new Date(year, month + 1, 0).toISOString()
}

function formatMonthYear(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function save() {
  if (!props.pr) return
  emit('save', { items: [...props.pr.items], remarks: localRemarks.value })
  close()
}

const customerOfferTotal = computed(() => {
  if (!props.pr) return 0
  return props.pr.items.reduce((sum, item) => sum + (item.qty || 0) * (item.offer_per_unit || 0), 0)
})

const companyCostTotal = computed(() => {
  if (!props.pr) return 0
  return props.pr.items.reduce((sum, item) => sum + (item.qty || 0) * (item.cost_per_unit || 0), 0)
})

const profit = computed(() => customerOfferTotal.value - companyCostTotal.value)
const isProfitable = computed(() => profit.value >= 0)
const offerCostRatio = computed(() => {
  if (companyCostTotal.value === 0) return '0.0'
  return (customerOfferTotal.value / companyCostTotal.value).toFixed(1)
})
const marginPercent = computed(() => {
  if (customerOfferTotal.value === 0) return '0.0'
  return ((profit.value / customerOfferTotal.value) * 100).toFixed(1)
})
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :fullscreen="mobile"
    :max-width="mobile ? undefined : 1500"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card :rounded="mobile ? 0 : 'lg'">
      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-4 pa-sm-5">
        <div class="d-flex align-center">
          <v-icon icon="mdi-file-document-edit-outline" size="30" class="mr-2 text-primary" />
          <span class="text-subtitle-1 text-sm-h6 font-weight-bold"
            >Edit PR - {{ pr?.requisition_no }}</span
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
            :key="item.id"
            class="align-center mb-2 px-1"
            no-gutters
          >
            <v-col cols="auto" style="width: 36px" class="text-center text-body-2">
              {{ item.no ?? index + 1 }}
            </v-col>

            <v-col cols="1" class="pl-2">
              <v-select
                v-model="item.unit"
                :items="[
                  'Box',
                  'Pack',
                  'Piece',
                  'Bottle',
                  'Tube',
                  'Vial',
                  'Ampoule',
                  'Blister',
                  'Strip',
                ]"
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
                :items="supplierOptions"
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
          <!-- Add Item button for desktop -->
          <v-row class="mt-2 px-1" no-gutters>
            <v-col>
              <v-btn
                variant="outlined"
                color="primary"
                size="small"
                class="text-none"
                prepend-icon="mdi-plus"
                @click="addItem"
              >
                Add Item
              </v-btn>
            </v-col>
          </v-row>
        </template>

        <!-- ── MOBILE CARD VIEW ── -->
        <template v-else>
          <div
            v-for="(item, index) in items"
            :key="item.id"
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
                  :items="[
                    'Box',
                    'Pack',
                    'Piece',
                    'Bottle',
                    'Tube',
                    'Vial',
                    'Ampoule',
                    'Blister',
                    'Strip',
                  ]"
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
                  :items="supplierOptions"
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
          <!-- Add Item button for mobile -->
          <v-btn
            variant="outlined"
            color="primary"
            size="small"
            class="text-none mb-3"
            prepend-icon="mdi-plus"
            block
            @click="addItem"
          >
            Add Item
          </v-btn>
        </template>

        <v-divider class="my-6" />

        <!-- Justification -->
        <label class="text-subtitle-2 font-weight-bold d-block mb-2">Justification / Notes</label>
        <v-textarea
          v-model="localRemarks"
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
              @click="save"
            >
              Save Changes
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>

      <ProductPickerDialog v-model="showProductPicker" @select="onProductSelected" />
    </v-card>
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
