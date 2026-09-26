<script setup lang="ts">
import {
  endOfMonthISODate,
  formatCurrency,
  formatExpiryMonthYear,
  fromLocalISODate,
  maskMonthYearInput,
  parseMonthYear,
} from '@/utils/helpers'
import type { PR, PRItem } from '@/stores/purchaseRequisitionData'
import { useDisplay } from 'vuetify'
import { ref, watch, computed } from 'vue'
import { useToast } from 'vue-toastification'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { storeToRefs } from 'pinia'
import ProductPickerDialog from '@/components/products/ProductPicker.vue'
import PREditItemsMobile from '../../mobile/PREditItemsMobile.vue'
import type { ProductPickerResult } from '@/stores/productsData'
import { unitOptions } from '../../composables/usePurchaseRequisition'

const { mobile } = useDisplay()
const toast = useToast()
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
const expiryPickerYear = ref(new Date().getFullYear())
const expiryPickerView = ref<'months' | 'year'>('months')
const expiryPickedMonth = ref<number | null>(null)
const expiryYearPicked = ref(false)
const editingExpiry = ref<{ index: number; text: string } | null>(null)

const earliestExpiryYear = 2000
const latestExpiryYear = 2099
const earliestExpiryDate = `${earliestExpiryYear}-01-01`
const latestExpiryDate = `${latestExpiryYear}-12-31`

const items = ref<PRItem[]>([])

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen && props.pr) {
      items.value = props.pr.items.map((item) => ({ ...item }))
      localRemarks.value = props.pr.remarks ?? ''
      expiryMenuOpen.value = {}
      editingExpiry.value = null
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
  if (item.product_id !== product.id) unlinkPickedProduct(item)
  item.product_name = product.product_name || item.product_name
  if (product.unit) item.unit = product.unit
  item.cost_per_unit = product.cost_price ?? item.cost_per_unit
  if (product.supplier_id != null) item.supplier_id = String(product.supplier_id)
  item.product_id = product.id ?? null

  productPickerTargetIndex.value = null
}

function openProductPicker(index: number) {
  productPickerTargetIndex.value = index
  showProductPicker.value = true
}

function unlinkPickedProduct(item: PRItem) {
  item.product_id = undefined
}

function addItem() {
  if (!props.pr) return
  const maxNo = items.value.reduce((max, item) => Math.max(max, item.no || 0), 0)
  items.value.push({
    id: Date.now(),
    no: maxNo + 1,
    unit: 'Box',
    product_name: '',
    qty: 1,
    cost_per_unit: 0,
    product_id: undefined,
    supplier_id: null,
    expiry_date: null,
    batch_no: null,
  })
}

function removeItem(index: number) {
  items.value.splice(index, 1)
}

function parseExpiryText(text: string): Date | null {
  const date = parseMonthYear(text)
  if (!date) return null
  const year = date.getFullYear()
  if (year < earliestExpiryYear || year > latestExpiryYear) return null
  return date
}

function expiryDateOf(item: PRItem): Date | null {
  return item.expiry_date ? fromLocalISODate(item.expiry_date) : null
}

function setExpiryMonth(item: PRItem, year: number, monthIndex: number) {
  item.expiry_date = endOfMonthISODate(year, monthIndex)
  expiryPickerYear.value = year
}

function expiryFieldText(item: PRItem, index: number): string {
  if (editingExpiry.value?.index === index) return editingExpiry.value.text
  const date = expiryDateOf(item)
  return date ? formatExpiryMonthYear(date) : ''
}

function startExpiryTyping(item: PRItem, index: number) {
  const date = expiryDateOf(item)
  editingExpiry.value = { index, text: date ? formatExpiryMonthYear(date) : '' }
}

function onExpiryTyped(item: PRItem, index: number, raw: string) {
  const text = maskMonthYearInput(raw)
  editingExpiry.value = { index, text }
  const date = parseExpiryText(text)
  if (date) setExpiryMonth(item, date.getFullYear(), date.getMonth())
}

function finishExpiryTyping(item: PRItem, index: number) {
  if (editingExpiry.value?.index !== index) return
  const text = editingExpiry.value.text
  editingExpiry.value = null
  if (!text) {
    item.expiry_date = null
    return
  }
  if (!parseExpiryText(text)) toast.info('Enter a valid expiry as MM/YYYY, e.g. 01/2029.')
}

function onExpiryMenuToggle(item: PRItem, index: number, isOpen: boolean) {
  expiryMenuOpen.value[index] = isOpen
  if (!isOpen) return
  expiryPickerYear.value = expiryDateOf(item)?.getFullYear() ?? new Date().getFullYear()
  expiryPickerView.value = 'months'
  expiryPickedMonth.value = null
  expiryYearPicked.value = false
}

function onExpiryPickerViewChange(mode: string) {
  if (mode === 'months' || mode === 'year') expiryPickerView.value = mode
}

function completeExpiryPick(item: PRItem, index: number, year: number, month: number) {
  setExpiryMonth(item, year, month)
  expiryMenuOpen.value[index] = false
}

function onExpiryMonthSelect(item: PRItem, index: number, month: number) {
  if (expiryYearPicked.value) {
    completeExpiryPick(item, index, expiryPickerYear.value, month)
    return
  }
  expiryPickedMonth.value = month
  expiryPickerView.value = 'year'
}

