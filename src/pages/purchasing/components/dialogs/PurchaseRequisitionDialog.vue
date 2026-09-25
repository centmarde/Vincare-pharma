<script setup lang="ts">
import { usePurchaseRequisition, unitOptions } from '../../composables/usePurchaseRequisition'
import type { ReorderPrefillItem } from '../../composables/usePurchaseRequisition'
import type { ProductPickerResult } from '@/stores/productsData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import ProductPickerDialog from '@/components/products/ProductPicker.vue'
import {
  formatCurrency,
  formatExpiryMonthYear,
  maskMonthYearInput,
  parseMonthYear,
} from '@/utils/helpers'
import { useDisplay } from 'vuetify'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import { useToast } from 'vue-toastification'

const props = defineProps<{
  modelValue: boolean
  prefillItems?: ReorderPrefillItem[]
  draftId?: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submitted', resolvedReorderIds: number[]): void
  (e: 'saved-draft'): void
}>()

const supplierStore = useSuppliersDataStore()
const { activeSuppliers } = storeToRefs(supplierStore)
const { mobile } = useDisplay()
const toast = useToast()
const {
  currentPR,
  items,
  loading,
  currentDraftId,
  companyCostTotal,
  supplierCount,
  supplierSummaries,
  purchaseGrandTotal,
  addItem,
  removeItem,
  unlinkPickedProduct,
  handleSubmit,
  saveDraft,
  loadDraft,
  reset,
  clearForm,
  addReorderItems,
  hasUnsavedDraftChanges,
  saveDraftOnClose,
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
  if (item.product_id !== product.id) unlinkPickedProduct(item)
  item.product_name = product.product_name || item.product_name
  if (product.unit) item.unit = product.unit
  item.cost_per_unit = product.cost_price ?? item.cost_per_unit
  if (product.supplier_id != null) item.supplier_id = product.supplier_id
  item.product_id = product.id ?? null

  productPickerTargetIndex.value = null
}

// ─── Expiry date (month/year only) picker ──────────────────────
// Keyed by row index since each line item gets its own popover
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

function parseExpiryText(text: string): Date | null {
  const date = parseMonthYear(text)
  if (!date) return null
  const year = date.getFullYear()
  if (year < earliestExpiryYear || year > latestExpiryYear) return null
  return date
}

function setExpiryMonth(item: { expiry_date: Date | null }, year: number, monthIndex: number) {
  item.expiry_date = new Date(year, monthIndex + 1, 0) // last day of the selected month
  expiryPickerYear.value = year
}

function expiryFieldText(item: { expiry_date: Date | null }, index: number): string {
  if (editingExpiry.value?.index === index) return editingExpiry.value.text
  return item.expiry_date ? formatExpiryMonthYear(item.expiry_date) : ''
}

function startExpiryTyping(item: { expiry_date: Date | null }, index: number) {
  const text = item.expiry_date ? formatExpiryMonthYear(item.expiry_date) : ''
  editingExpiry.value = { index, text }
}

function onExpiryTyped(item: { expiry_date: Date | null }, index: number, raw: string) {
  const text = maskMonthYearInput(raw)
  editingExpiry.value = { index, text }
  const date = parseExpiryText(text)
  if (date) setExpiryMonth(item, date.getFullYear(), date.getMonth())
}

function finishExpiryTyping(item: { expiry_date: Date | null }, index: number) {
  if (editingExpiry.value?.index !== index) return
  const text = editingExpiry.value.text
  editingExpiry.value = null
  if (!text) {
    item.expiry_date = null
    return
  }
  if (!parseExpiryText(text)) toast.info('Enter a valid expiry as MM/YYYY, e.g. 01/2029.')
}

function onExpiryMenuToggle(item: { expiry_date: Date | null }, index: number, isOpen: boolean) {
  expiryMenuOpen.value[index] = isOpen
  if (!isOpen) return
  expiryPickerYear.value = item.expiry_date
    ? item.expiry_date.getFullYear()
    : new Date().getFullYear()
  expiryPickerView.value = 'months'
  expiryPickedMonth.value = null
  expiryYearPicked.value = false
}

