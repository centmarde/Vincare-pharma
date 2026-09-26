<script setup lang="ts">
import { company } from '@/pages/purchasing/composables/usePODetailModal'
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import {
  formatCurrency,
  formatDatePO_Written,
  formatExpiryMonthYear,
  fromLocalISODate,
  maskMonthYearInput,
  parseMonthYear,
} from '@/utils/helpers'
import type { PR, PRItem } from '@/stores/purchaseRequisitionData'
import { useProductsDataStore } from '@/stores/productsData'
import { ref, watch } from 'vue'
import { useToast } from 'vue-toastification'

const props = defineProps<{
  po: PurchaseOrder | null
  pr: PR | null
  mobile: boolean
  skuEditMode?: boolean
  transactionItems: PRItem[]
  effectiveEmptyRows: number
}>()

const productsStore = useProductsDataStore()
const toast = useToast()

const skuInputItemIds = ref<Record<number, boolean>>({})

function needsSkuInput(item: PRItem): boolean {
  return skuInputItemIds.value[item.id] === true
}

/**
 * Looks up the SKU for each item directly by product_name (via the products
 * store) and fills each item's sku input with the matched product SKU — only
 * if the item doesn't already carry its own SKU, so the user's value/override
 * is kept.
 */
async function loadSkuValues() {
  const items = props.transactionItems
  const names = [...new Set(items.map((i) => (i.product_name || '').trim()).filter(Boolean))]

  if (names.length) {
    const skuByName = await productsStore.fetchSkusByProductNames(names)

    for (const item of items) {
      const key = (item.product_name || '').trim().toLowerCase()
      const matchedSku = key ? skuByName.get(key) ?? '' : ''
      // Populate the input directly, keeping any SKU the user typed/saved first.
      if (matchedSku && !item.sku?.toString().trim()) {
        item.sku = matchedSku
      }
    }
  }

  for (const item of items) {
    if (!item.sku?.toString().trim()) {
      skuInputItemIds.value[item.id] = true
    }
  }
}

function itemIdentityKey(): string {
  return props.transactionItems.map((item) => `${item.id}:${item.product_name ?? ''}`).join('|')
}

// Reload whenever the item rows change (e.g. the dialog opens with the PO/PR).
watch(
  [() => props.transactionItems, itemIdentityKey],
  () => loadSkuValues(),
  { immediate: true },
)

// Track which expiry month picker menu is currently open (keyed by item row).
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

function expiryDateOf(item: PRItem): Date | null {
  return item.expiry_date ? fromLocalISODate(item.expiry_date) : null
}

// Text shown in the expiry field. Empty returns '' so the MM/YYYY
// placeholder is visible, otherwise renders as MM/YYYY (e.g. "09/2031").
function expiryFieldText(item: PRItem, index: number): string {
  if (editingExpiry.value?.index === index) return editingExpiry.value.text
  const date = expiryDateOf(item)
  return date ? formatExpiryMonthYear(date) : ''
}

// Build a local-timezone-safe "YYYY-MM-DD" string for the last day of the
// selected month (the same expiry storage convention used elsewhere in the app).
function expiryDateString(year: number, month0: number): string {
  const lastDay = new Date(year, month0 + 1, 0).getDate()
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function setExpiryMonth(item: PRItem, year: number, monthIndex: number) {
  item.expiry_date = expiryDateString(year, monthIndex)
  expiryPickerYear.value = year
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
          <th class="text-white text-center" style="width: 130px">SKU</th>
          <th class="text-white text-center" style="width: 130px">ACTUAL COUNT</th>
          <th class="text-white text-center" style="width: 130px">BATCH NO</th>
          <th class="text-white text-center" style="width: 150px">EXPIRY</th>
        </tr>
      </thead>

      <tbody>
        <tr v-if="transactionItems.length === 0">
          <td colspan="8" class="text-center pa-4">No items found.</td>
        </tr>

        <tr v-for="(item, index) in transactionItems" :key="item.id">
          <td>{{ index + 1 }}</td>
          <td>{{ item.product_name ?? '—' }}</td>
          <td class="text-right">{{ formatCurrency(item.cost_per_unit ?? 0) }}</td>
          <td class="text-right">
            {{ formatCurrency((item.qty ?? 0) * (item.cost_per_unit ?? 0)) }}
          </td>
          <td class="text-center" style="width: 130px">
            <v-text-field
              v-if="skuEditMode && needsSkuInput(item)"
              v-model="item.sku"
              density="compact"
              variant="outlined"
              hide-details
              placeholder="Enter SKU"
              autocomplete="off"
              style="width: 120px"
            />
            <v-chip
              v-else-if="skuEditMode"
              :color="item.sku ? 'green' : 'error'"
              variant="tonal"
              size="small"
              label
            >
              {{ item.sku || 'No SKU' }}
            </v-chip>
            <span v-else>{{ item.sku ?? '—' }}</span>
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
              autocomplete="off"
              class="input-number"
              style="width: 120px"
            />
            <span v-else>{{ item.actual_count_stock_in ?? '—' }}</span>
          </td>
          <td class="text-center" style="width: 130px">
            <v-text-field
              v-if="skuEditMode"
              v-model="item.batch_no"
              density="compact"
              variant="outlined"
              hide-details
              placeholder="Enter batch no"
              autocomplete="off"
              style="width: 120px"
            />
            <span v-else>{{ item.batch_no ?? '—' }}</span>
          </td>
          <td class="text-center" style="width: 150px">
            <v-menu
              v-if="skuEditMode"
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
                  density="compact"
                  variant="outlined"
                  hide-details
                  autocomplete="off"
                  prepend-inner-icon="mdi-calendar-month-outline"
                  style="width: 140px"
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
            <span v-else>{{ formatExpiryMonthYear(item.expiry_date) }}</span>
          </td>
        </tr>

        <tr v-for="n in effectiveEmptyRows" :key="`empty-${n}`">
          <td colspan="8">&nbsp;</td>
        </tr>
      </tbody>

      <tfoot>
        <tr class="bg-grey-lighten-3">
          <td colspan="7" class="text-right font-weight-bold">TOTAL</td>
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
                />
                <div v-else class="d-flex align-center justify-center" style="min-height: 40px;">
                  <v-chip
                    :color="item.sku ? 'green' : 'error'"
                    variant="tonal"
                    size="small"
                    label
                  >
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
                      density="compact"
                      variant="outlined"
                      hide-details
                      autocomplete="off"
                      prepend-inner-icon="mdi-calendar-month-outline"
                      style="width: 100%"
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