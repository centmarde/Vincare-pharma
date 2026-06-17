<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useToast } from 'vue-toastification'
import { supabase } from '@/lib/supabase'
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import type { PR } from '@/pages/purchasing/composables/usePurchaseRequisitionList'
import { usePODetailModal, company } from '@/pages/purchasing/composables/usePODetailModal'
import { formatCurrency, formatDatePO_Written } from '@/utils/helpers'

const props = defineProps<{
  modelValue: boolean
  po: PurchaseOrder | null
  pr: PR | null
  skuValidationMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'validate-and-continue'): void
  (e: 'save-all-and-continue'): void
}>()

// Computed property to count missing SKUs
const missingSkuCount = computed(() => {
  if (!props.pr?.items) return 0
  return props.pr.items.filter((item) => !item.SKU).length
})

const toast = useToast()

const { printArea, poNumber, emptyRows, resolvedSupplier, handlePrint } = usePODetailModal(
  props,
  emit,
)

// Track saving state for each item
const savingItems = ref<Record<number, boolean>>({})

// Track original SKU values to detect changes
const originalSkuValues = ref<Record<number, number | null | undefined>>({})

// Initialize original SKU values when pr changes
watch(
  () => props.pr?.items,
  (items) => {
    if (items) {
      items.forEach((item) => {
        originalSkuValues.value[item.id] = item.SKU ?? null
      })
    }
  },
  { immediate: true },
)

