<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useToast } from 'vue-toastification'
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import type { PR } from '@/pages/purchasing/composables/usePurchaseRequisitionList'
import { usePODetailModal, company } from '@/pages/purchasing/composables/usePODetailModal'
import { useTransactionItemsDataStore } from '@/stores/transactionsItemsData'
import { useProductsDataStore } from '@/stores/productsData'
import { formatCurrency, formatDatePO_Written } from '@/utils/helpers'
import { useBarcodeScanner } from '@/pages/admin/components/barcode/composables/barcodeLogic'

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

const toast = useToast()
const transactionItemsStore = useTransactionItemsDataStore()
const productsStore = useProductsDataStore()
const transactionItems = ref<any[]>([])
const loadingItems = ref(false)
const savingAll = ref(false)

// ── Barcode Scanner ──────────────────────────────────────────
const scannerVideoRef = ref<HTMLVideoElement | null>(null)
const showScannerDialog = ref(false)
const scanningForItemIndex = ref<number | null>(null)

const {
  isScanning,
  isCameraReady,
  cameraError,
  lastScannedCode,
  initializeCamera,
  stopScanning,
} = useBarcodeScanner()

// Watch for scanned barcode and update the corresponding item
watch(lastScannedCode, (scanned) => {
  if (scanned && scanningForItemIndex.value !== null) {
    const index = scanningForItemIndex.value
    const item = transactionItems.value[index]
    if (item?.product) {
      item.product.sku = scanned.code
      toast.success(`Scanned: ${scanned.code}`)
    }
    closeScanner()
  }
})

function openScanner(itemIndex: number) {
  scanningForItemIndex.value = itemIndex
  showScannerDialog.value = true
  nextTick(async () => {
    await initializeCamera(scannerVideoRef)
  })
}

function closeScanner() {
  showScannerDialog.value = false
  scanningForItemIndex.value = null
  stopScanning()
}

const { printArea, poNumber, resolvedSupplier, handlePrint } = usePODetailModal(
  props as any,
  emit as any,
)

// Override emptyRows to use real transaction items data
const effectiveEmptyRows = computed(() => Math.max(0, 7 - (transactionItems.value.length ?? 0)))

// Check if all items have SKU filled
const missingSkuCount = computed(() => {
  return transactionItems.value.filter(item => !item.product?.sku?.toString().trim()).length
})

// Check if all items have actual_count filled
const missingActualCount = computed(() => {
  return transactionItems.value.filter(item => {
    const val = item.product?.actual_count
    return val == null || val === '' || Number(val) <= 0
  }).length
})

// Fetch transaction items when the dialog opens
watch(
  () => props.modelValue,
  async (val) => {
    if (val && props.po?.id) {
      loadingItems.value = true
      try {
        const items = await transactionItemsStore.fetchTransactionItems({
          transaction_id: props.po.id,
        })
        transactionItems.value = items || []
      } catch {
        transactionItems.value = []
      } finally {
        loadingItems.value = false
      }
    }
  },
)

// Save all SKUs and actual_count to the database at once
async function saveAllSkus() {
  const updates: { id: number; sku: string; actual_count: number }[] = []

  for (const item of transactionItems.value) {
    const productId = item.product?.id
    const skuValue = item.product?.sku?.toString().trim()
    const actualCountValue = Number(item.product?.actual_count)
    if (productId && skuValue && actualCountValue > 0) {
      updates.push({ id: productId, sku: skuValue, actual_count: actualCountValue })
    }
  }

  if (updates.length === 0) return true

  savingAll.value = true
  try {
    for (const update of updates) {
      const result = await productsStore.updateProduct(update.id, {
        sku: update.sku,
        actual_count: update.actual_count,
      })
      if (!result) throw new Error(`Failed to update product ID ${update.id}`)
    }
    return true
  } catch (err: any) {
    toast.error('Failed to save some SKUs')
    console.error('SKU save error:', err)
    return false
  } finally {
    savingAll.value = false
  }
}