function onExpiryYearSelect(item: PRItem, index: number, year: number) {
  expiryPickerYear.value = year
  if (expiryPickedMonth.value != null) {
    completeExpiryPick(item, index, year, expiryPickedMonth.value)
    return
  }
  expiryYearPicked.value = true
  expiryPickerView.value = 'months'
}

function save() {
  if (!props.pr) return
  emit('save', { items: [...items.value], remarks: localRemarks.value })
  close()
}

const companyCostTotal = computed(() => {
  return items.value.reduce((sum, item) => sum + (item.qty || 0) * (item.cost_per_unit || 0), 0)
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
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-3 pa-sm-5">
        <!-- ── DESKTOP TABLE VIEW ── -->
        <template v-if="!mobile">
          <!-- Table Header -->
          <v-row class="text-caption font-weight-bold mb-1 px-1" no-gutters>
            <v-col cols="auto" style="width: 36px" class="text-center">NO.</v-col>
            <v-col cols="1" class="pl-2">UNIT</v-col>
            <v-col cols="3" class="pl-2">PRODUCT NAME</v-col>
            <v-col cols="2" class="pl-2">SUPPLIER</v-col>
            <v-col cols="1" class="pl-2">BATCH NO.</v-col>
            <v-col cols="1" class="pl-2">EXPIRY</v-col>
            <v-col cols="1" class="pl-2">QTY</v-col>
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
                :items="unitOptions"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="3" class="pl-2">
              <v-text-field
                v-model="item.product_name"
                placeholder="Product name"
                autocomplete="off"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-database-search-outline"
                @update:model-value="unlinkPickedProduct(item)"
                @click:append-inner="openProductPicker(index)"
              />
            </v-col>

            <v-col cols="2" class="pl-2">
              <v-select
                v-model="item.supplier_id"
                :items="supplierOptions"
                item-title="name"
                item-value="id"
                placeholder="Select supplier..."
                autocomplete="off"
                variant="outlined"
                density="compact"
                hide-details
                clearable
              />
            </v-col>

            <v-col cols="1" class="pl-2">
              <v-text-field
                v-model="item.batch_no"
                placeholder="Batch/Lot"
                autocomplete="off"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="1" class="pl-2">
              <v-menu
                :model-value="expiryMenuOpen[index] ?? false"
                @update:model-value="(isOpen) => onExpiryMenuToggle(item, index, isOpen)"
                :close-on-content-click="false"
                location="bottom"
              >
                <template #activator="{ props: menuProps }">
                  <v-text-field
                    v-bind="menuProps"
                    :model-value="expiryFieldText(item, index)"
                    placeholder="MM/YYYY"
                    maxlength="7"
                    inputmode="numeric"
                    variant="outlined"
                    autocomplete="off"
                    density="compact"
                    hide-details
                    @focus="startExpiryTyping(item, index)"
                    @update:model-value="(raw) => onExpiryTyped(item, index, raw)"
                    @blur="finishExpiryTyping(item, index)"
                  />
                </template>
                <v-date-picker
                  :model-value="expiryDateOf(item)"
                  :year="expiryPickerYear"
                  :view-mode="expiryPickerView"
                  :min="earliestExpiryDate"
                  :max="latestExpiryDate"
                  @update:view-mode="onExpiryPickerViewChange"
                  @update:month="(month) => onExpiryMonthSelect(item, index, month)"
                >
                  <template #year="{ year, props: yearButtonProps }">
                    <v-btn
                      :key="year.value"
                      v-bind="yearButtonProps"
                      @click="onExpiryYearSelect(item, index, year.value)"
                    />
                  </template>
                </v-date-picker>
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
                autocomplete="off"
              />
            </v-col>

            <v-col cols="1" class="pl-2">
              <v-text-field
                v-model.number="item.cost_per_unit"
                type="number"
                placeholder="0.00"
                variant="outlined"
                density="compact"
                hide-details
                autocomplete="off"
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

        <PREditItemsMobile
          v-else
          :items="items"
          :supplier-options="supplierOptions"
          :expiry-menu-open="expiryMenuOpen"
          :expiry-picker-year="expiryPickerYear"
          :expiry-picker-view="expiryPickerView"
          :earliest-expiry-date="earliestExpiryDate"
          :latest-expiry-date="latestExpiryDate"
          :expiry-field-text="expiryFieldText"
          :expiry-date-of="expiryDateOf"
          @add-item="addItem"
          @remove-item="removeItem"
          @unlink-product="unlinkPickedProduct"
          @pick-product="openProductPicker"
          @expiry-menu-toggle="onExpiryMenuToggle"
          @expiry-typing-start="startExpiryTyping"
          @expiry-typed="onExpiryTyped"
          @expiry-typing-finish="finishExpiryTyping"
          @expiry-view-change="onExpiryPickerViewChange"
          @expiry-month-select="onExpiryMonthSelect"
          @expiry-year-select="onExpiryYearSelect"
        />

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
              <div class="d-flex justify-space-between align-center">
                <span class="text-body-2">Total Cost</span>
                <span class="text-h6 font-weight-bold">{{ formatCurrency(companyCostTotal) }}</span>
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

      <!-- show-cost: Purchasing buys, so it needs the company cost. Selling
           channels deliberately omit this prop. -->
      <ProductPickerDialog v-model="showProductPicker" show-cost @select="onProductSelected" />
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
</style>