// Save SKU for a specific item to the database
async function saveSku(itemId: number) {
  const item = props.pr?.items.find((i) => i.id === itemId)
  if (!item) return

  const originalSku = originalSkuValues.value[itemId]
  const newSku = item.SKU

  if (newSku === originalSku) return // No change

  savingItems.value[itemId] = true

  try {
    // Update the product's SKU in the database
    const { error: updateError } = await supabase
      .from('products')
      .update({ sku: String(newSku) })
      .eq('id', item.product_id)

    if (updateError) throw updateError

    // Update local original value after successful save
    originalSkuValues.value[itemId] = newSku
  } catch (err: any) {
    console.error('Error saving SKU:', err)
    toast.error('Failed to save SKU')
    if (item) item.SKU = originalSku
  } finally {
    savingItems.value[itemId] = false
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="860"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card flat rounded="lg" class="print-area">
      <v-card-text class="pa-8 pb-0">
        <div ref="printArea">
          <!-- ── Company + PO Title ──────────────────────────────── -->
          <v-row class="mb-4" align="start">
            <v-col>
              <div class="d-flex align-center ga-3 mb-2">
                <v-img src="/vincare.png" max-width="48" max-height="48" contain />
                <div class="text-h6 font-weight-bold mb-1 text-medium">{{ company.name }}</div>
              </div>
              <div class="text-body-2 text-medium-emphasis">{{ company.address }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ company.city }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ company.contact }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ company.email }}</div>
            </v-col>
            <v-col class="text-right">
              <div class="text-h6 font-weight-bold mb-2 text-medium">PURCHASE ORDER</div>
              <div class="text-body-2 text-medium-emphasis">
                DATE: {{ formatDatePO_Written(po?.issued_at ?? '—') }}
              </div>
              <div class="text-body-2 text-medium-emphasis">PR #: {{ pr?.pr_number ?? '—' }}</div>
              <div class="text-body-2 text-medium-emphasis">
                PO #: <span class="font-weight-bold text-primary">{{ po?.po_number }}</span>
              </div>
              <!-- I want this to have to appear only if the status is delivered -->
              <div v-if="po?.is_delivered" class="text-body-2 text-green font-weight-bold mt-1">
                <v-icon start size="14">mdi-check-circle</v-icon>
                Delivered
              </div>
            </v-col>
          </v-row>

          <v-divider class="mb-6" />

          <!-- ── Supplier + Ship To ───────────────────────────────── -->
          <v-row class="mb-4">
            <v-col cols="6">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SUPPLIER</div>
              <v-card flat border rounded="lg" class="pa-4 bg-white">
                <div class="text-body-1 font-weight-medium mb-1">
                  {{ resolvedSupplier?.name ?? '—' }}
                </div>
                <div class="text-body-2 text-medium text-black">
                  {{ resolvedSupplier?.address ?? '—' }}
                </div>
                <div class="text-body-2 text-medium text-black">
                  {{ resolvedSupplier?.city ?? '—' }}
                </div>
                <div class="text-body-2 text-medium text-black">
                  {{ resolvedSupplier?.contact_no ?? '—' }}
                </div>
                <div class="text-body-2 text-medium text-black">
                  {{ resolvedSupplier?.email ?? '—' }}
                </div>
              </v-card>
            </v-col>
            <v-col cols="6">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SHIP TO</div>
              <v-card flat border rounded="lg" class="pa-4 bg-white">
                <div class="text-body-1 font-weight-medium mb-1">{{ company.name }}</div>
                <div class="text-body-2 text-medium text-black">{{ company.address }}</div>
                <div class="text-body-2 text-medium text-black">{{ company.city }}</div>
                <div class="text-body-2 text-medium text-black">{{ company.contact }}</div>
                <div class="text-body-2 text-medium text-black">{{ company.email }}</div>
              </v-card>
            </v-col>
          </v-row>

          <!-- ── Ship Via / Method / Declared Value ────────────── -->
          <v-row class="mb-4">
            <v-col cols="4">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SHIP VIA</div>
              <v-card flat border rounded="lg" class="pa-3 bg-white">
                <div class="text-body-2 font-weight-medium">{{ po?.ship_via ?? '—' }}</div>
              </v-card>
            </v-col>
            <v-col cols="4">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SHIP METHOD</div>
              <v-card flat border rounded="lg" class="pa-3 bg-white">
                <div class="text-body-2 font-weight-medium">{{ po?.ship_method ?? '—' }}</div>
              </v-card>
            </v-col>
            <v-col cols="4">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">
                DECLARED VALUE
              </div>
              <v-card flat border rounded="lg" class="pa-3 bg-white">
                <div class="text-body-1 font-weight-bold text-black">
                  {{ formatCurrency(po?.declared_value ?? 0) }}
                </div>
              </v-card>
            </v-col>
          </v-row>

          <!-- ── Items Table ────────────────────────────────────── -->
          <v-table density="compact" class="po-table mb-6 border rounded-lg">
            <thead>
              <tr class="po-table-header bg-blue-darken-3">
                <th class="text-left text-white font-weight-bold">ITEM #</th>
                <th class="text-left text-white font-weight-bold">DESCRIPTION</th>
                <th class="text-left text-white font-weight-bold">SKU</th>
                <th class="text-right text-white font-weight-bold">UNIT PRICE</th>
                <th class="text-right text-white font-weight-bold">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pr?.items" :key="item.id">
                <td>{{ item.no }}</td>
                <td>{{ item.item_description }}</td>
                <td>
                  <div class="d-flex align-center ga-2">
                    <v-text-field
                      v-model.number="item.SKU"
                      type="number"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="sku-input"
                      placeholder="Enter SKU"
                    />
                    <v-btn
                      icon="mdi-content-save"
                      size="small"
                      variant="text"
                      color="primary"
                      :loading="savingItems[item.id]"
                      :disabled="savingItems[item.id]"
                      @click="saveSku(item.id)"
                      title="Save SKU"
                    />
                  </div>
                </td>
                <td class="text-right">{{ formatCurrency(item.cost_per_unit) }}</td>
                <td class="text-right">{{ formatCurrency(item.qty * item.cost_per_unit) }}</td>
              </tr>
              <tr v-for="n in emptyRows" :key="`empty-${n}`" class="empty-row">
                <td colspan="5">&nbsp;</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="po-table-total bg-grey-lighten-3">
                <td colspan="4" class="text-right font-weight-bold">TOTAL</td>
                <td class="text-right font-weight-bold text-subtitle-1">
                  {{ formatCurrency(po?.declared_value ?? 0) }}
                </td>
              </tr>
            </tfoot>
          </v-table>

          <!-- ── Signatures ─────────────────────────────────────── -->
          <v-row class="mb-6">
            <v-col cols="6">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-6">
                REQUESTED BY:
              </div>
              <div class="text-body-2 font-weight-medium">{{ pr?.requester_name ?? '—' }}</div>
              <v-divider style="width: 200px" class="mb-1" />
              <div class="text-caption text-medium-emphasis">REQUESTER</div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-6">
                APPROVED BY:
              </div>
              <div class="text-body-2 font-weight-medium">{{ pr?.reviewer_name ?? '—' }}</div>
              <v-divider style="width: 200px" class="mb-1" />
              <div class="text-caption text-medium-emphasis">APPROVER</div>
            </v-col>
          </v-row>
        </div>
      </v-card-text>

      <v-divider class="d-print-none" />

      <!-- ── Actions ───────────────────────────────────────────── -->
      <v-card-actions class="pa-4 ga-2 justify-end d-print-none">
        <!-- SKU Validation Mode Actions -->
        <template v-if="skuValidationMode">
          <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">
            Cancel
          </v-btn>
          <v-btn
            variant="flat"
            color="primary"
            class="text-none"
            :disabled="missingSkuCount > 0"
            @click="emit('validate-and-continue')"
          >
            {{
              missingSkuCount > 0 ? `Fill ${missingSkuCount} SKU(s) First` : 'Continue to Confirm'
            }}
          </v-btn>
        </template>
        <!-- Normal Mode Actions -->
        <template v-else>
          <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">
            Close
          </v-btn>
          <v-btn variant="text" color="error" prepend-icon="mdi-printer" @click="handlePrint">
            Print Document
          </v-btn>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.po-table th {
  height: 38px !important;
}

.empty-row td {
  height: 32px !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05) !important;
}

.sku-input {
  max-width: 120px;
}

.sku-input :deep(.v-field) {
  padding: 0;
}

.sku-input :deep(.v-field__field) input {
  padding: 4px 8px;
  font-size: 0.875rem;
}

/* @media print {
  .d-print-none {
    display: none !important;
  }
  .print-area {
    box-shadow: none !important;
    padding: 0 !important;
  }
} */
</style>