// Mark as received — saves all SKUs first, then emits
async function handleMarkAsReceived() {
  if (missingSkuCount.value > 0) {
    toast.error(`Please fill in SKU for all ${missingSkuCount.value} item(s) before marking as received.`)
    return
  }
  if (missingActualCount.value > 0) {
    toast.error(`Please fill in Actual Count for all ${missingActualCount.value} item(s) before marking as received.`)
    return
  }
  if (props.po?.id == null) {
    toast.error('No purchase order selected.')
    return
  }

  // Save all SKUs first
  const saved = await saveAllSkus()
  if (!saved) return

  toast.success('All SKUs saved successfully.')
  emit('mark-received', props.po.id)
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
                <th class="text-right text-white font-weight-bold">UNIT PRICE</th>
                <th class="text-right text-white font-weight-bold">TOTAL</th>
                <th class="text-center text-white font-weight-bold" style="min-width: 140px;">ACTUAL COUNT</th>
                <th class="text-center text-white font-weight-bold" style="min-width: 150px;">SKU</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingItems">
                <td colspan="6" class="text-center text-body-2 text-medium-emphasis pa-4">
                  <v-progress-circular indeterminate size="20" width="2" class="mr-2" />
                  Loading items...
                </td>
              </tr>
              <tr v-else-if="transactionItems.length === 0">
                <td colspan="6" class="text-center text-body-2 text-medium-emphasis pa-4">
                  No items found for this purchase order.
                </td>
              </tr>
              <tr
                v-for="(item, index) in transactionItems"
                :key="item.id"
              >
                <td>{{ index + 1 }}</td>
                <td>{{ item.product?.product_name ?? item.product?.item_decription ?? '—' }}</td>
                <td class="text-right">
                  {{ formatCurrency(item.product?.cost_per_unit ?? 0) }}
                </td>
                <td class="text-right">
                  {{ formatCurrency(item.product?.cost_per_unit ?? 0) }}
                </td>
                <td class="text-center">
                  <template v-if="skuEditMode">
                    <v-text-field
                      v-model.number="item.product.actual_count"
                      type="number"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="editor-input"
                      placeholder="Enter qty"
                      min="1"
                    />
                  </template>
                  <template v-else>
                    <span>{{ item.product?.actual_count ?? '—' }}</span>
                  </template>
                </td>
                <td class="text-center">
                  <template v-if="skuEditMode">
                    <div class="d-flex align-center ga-2 justify-center">
                      <v-text-field
                        v-model="item.product.sku"
                        density="compact"
                        variant="outlined"
                        hide-details
                        class="editor-input"
                        placeholder="Enter SKU"
                      />
                      <v-tooltip text="Scan barcode" location="top">
                        <template #activator="{ props: tipProps }">
                          <v-btn
                            v-bind="tipProps"
                            icon="mdi-barcode-scan"
                            size="small"
                            variant="text"
                            color="primary"
                            title="Scan barcode"
                            @click="openScanner(index)"
                          />
                        </template>
                      </v-tooltip>
                    </div>
                  </template>
                  <template v-else>
                    <span class="sku-text">
                      {{ item.product?.sku ?? item.product?.barcode ?? '—' }}
                    </span>
                  </template>
                </td>
              </tr>
              <tr v-for="n in effectiveEmptyRows" :key="`empty-${n}`" class="empty-row">
                <td colspan="6">&nbsp;</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="po-table-total bg-grey-lighten-3">
                <td colspan="3" class="text-right font-weight-bold">TOTAL</td>
                <td colspan="3" class="text-center font-weight-bold text-subtitle-1">
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
        <template v-if="skuEditMode">
          <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">
            Cancel
          </v-btn>
          <v-btn
            variant="flat"
            color="success"
            class="text-none font-weight-bold"
            :disabled="missingSkuCount > 0 || missingActualCount > 0 || savingAll"
            :loading="savingAll"
            @click="handleMarkAsReceived"
          >
            <v-icon start size="16">mdi-check-circle</v-icon>
            {{
              missingSkuCount > 0
                ? `Fill ${missingSkuCount} SKU(s) First`
                : missingActualCount > 0
                  ? `Fill ${missingActualCount} Actual Count(s) First`
                  : 'Mark as Received'
            }}
          </v-btn>
        </template>
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

    <!-- ── Barcode Scanner Dialog ─────────────────────────────── -->
    <v-dialog
      v-model="showScannerDialog"
      max-width="480"
      persistent
      @click:outside="closeScanner"
    >
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2">mdi-barcode-scan</v-icon>
          Scan Barcode
          <v-spacer />
          <v-btn
            icon="mdi-close"
            size="small"
            variant="text"
            @click="closeScanner"
          />
        </v-card-title>

        <v-card-text>
          <!-- Camera Error -->
          <v-alert
            v-if="cameraError"
            type="error"
            variant="tonal"
            class="mb-3"
            :text="cameraError"
          />

          <!-- Scanner Feed -->
          <div class="scanner-dialog-container">
            <video
              ref="scannerVideoRef"
              class="scanner-dialog-video"
              :class="{ 'scanner-dialog-video--hidden': !isCameraReady }"
              playsinline
              muted
            />

            <!-- Overlay -->
            <div v-if="isScanning && isCameraReady" class="scanner-dialog-overlay">
              <div class="scanner-dialog-region">
                <div class="scanner-dialog-line" />
                <div class="scan-corner scan-corner--tl" />
                <div class="scan-corner scan-corner--tr" />
                <div class="scan-corner scan-corner--bl" />
                <div class="scan-corner scan-corner--br" />
              </div>
              <div class="scanner-dialog-hint">Point the camera at a barcode</div>
            </div>

            <!-- Loading -->
            <div v-if="!isScanning && !cameraError" class="scanner-dialog-placeholder">
              <v-progress-circular indeterminate size="32" color="primary" />
              <p class="text-grey mt-3">Starting camera...</p>
            </div>
          </div>
        </v-card-text>

        <v-card-actions class="pa-4 justify-end">
          <v-btn
            variant="text"
            class="text-none"
            @click="closeScanner"
          >
            Cancel
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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

.sku-text {
  font-family: 'Courier New', monospace;
  font-weight: 500;
}

.editor-input {
  max-width: 130px;
  width: 130px;
}

.editor-input :deep(.v-field) {
  padding: 0;
}

.editor-input :deep(.v-field__field) input {
  padding: 4px 8px;
  font-size: 0.875rem;
}

/* ── Barcode Scanner Dialog Styles ─────────────────────────── */
.scanner-dialog-container {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scanner-dialog-video {
  width: 100%;
  height: 100%;
  object-fit: cover;

  &--hidden {
    opacity: 0;
    position: absolute;
  }
}

.scanner-dialog-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.scanner-dialog-region {
  position: relative;
  width: 70%;
  height: 40%;
}

.scanner-dialog-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgb(var(--v-theme-primary)) 50%,
    transparent 100%
  );
  animation: scanner-dialog-line-move 2s ease-in-out infinite;
  box-shadow: 0 0 8px rgb(var(--v-theme-primary));
}

@keyframes scanner-dialog-line-move {
  0% {
    top: 0;
  }
  50% {
    top: calc(100% - 2px);
  }
  100% {
    top: 0;
  }
}

.scan-corner {
  position: absolute;
  width: 24px;
  height: 24px;
  border-color: rgb(var(--v-theme-primary));
  border-style: solid;

  &--tl {
    top: 0;
    left: 0;
    border-width: 3px 0 0 3px;
  }

  &--tr {
    top: 0;
    right: 0;
    border-width: 3px 3px 0 0;
  }

  &--bl {
    bottom: 0;
    left: 0;
    border-width: 0 0 3px 3px;
  }

  &--br {
    bottom: 0;
    right: 0;
    border-width: 0 3px 3px 0;
  }
}

.scanner-dialog-hint {
  position: absolute;
  bottom: 16px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.85rem;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}

.scanner-dialog-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
}
</style>
