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
import SupplierChargesSummary from '../SupplierChargesSummary.vue'
import type { ProductPickerResult } from '@/stores/productsData'
import { unitOptions } from '../../composables/usePurchaseRequisition'
import type { SupplierPurchaseSummary } from '../../composables/usePurchaseRequisition'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import {
  computePurchaseBreakdown,
  emptySupplierCharges,
} from '@/utils/computationHelpers'
import type { SupplierCharges } from '@/utils/computationHelpers'

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
  save: [data: { items: any[]; remarks: string; charges: SupplierCharges | null }]
  'create-replacement': [
    data: {
      items: any[]
      charges: SupplierCharges | null
      newSupplierId: number
      originalPrId: number
      purchase_requisition_date: string | null
    },
  ]
  'split-save': [
    data: {
      originalRows: any[]
      originalRemarks: string
      originalCharges: SupplierCharges | null
      replacements: {
        items: any[]
        charges: SupplierCharges | null
        newSupplierId: number
        originalPrId: number
        purchase_requisition_date: string | null
      }[]
    },
  ]
}>()

const prStore = usePurchaseRequisitionStore()
const { confirmDialog } = useConfirmDialog()

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

// Tracks charges per supplier, rendering each supplier's summary card automatically.
const localCharges = ref<SupplierCharges[]>([])

// Tracks the original PR to detect supplier changes and revert edits on cancel; confirmed changes create a replacement PR.
const originalSupplierId = ref<number | null>(null)
const originalChargesSnapshot = ref<SupplierCharges[]>([])
const originalItemSuppliers = ref<Map<number, string | null>>(new Map())

function parseSupplierId(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function supplierNameOf(supplierId: number | null): string {
  if (supplierId == null) return '—'
  return activeSuppliers.value.find((s) => s.id === supplierId)?.name ?? `Supplier #${supplierId}`
}

async function loadChargesForPR(prId: number, supplierId: number | null) {
  localCharges.value = []
  if (supplierId == null) return
  try {
    const breakdown = await prStore.fetchPurchaseBreakdown(prId)
    localCharges.value = [
      {
        supplier_id: supplierId,
        discount_percent: breakdown?.discountPercent ?? 0,
        tax_amount: breakdown?.taxAmount ?? 0,
        shipping_amount: breakdown?.shippingAmount ?? 0,
      },
    ]
  } catch {
    localCharges.value = [emptySupplierCharges(supplierId)]
  }
}

// All suppliers currently on the form, in first-seen order — mirrors supplierIdsOnForm in usePurchaseRequisition.
const supplierIdsOnForm = computed<number[]>(() => {
  const ids: number[] = []
  for (const item of items.value) {
    const id = parseSupplierId(item.supplier_id)
    if (id != null && !ids.includes(id)) ids.push(id)
  }
  return ids
})

function netTotalForSupplier(supplierId: number): number {
  return items.value
    .filter((i) => parseSupplierId(i.supplier_id) === supplierId)
    .reduce((sum, i) => sum + (i.qty || 0) * (i.cost_per_unit || 0), 0)
}

// Adds a zeroed charge entry for each new supplier without inheriting another supplier's deal.
function addMissingSupplierCharges() {
  for (const supplierId of supplierIdsOnForm.value) {
    if (!localCharges.value.some((c) => c.supplier_id === supplierId)) {
      localCharges.value.push(emptySupplierCharges(supplierId))
    }
  }
}

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen && props.pr) {
      items.value = props.pr.items.map((item) => ({ ...item }))
      localRemarks.value = props.pr.remarks ?? ''
      expiryMenuOpen.value = {}
      editingExpiry.value = null
      originalSupplierId.value = parseSupplierId(props.pr.supplier_id)
      originalItemSuppliers.value = new Map(
        items.value
          .filter((item) => typeof item.id === 'number')
          .map((item) => [item.id, item.supplier_id ?? null]),
      )
      originalChargesSnapshot.value = []
      await loadChargesForPR(props.pr.id, parseSupplierId(props.pr.supplier_id))
      originalChargesSnapshot.value = localCharges.value.map((c) => ({ ...c }))
    }
  },
  { immediate: true },
)

// Keeps charge entries synced with form suppliers so each gets a summary card immediately.
watch(supplierIdsOnForm, addMissingSupplierCharges)

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