function onExpiryPickerViewChange(mode: string) {
  if (mode === 'months' || mode === 'year') expiryPickerView.value = mode
}

function completeExpiryPick(
  item: { expiry_date: Date | null },
  index: number,
  year: number,
  month: number,
) {
  setExpiryMonth(item, year, month)
  expiryMenuOpen.value[index] = false
}

function onExpiryMonthSelect(item: { expiry_date: Date | null }, index: number, month: number) {
  if (expiryYearPicked.value) {
    completeExpiryPick(item, index, expiryPickerYear.value, month)
    return
  }
  expiryPickedMonth.value = month
  expiryPickerView.value = 'year'
}

function onExpiryYearSelect(item: { expiry_date: Date | null }, index: number, year: number) {
  expiryPickerYear.value = year
  if (expiryPickedMonth.value != null) {
    completeExpiryPick(item, index, year, expiryPickedMonth.value)
    return
  }
  expiryYearPicked.value = true
  expiryPickerView.value = 'months'
}

function supplierName(supplierId: number): string {
  const supplier = activeSuppliers.value.find((s) => s.id === supplierId)
  return supplier?.name ?? 'Supplier'
}

async function close() {
  // reset()
  await saveDraftOnClose()
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

async function onSaveDraft() {
  const result = await saveDraft()
  if (result.success) {
    emit('saved-draft')
    close()
  }
}

// Fetch suppliers once when dialog opens; start from a clean form each time
watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen) {
      supplierStore.fetchSuppliers({ activeOnly: true })

      if (props.draftId != null) {
        const keepsUnsavedEdits =
          props.draftId === currentDraftId.value && hasUnsavedDraftChanges.value
        if (!keepsUnsavedEdits) {
          const loaded = await loadDraft(props.draftId)
          if (!loaded) {
            reset()
            currentDraftId.value = null
            toast.error('That draft is no longer available.')
            close()
          }
        }
      } else if (props.prefillItems?.length) {
        reset()
        addReorderItems(props.prefillItems)
      } else if (currentDraftId.value != null && !hasUnsavedDraftChanges.value) {
        reset()
      }
      expiryMenuOpen.value = {}
      editingExpiry.value = null
    }
  },
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
          <v-chip v-if="currentDraftId" size="small" variant="tonal" color="primary" class="ml-3">
            Draft #{{ currentDraftId }}
          </v-chip>
        </div>
        <div class="d-flex align-center" style="gap: 12px">
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
            <v-col cols="auto" style="width: 110px" class="pl-2">UNIT</v-col>
            <v-col class="pl-2">PRODUCT</v-col>
            <v-col cols="auto" style="width: 180px" class="pl-2">SUPPLIER</v-col>
            <v-col cols="auto" style="width: 160px" class="pl-2">BATCH NO.</v-col>
            <v-col cols="auto" style="width: 115px" class="pl-2">EXPIRY</v-col>
            <v-col cols="auto" style="width: 110px" class="pl-2">QTY</v-col>
            <v-col cols="auto" style="width: 110px" class="pl-2">COST/UNIT</v-col>
            <v-col cols="auto" style="width: 120px" class="text-right pr-2">COST TOTAL</v-col>
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

            <v-col cols="auto" style="width: 110px" class="pl-2">
              <v-select
                v-model="item.unit"
                :items="unitOptions"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col class="pl-2">
              <v-text-field
                v-model="item.product_name"
                placeholder="Item description"
                autocomplete="off"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-database-search-outline"
                @update:model-value="unlinkPickedProduct(item)"
                @click:append-inner="openProductPicker(index)"
              />
            </v-col>

            <v-col cols="auto" style="width: 180px" class="pl-2">
              <v-autocomplete
                v-model="item.supplier_id"
                :items="activeSuppliers"
                item-title="name"
                item-value="id"
                placeholder="Type or paste supplier..."
                autocomplete="off"
                variant="outlined"
                density="compact"
                auto-select-first
                hide-details
                clearable
              />
            </v-col>

            <v-col cols="auto" style="width: 160px" class="pl-2">
              <v-text-field
                v-model="item.batch_no"
                placeholder="Batch/Lot"
                autocomplete="off"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="auto" style="width: 115px" class="pl-2">
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
                    autocomplete="off"
                    maxlength="7"
                    inputmode="numeric"
                    variant="outlined"
                    density="compact"
                    hide-details
                    @focus="startExpiryTyping(item, index)"
                    @update:model-value="(raw) => onExpiryTyped(item, index, raw)"
                    @blur="finishExpiryTyping(item, index)"
                  />
                </template>
                <v-date-picker
                  :model-value="item.expiry_date"
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

            <v-col cols="auto" style="width: 110px" class="pl-2">
              <v-text-field
                v-model.number="item.qty"
                type="number"
                placeholder="Qty"
                autocomplete="off"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="auto" style="width: 110px" class="pl-2">
              <v-text-field
                v-model.number="item.cost_per_unit"
                type="number"
                placeholder="0.00"
                autocomplete="off"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="auto" style="width: 120px" class="text-right pr-2">
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
                v-model="item.product_name"
                placeholder="Item description"
                autocomplete="off"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-database-search-outline"
                @update:model-value="unlinkPickedProduct(item)"
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
                  autocomplete="off"
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
                <v-autocomplete
                  v-model="item.supplier_id"
                  :items="activeSuppliers"
                  item-title="name"
                  item-value="id"
                  placeholder="Type or paste supplier..."
                  variant="outlined"
                  density="compact"
                  auto-select-first
                  hide-details
                  clearable
                />
              </v-col>
              <v-col>
                <div class="field-label">Expiry Date</div>
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
                      autocomplete="off"
                      maxlength="7"
                      inputmode="numeric"
                      variant="outlined"
                      density="compact"
                      hide-details
                      prepend-inner-icon="mdi-calendar-month-outline"
                      @focus="startExpiryTyping(item, index)"
                      @update:model-value="(raw) => onExpiryTyped(item, index, raw)"
                      @blur="finishExpiryTyping(item, index)"
                    />
                  </template>
                  <v-date-picker
                    :model-value="item.expiry_date"
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
            </v-row>

            <v-row no-gutters class="mb-3" style="gap: 8px">
              <v-col>
                <div class="field-label">Batch No.</div>
                <v-text-field
                  v-model="item.batch_no"
                  placeholder="Batch/Lot"
                  autocomplete="off"
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
                  autocomplete="off"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
            </v-row>

            <!-- Computed totals row -->
            <v-divider class="mb-2" />
            <div class="d-flex justify-end align-center">
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
          "Cost" = the agreed supplier price for this line
        </div>

        <v-divider class="my-6" />

        <v-row align="start">
          <v-col cols="12" md="6" :order="mobile ? 2 : 1" class="d-flex flex-column">
            <!-- Justification -->
            <label class="text-subtitle-2 font-weight-bold d-block mb-2"
              >Justification / Notes</label
            >
            <v-textarea
              v-model="currentPR.remarks"
              placeholder="Reason for requisition..."
              variant="outlined"
              rows="3"
              hide-details
              class="mb-6"
            />
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
            <v-btn
              variant="outlined"
              size="large"
              class="text-none font-weight-bold mb-2"
              rounded="lg"
              prepend-icon="mdi-content-save-outline"
              block
              :loading="loading"
              @click="onSaveDraft"
            >
              {{ currentDraftId ? 'Update Draft' : 'Save as Draft' }}
            </v-btn>
            <div class="text-caption text-medium-emphasis">
              <template v-if="supplierCount > 1">
                One requisition per supplier — <strong>{{ supplierCount }}</strong> will be created
                <strong>(Pending Approval)</strong> → Manager approves → Issue PO.
              </template>
              <template v-else>
                Saved as one record <strong>(Pending Approval)</strong> → Manager approves → Issue
                PO.
              </template>
            </div>
            <div class="text-caption text-medium-emphasis mt-1">
              A draft stays editable and is not sent for approval.
            </div>
          </v-col>

          <!-- Summary -->
          <v-col cols="12" md="6" :order="mobile ? 1 : 2">
            <v-card
              v-if="!supplierSummaries.length"
              variant="flat"
              rounded="lg"
              class="pa-4 border"
            >
              <div class="d-flex justify-space-between align-center">
                <span class="text-body-2">Net Total Amount</span>
                <span class="text-h6 font-weight-bold">{{ formatCurrency(companyCostTotal) }}</span>
              </div>
              <div class="text-caption text-medium-emphasis mt-2">
                Pick a supplier for your items to add a discount, tax, or shipping.
              </div>
            </v-card>

            <v-card
              v-for="summary in supplierSummaries"
              :key="summary.charges.supplier_id"
              variant="flat"
              rounded="lg"
              class="border mb-4"
            >
              <div class="d-flex align-center ga-2 px-4 pt-3 pb-1">
                <v-icon icon="mdi-truck-outline" size="18" color="primary" />
                <span class="text-caption text-medium-emphasis">Supplier:</span>
                <span class="text-subtitle-1 font-weight-bold text-high-emphasis">
                  {{ supplierName(summary.charges.supplier_id) }}
                </span>
              </div>
              <v-table density="compact">
                <tbody>
                  <tr>
                    <td class="font-weight-bold">Net Total Amount:</td>
                    <td class="text-right text-no-wrap">
                      {{ formatCurrency(summary.netTotal) }}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div class="d-flex flex-wrap align-center ga-2 py-1">
                        <span class="font-weight-bold">Discount:</span>
                        <span class="text-medium-emphasis">(-)</span>
                        <v-text-field
                          v-model.number="summary.charges.discount_percent"
                          type="number"
                          min="0"
                          max="100"
                          suffix="%"
                          autocomplete="off"
                          variant="outlined"
                          density="compact"
                          max-width="110"
                          hide-details
                        />
                      </div>
                    </td>
                    <td class="text-right text-no-wrap">
                      {{ formatCurrency(summary.discountAmount) }}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span class="font-weight-bold">Purchase Tax:</span>
                      <span class="text-medium-emphasis ml-2">(+)</span>
                    </td>
                    <td>
                      <div class="d-flex justify-end py-1">
                        <v-text-field
                          v-model.number="summary.charges.tax_amount"
                          type="number"
                          min="0"
                          prefix="₱"
                          autocomplete="off"
                          variant="outlined"
                          density="compact"
                          max-width="140"
                          hide-details
                        />
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span class="font-weight-bold">Additional Shipping charges:</span>
                      <span class="text-medium-emphasis ml-2">(+)</span>
                    </td>
                    <td>
                      <div class="d-flex justify-end py-1">
                        <v-text-field
                          v-model.number="summary.charges.shipping_amount"
                          type="number"
                          min="0"
                          prefix="₱"
                          autocomplete="off"
                          variant="outlined"
                          density="compact"
                          max-width="140"
                          hide-details
                        />
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td class="font-weight-bold">Purchase Total:</td>
                    <td class="text-right text-no-wrap text-subtitle-1 font-weight-bold">
                      {{ formatCurrency(summary.purchaseTotal) }}
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-card>

            <div
              v-if="supplierSummaries.length > 1"
              class="d-flex justify-space-between align-center px-4"
            >
              <span class="text-body-2 font-weight-bold">
                Total for {{ supplierSummaries.length }} requisitions
              </span>
              <span class="text-h6 font-weight-bold">{{ formatCurrency(purchaseGrandTotal) }}</span>
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- show-cost: Purchasing buys, so it needs the company cost. Selling
           channels deliberately omit this prop. -->
    <ProductPickerDialog v-model="showProductPicker" show-cost @select="onProductSelected" />
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
