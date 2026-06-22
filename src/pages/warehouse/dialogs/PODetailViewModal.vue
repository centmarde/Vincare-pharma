<script setup lang="ts">
import { usePODetailModal, company } from '@/pages/purchasing/composables/usePODetailModal'
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import { formatCurrency, formatDatePO_Written } from '@/utils/helpers'
import { useProductsDataStore } from '@/stores/productsData'
import type { PR } from '@/stores/transactionsData'
import { useToast } from 'vue-toastification'
import { ref, computed } from 'vue'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()

const props = defineProps<{
  modelValue: boolean
  po: PurchaseOrder | null
  pr: PR | null
  skuEditMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'mark-received', poId: number): void
}>()
const productsStore = useProductsDataStore()
const toast = useToast()
const savingAll = ref(false)
const { printArea, uniqueSuppliers, handlePrint } = usePODetailModal(props as any, emit as any)
const transactionItems = computed(() => props.pr?.items ?? [])
const effectiveEmptyRows = computed(() => Math.max(0, 7 - transactionItems.value.length))
const missingSkuCount = computed(
  () => transactionItems.value.filter((item) => !item.sku?.toString().trim()).length,
)
const missingActualCount = computed(
  () =>
    transactionItems.value.filter((item) => {
      const value = item.actual_count

      return value == null || Number(value) <= 0
    }).length,
)
async function saveAllItems(): Promise<boolean> {
  const updates = transactionItems.value
    .filter(
      (item) => item.product_id && item.sku?.toString().trim() && Number(item.actual_count) > 0,
    )
    .map((item) => ({
      product_id: item.product_id!,
      sku: item.sku!.toString().trim(),
      actual_count: Number(item.actual_count),
    }))

  if (!updates.length) return true

  savingAll.value = true
  try {
    const success = await productsStore.updateProductSkuAndCount(updates)
    if (!success) toast.error('Failed saving product information.')
    return success
  } finally {
    savingAll.value = false
  }
}
async function handleMarkAsReceived() {
  if (missingSkuCount.value > 0) {
    toast.error(`Please fill in SKU for all ${missingSkuCount.value} item(s).`)
    return
  }
  if (missingActualCount.value > 0) {
    toast.error(`Please fill in Actual Count for all ${missingActualCount.value} item(s).`)
    return
  }
  if (props.po?.id == null) {
    toast.error('No purchase order selected.')
    return
  }
  const saved = await saveAllItems()
  if (!saved) {
    return
  }
  toast.success('All items saved successfully.')
  emit('mark-received', props.po.id)
}
</script>
<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="mobile ? '95%' : '860'"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card flat rounded="lg" class="print-area">
      <v-card-text :class="mobile ? 'pa-3 pb-0' : 'pa-8 pb-0'">
        <!-- Close button -->
        <div class="d-flex justify-end mb-2" :class="mobile ? '' : 'd-print-none'">
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            color="grey"
            @click="emit('update:modelValue', false)"
          />
        </div>

        <div ref="printArea">
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
          <v-row class="mb-4">
            <v-col :cols="mobile ? 12 : 6" :class="mobile ? 'mb-3' : ''">
              <div :class="mobile ? 'text-caption font-weight-bold mb-1' : 'text-caption font-weight-bold mb-2'">SUPPLIER</div>
              <v-card flat border rounded="lg" :class="mobile ? 'pa-3' : 'pa-4'">
                <div v-for="supplier in uniqueSuppliers" :key="supplier.id">
                  <div class="font-weight-medium">{{ supplier.name }}</div>
                  <div :class="mobile ? 'text-caption' : 'text-body-2'">{{ supplier.address ?? '—' }}</div>
                  <div :class="mobile ? 'text-caption' : 'text-body-2'">{{ supplier.contact_no ?? '—' }}</div>
                </div>
              </v-card>
            </v-col>

            <v-col :cols="mobile ? 12 : 6">
              <div :class="mobile ? 'text-caption font-weight-bold mb-1' : 'text-caption font-weight-bold mb-2'">SHIP TO</div>
              <v-card flat border rounded="lg" :class="mobile ? 'pa-3' : 'pa-4'">
                <div class="font-weight-medium">{{ company.name }}</div>
                <div :class="mobile ? 'text-caption' : 'text-body-2'">{{ company.address }}</div>
                <div :class="mobile ? 'text-caption' : 'text-body-2'">Butuan City</div>
                <div :class="mobile ? 'text-caption' : 'text-body-2'">{{ company.contact }}</div>
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
                <th class="text-white text-center" style="width: 130px">ACTUAL COUNT</th>
                <th class="text-white text-center" style="width: 130px">SKU</th>
              </tr>
            </thead>

            <tbody>
              <tr v-if="transactionItems.length === 0">
                <td colspan="6" class="text-center pa-4">No items found.</td>
              </tr>

              <tr v-for="(item, index) in transactionItems" :key="item.id">
                <td>{{ index + 1 }}</td>
                <td>{{ item.item_description ?? '—' }}</td>
                <td class="text-right">{{ formatCurrency(item.cost_per_unit ?? 0) }}</td>
                <td class="text-right">
                  {{ formatCurrency((item.qty ?? 0) * (item.cost_per_unit ?? 0)) }}
                </td>
                <td class="text-center" style="width: 130px">
                  <v-text-field
                    v-if="skuEditMode"
                    v-model.number="item.actual_count"
                    type="number"
                    density="compact"
                    variant="outlined"
                    hide-details
                    min="1"
                    class="input-number"
                    style="width: 120px"
                  />
                  <span v-else>{{ item.actual_count ?? '—' }}</span>
                </td>
                <td class="text-center" style="width: 130px">
                  <v-text-field
                    v-if="skuEditMode"
                    v-model="item.sku"
                    density="compact"
                    variant="outlined"
                    hide-details
                    placeholder="Enter SKU"
                    style="width: 120px"
                  />
                  <span v-else>{{ item.sku ?? '—' }}</span>
                </td>
              </tr>

              <tr v-for="n in effectiveEmptyRows" :key="`empty-${n}`">
                <td colspan="6">&nbsp;</td>
              </tr>
            </tbody>

            <tfoot>
              <tr class="bg-grey-lighten-3">
                <td colspan="5" class="text-right font-weight-bold">TOTAL</td>
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
                <div class="d-flex justify-space-between align-start mb-1">
                  <div class="d-flex ga-2 align-center">
                    <span class="text-caption font-weight-bold text-primary">#{{ index + 1 }}</span>
                    <span class="text-caption font-weight-medium">{{ item.item_description ?? '—' }}</span>
                  </div>
                </div>
                <v-divider class="my-1" />
                <div class="d-flex flex-wrap ga-3 text-caption">
                  <div><span class="text-medium-emphasis">Price: </span>{{ formatCurrency(item.cost_per_unit ?? 0) }}</div>
                  <div><span class="text-medium-emphasis">Total: </span><span class="font-weight-medium">{{ formatCurrency((item.qty ?? 0) * (item.cost_per_unit ?? 0)) }}</span></div>
                  <div class="d-flex align-center ga-2">
                    <span>
                      <span class="text-medium-emphasis">Actual: </span>
                      <template v-if="skuEditMode">
                        <v-text-field
                          v-model.number="item.actual_count"
                          type="number"
                          density="compact"
                          variant="outlined"
                          hide-details
                          min="1"
                          class="input-number"
                          style="width: 70px; display: inline-flex; vertical-align: middle"
                        />
                      </template>
                      <template v-else>
                        <span>{{ item.actual_count ?? '—' }}</span>
                      </template>
                    </span>
                  </div>
                  <div class="d-flex align-center ga-2">
                    <span>
                      <span class="text-medium-emphasis">SKU: </span>
                      <template v-if="skuEditMode">
                        <v-text-field
                          v-model="item.sku"
                          density="compact"
                          variant="outlined"
                          hide-details
                          placeholder="SKU"
                          style="width: 80px; display: inline-flex; vertical-align: middle"
                        />
                      </template>
                      <template v-else>
                        <span>{{ item.sku ?? '—' }}</span>
                      </template>
                    </span>
                  </div>
                </div>
              </v-card-text>
            </v-card>
            <v-card variant="outlined" rounded="lg" class="bg-grey-lighten-3">
              <v-card-text class="pa-3 d-flex justify-space-between text-caption font-weight-bold">
                <span>TOTAL</span>
                <span>{{ formatCurrency(po?.total_amount ?? 0) }}</span>
              </v-card-text>
            </v-card>
          </div>

          <!-- Signatures -->
          <v-row class="mb-6">
            <v-col :cols="mobile ? 6 : 6">
              <div :class="mobile ? 'text-caption font-weight-bold mb-3' : 'text-caption font-weight-bold mb-6'">REQUESTED BY:</div>
              <div :class="mobile ? 'text-caption' : 'text-body-2'">{{ pr?.requester_name ?? '—' }}</div>
            </v-col>
            <v-col :cols="mobile ? 6 : 6">
              <div :class="mobile ? 'text-caption font-weight-bold mb-3' : 'text-caption font-weight-bold mb-6'">APPROVED BY:</div>
              <div :class="mobile ? 'text-caption' : 'text-body-2'">{{ pr?.reviewer_name ?? '—' }}</div>
            </v-col>
          </v-row>
        </div>
      </v-card-text>

      <v-divider class="d-print-none" />

      <!-- Actions -->
      <v-card-actions :class="mobile ? 'pa-3 ga-2 flex-wrap' : 'pa-4 justify-end'">
        <div
          v-if="skuEditMode && (missingSkuCount > 0 || missingActualCount > 0)"
          :class="mobile ? 'text-caption text-medium-emphasis w-100 mb-2' : 'text-body-2 text-medium-emphasis'"
        >
          <v-icon size="16" color="error" class="mr-1">mdi-alert-circle-outline</v-icon>
          {{ missingSkuCount }} SKU{{ missingSkuCount !== 1 ? 's' : '' }} and
          {{ missingActualCount }} actual count{{ missingActualCount !== 1 ? 's' : '' }} missing
        </div>

        <v-spacer v-if="!mobile" />
        <template v-if="skuEditMode">
          <v-btn variant="outlined" size="small" class="text-none" @click="emit('update:modelValue', false)">Cancel</v-btn>
          <v-btn
            color="success"
            variant="flat"
            size="small"
            :loading="savingAll"
            :disabled="missingSkuCount > 0 || savingAll"
            @click="handleMarkAsReceived"
          >
            <template v-if="missingSkuCount > 0">
              Input SKU ({{ missingSkuCount + missingActualCount }})
            </template>
            <template v-else> Mark as Received </template>
          </v-btn>
        </template>

        <template v-else>
          <v-btn variant="outlined" size="small" class="text-none" @click="emit('update:modelValue', false)">Close</v-btn>
          <v-btn variant="text" size="small" color="error" prepend-icon="mdi-printer" @click="handlePrint">
            Print Document
          </v-btn>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
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
.empty-row td {
  height: 32px !important;
}
.sku-text {
  font-family: 'Courier New', monospace;
  font-weight: 500;
}
.input-number :deep(input[type="number"]) {
  -moz-appearance: textfield;
}
.input-number :deep(input[type="number"]::-webkit-outer-spin-button),
.input-number :deep(input[type="number"]::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}
</style>