async function save() {
  if (!props.pr) return
  const currentPr = props.pr
  if (
    localCharges.value.some(
      (c) =>
        c.discount_percent < 0 ||
        c.discount_percent > 100 ||
        c.tax_amount < 0 ||
        c.shipping_amount < 0,
    )
  ) {
    toast.error('Discount must be 0–100% and tax/shipping cannot be negative.')
    return
  }
  // Group rows per supplier — like create, each supplier owns its slice and its own charge card. Save semantics per group below.
  const groups = new Map<number, PRItem[]>()
  for (const item of items.value) {
    const sid = parseSupplierId(item.supplier_id)
    if (sid == null) {
      toast.error('Every item needs a supplier before saving.')
      return
    }
    if (!groups.has(sid)) groups.set(sid, [])
    groups.get(sid)!.push(item)
  }
  if (!items.value.length || !groups.size) {
    toast.error('Add at least one item before saving.')
    return
  }

  const chargesFor = (supplierId: number): SupplierCharges => {
    const found = localCharges.value.find((c) => c.supplier_id === supplierId)
    return found ? { ...found } : emptySupplierCharges(supplierId)
  }

  const supplierIds = [...groups.keys()]
  const originalId = originalSupplierId.value

  function revertSupplierEdits() {
    items.value.forEach((item) => {
      if (typeof item.id !== 'number' || !originalItemSuppliers.value.has(item.id)) return
      item.supplier_id = originalItemSuppliers.value.get(item.id) ?? null
    })
    localCharges.value = originalChargesSnapshot.value.map((c) => ({ ...c }))
  }

  // Case 1: single supplier, unchanged → plain update of the original PR.
  if (supplierIds.length === 1 && (originalId == null || supplierIds[0] === originalId)) {
    emit('save', {
      items: [...items.value],
      remarks: localRemarks.value,
      charges: chargesFor(supplierIds[0]),
    })
    close()
    return
  }

  // Case 2: all rows moved to one new supplier → confirm, then a NEW
  // replacement PR. The original transactions row stays pending_approval.
  if (supplierIds.length === 1) {
    const newId = supplierIds[0]
    const ok = await confirmDialog(
      `Change supplier from "${supplierNameOf(originalId)}" to "${supplierNameOf(newId)}"?\n\n` +
        'A NEW requisition for the new supplier will be created and sent for executive approval.\n' +
        `The original PR (${props.pr.requisition_no}) stays Pending Approval — executive will approve one and reject the other.`,
      {
        title: 'Create Replacement PR?',
        confirmText: 'Create New PR',
        cancelText: 'Keep Current',
      },
    )
    if (!ok) {
      revertSupplierEdits()
      return
    }
    emit('create-replacement', {
      items: [...items.value],
      charges: chargesFor(newId),
      newSupplierId: newId,
      originalPrId: currentPr.id,
      purchase_requisition_date: currentPr.purchase_requisition_date ?? null,
    })
    close()
    return
  }

  // Case 3: rows split across suppliers — same as create (one requisition per
  // supplier). The original supplier's slice updates this PR; every other
  // supplier's slice becomes a NEW replacement PR after one confirmation.
  const originalRows = originalId != null ? (groups.get(originalId) ?? []) : []
  if (originalId == null || !originalRows.length) {
    toast.error(
      'Keep at least one item on the original supplier, or move all rows to a single new supplier.',
    )
    return
  }
  const newIds = supplierIds.filter((id) => id !== originalId)
  const newLines = newIds
    .map((id) => {
      const total = computePurchaseBreakdown(
        netTotalForSupplier(id),
        chargesFor(id),
      ).purchaseTotal
      return `• ${supplierNameOf(id)} — ${groups.get(id)!.length} item(s), ${formatCurrency(total)}`
    })
    .join('\n')
  const splitOk = await confirmDialog(
    `Items are split across ${supplierIds.length} suppliers.\n\n` +
      `Saving keeps "${supplierNameOf(originalId)}" (${originalRows.length} item's on this PR (${props.pr.requisition_no}) and creates NEW requisition(s):\n` +
      `${newLines}\n\n` +
      'All new requisitions are sent for executive approval. The original PR stays Pending Approval.',
    {
      title: 'Split Into Multiple PRs?',
      confirmText: 'Save & Create',
      cancelText: 'Keep Editing',
    },
  )
  if (!splitOk) return
  emit('split-save', {
    originalRows: [...originalRows],
    originalRemarks: localRemarks.value,
    originalCharges: chargesFor(originalId),
    replacements: newIds.map((newId) => ({
      items: [...groups.get(newId)!],
      charges: chargesFor(newId),
      newSupplierId: newId,
      originalPrId: currentPr.id,
      purchase_requisition_date: currentPr.purchase_requisition_date ?? null,
    })),
  })
}

const companyCostTotal = computed(() => {
  return items.value.reduce((sum, item) => sum + (item.qty || 0) * (item.cost_per_unit || 0), 0)
})

// Recalculates each supplier's totals live using computePurchaseBreakdown().
const supplierSummaries = computed<SupplierPurchaseSummary[]>(() => {
  return supplierIdsOnForm.value.map((supplierId) => {
    const charges =
      localCharges.value.find((c) => c.supplier_id === supplierId) ??
      emptySupplierCharges(supplierId)
    return {
      ...computePurchaseBreakdown(netTotalForSupplier(supplierId), charges),
      charges,
    }
  })
})

const purchaseGrandTotal = computed(() =>
  supplierSummaries.value.reduce((sum, s) => sum + s.purchaseTotal, 0),
)
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

        <!-- Justification + Save (left) / Supplier charges (right) — mirrors PurchaseRequisitionDialog layout -->
        <v-row align="start">
          <v-col cols="12" md="6" :order="mobile ? 2 : 1" class="d-flex flex-column">
            <label class="text-subtitle-2 font-weight-bold d-block mb-2">Justification / Notes</label>
            <v-textarea
              v-model="localRemarks"
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
              @click="save"
            >
              Save Changes
            </v-btn>
          </v-col>

          <v-col cols="12" md="6" :order="mobile ? 1 : 2">
            <SupplierChargesSummary
              :supplier-summaries="supplierSummaries"
              :suppliers="activeSuppliers"
              :company-cost-total="companyCostTotal"
              :purchase-grand-total="purchaseGrandTotal"
            />
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
