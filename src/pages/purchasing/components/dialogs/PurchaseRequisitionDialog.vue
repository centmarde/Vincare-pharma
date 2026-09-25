<script setup lang="ts">
import { usePurchaseRequisition } from '../../composables/usePurchaseRequisition'
import type { ReorderPrefillItem } from '../../composables/usePurchaseRequisition'
import type { ProductPickerResult } from '@/stores/productsData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import ProductPickerDialog from '@/components/products/ProductPicker.vue'
import PurchaseRequisitionItems from '../PurchaseRequisitionItems.vue'
import SupplierChargesSummary from '../SupplierChargesSummary.vue'
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
        <PurchaseRequisitionItems
          :items="items"
          :suppliers="activeSuppliers"
          @remove-item="removeItem"
          @unlink-product="unlinkPickedProduct"
          @pick-product="openProductPicker"
        />

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
            <SupplierChargesSummary
              :supplier-summaries="supplierSummaries"
              :suppliers="activeSuppliers"
              :company-cost-total="companyCostTotal"
              :purchase-grand-total="purchaseGrandTotal"
            />
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
</style>
