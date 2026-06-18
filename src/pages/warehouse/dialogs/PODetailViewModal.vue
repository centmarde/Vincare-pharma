<script setup lang="ts">
import { ref, computed } from 'vue'
import { useToast } from 'vue-toastification'
import { supabase } from '@/lib/supabase'
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import type { PR } from '@/stores/purchaseRequisitionStore'
import { usePODetailModal, company } from '@/pages/purchasing/composables/usePODetailModal'
import { formatCurrency, formatDatePO_Written } from '@/utils/helpers'

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
const savingAll = ref(false)

const { printArea, resolvedSupplier, handlePrint } = usePODetailModal(
  props as any,
  emit as any,
)

// ── Derive items directly from pr.items — no fetch needed ────────────
const transactionItems = computed(() => props.pr?.items ?? [])

const effectiveEmptyRows = computed(() => Math.max(0, 7 - transactionItems.value.length))

const missingSkuCount = computed(() =>
  transactionItems.value.filter(item => !item.sku?.toString().trim()).length
)

// ── Save all SKUs ─────────────────────────────────────────────────────
async function saveAllSkus(): Promise<boolean> {
  const updates = transactionItems.value
    .filter(item => item.id && item.sku?.toString().trim())
    .map(item => ({ id: item.id, sku: item.sku!.toString().trim() }))

  if (updates.length === 0) return true

  savingAll.value = true
  try {
    for (const update of updates) {
      const { error } = await supabase
        .from('products')
        .update({ sku: update.sku })
        .eq('id', update.id)

      if (error) throw error
    }
    return true
  } catch (err: any) {
    toast.error('Failed to save some SKUs.')
    console.error('SKU save error:', err)
    return false
  } finally {
    savingAll.value = false
  }
}

// ── Mark as received ──────────────────────────────────────────────────
async function handleMarkAsReceived() {
  if (missingSkuCount.value > 0) {
    toast.error(`Please fill in SKU for all ${missingSkuCount.value} item(s) before marking as received.`)
    return
  }
  if (props.po?.id == null) {
    toast.error('No purchase order selected.')
    return
  }

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

          <!-- ── Company + PO Title ─────────────────────────────── -->
          <v-row class="mb-4" align="start">
            <v-col>
              <div class="d-flex align-center ga-3 mb-2">
                <v-img src="/vincare.png" max-width="48" max-height="48" contain />
                <div class="text-h6 font-weight-bold mb-1">{{ company.name }}</div>
              </div>
              <div class="text-body-2 text-medium-emphasis">{{ company.address }}</div>
              <div class="text-body-2 text-medium-emphasis">Butuan City</div>
              <div class="text-body-2 text-medium-emphasis">{{ company.contact }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ company.email }}</div>
            </v-col>
            <v-col class="text-right">
              <div class="text-h6 font-weight-bold mb-2">PURCHASE ORDER</div>
              <div class="text-body-2 text-medium-emphasis">
                DATE: {{ formatDatePO_Written(po?.created_at ?? '—') }}
              </div>
              <div class="text-body-2 text-medium-emphasis">
                PR #: {{ pr?.reference_no ?? '—' }}
              </div>
              <div class="text-body-2 text-medium-emphasis">
                PO #:
                <span class="font-weight-bold text-primary">{{ po?.reference_no }}</span>
              </div>
              <div v-if="po?.is_delivered" class="text-body-2 text-green font-weight-bold mt-1">
                <v-icon start size="14">mdi-check-circle</v-icon>
                Delivered
              </div>
            </v-col>
          </v-row>

          <v-divider class="mb-6" />

          <!-- ── Supplier + Ship To ──────────────────────────────── -->
          <v-row class="mb-4">
            <v-col cols="6">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SUPPLIER</div>
              <v-card flat border rounded="lg" class="pa-4">
                <div class="text-body-1 font-weight-medium mb-1">
                  {{ resolvedSupplier?.name ?? '—' }}
                </div>
                <div class="text-body-2 text-medium-emphasis">{{ resolvedSupplier?.address ?? '—' }}</div>
                <div class="text-body-2 text-medium-emphasis">{{ resolvedSupplier?.contact_no ?? '—' }}</div>
                <div class="text-body-2 text-medium-emphasis">{{ resolvedSupplier?.email ?? '—' }}</div>
              </v-card>
            </v-col>
            <v-col cols="6">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SHIP TO</div>
              <v-card flat border rounded="lg" class="pa-4">
                <div class="text-body-1 font-weight-medium mb-1">{{ company.name }}</div>
                <div class="text-body-2 text-medium-emphasis">{{ company.address }}</div>
                <div class="text-body-2 text-medium-emphasis">Butuan City</div>
                <div class="text-body-2 text-medium-emphasis">{{ company.contact }}</div>
                <div class="text-body-2 text-medium-emphasis">{{ company.email }}</div>
              </v-card>
            </v-col>
          </v-row>

          <!-- ── Ship Via / Method / Declared Value ─────────────── -->
          <v-row class="mb-4">
            <v-col cols="4">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SHIP VIA</div>
              <v-card flat border rounded="lg" class="pa-3">
                <div class="text-body-2 font-weight-medium">{{ po?.ship_via ?? '—' }}</div>
              </v-card>
            </v-col>
            <v-col cols="4">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SHIP METHOD</div>
              <v-card flat border rounded="lg" class="pa-3">
                <div class="text-body-2 font-weight-medium">{{ po?.ship_method ?? '—' }}</div>
              </v-card>
            </v-col>
            <v-col cols="4">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">DECLARED VALUE</div>
              <v-card flat border rounded="lg" class="pa-3">
                <div class="text-body-1 font-weight-bold">
                  {{ formatCurrency(po?.total_amount ?? 0) }}
                </div>
              </v-card>
            </v-col>
          </v-row>

          <!-- ── Items Table ─────────────────────────────────────── -->
          <v-table density="compact" class="po-table mb-6 border rounded-lg">
            <thead>
              <tr class="bg-blue-darken-3">
                <th class="text-left text-white font-weight-bold">ITEM #</th>
                <th class="text-left text-white font-weight-bold">DESCRIPTION</th>
                <th class="text-left text-white font-weight-bold">SKU</th>
                <th class="text-right text-white font-weight-bold">UNIT PRICE</th>
                <th class="text-right text-white font-weight-bold">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="transactionItems.length === 0">
                <td colspan="5" class="text-center text-body-2 text-medium-emphasis pa-4">
                  No items found for this purchase order.
                </td>
              </tr>
              <tr v-for="(item, index) in transactionItems" :key="item.id">
                <td>{{ index + 1 }}</td>
                <td>{{ item.item_description ?? '—' }}</td>
                <td>
                  <template v-if="skuEditMode">
                    <div class="d-flex align-center ga-2">
                      <v-text-field
                        v-model="item.sku"
                        density="compact"
                        variant="outlined"
                        hide-details
                        class="sku-input"
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
                          />
                        </template>
                      </v-tooltip>
                    </div>
                  </template>
                  <template v-else>
                    <span class="sku-text">{{ item.sku ?? '—' }}</span>
                  </template>
                </td>
                <td class="text-right">{{ formatCurrency(item.cost_per_unit ?? 0) }}</td>
                <td class="text-right">{{ formatCurrency(item.cost_per_unit ?? 0) }}</td>
              </tr>
              <tr v-for="n in effectiveEmptyRows" :key="`empty-${n}`" class="empty-row">
                <td colspan="5">&nbsp;</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="bg-grey-lighten-3">
                <td colspan="4" class="text-right font-weight-bold">TOTAL</td>
                <td class="text-right font-weight-bold text-subtitle-1">
                  {{ formatCurrency(po?.total_amount ?? 0) }}
                </td>
              </tr>
            </tfoot>
          </v-table>

          <!-- ── Signatures ──────────────────────────────────────── -->
          <v-row class="mb-6">
            <v-col cols="6">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-6">REQUESTED BY:</div>
              <div class="text-body-2 font-weight-medium">{{ pr?.requester_name ?? '—' }}</div>
              <v-divider style="width: 200px" class="mb-1" />
              <div class="text-caption text-medium-emphasis">REQUESTER</div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-6">APPROVED BY:</div>
              <div class="text-body-2 font-weight-medium">{{ pr?.reviewer_name ?? '—' }}</div>
              <v-divider style="width: 200px" class="mb-1" />
              <div class="text-caption text-medium-emphasis">APPROVER</div>
            </v-col>
          </v-row>

        </div>
      </v-card-text>

      <v-divider class="d-print-none" />

      <!-- ── Actions ────────────────────────────────────────────── -->
      <v-card-actions class="pa-4 ga-2 justify-end d-print-none">
        <template v-if="skuEditMode">
          <v-btn
            variant="outlined"
            class="text-none"
            @click="emit('update:modelValue', false)"
          >
            Cancel
          </v-btn>
          <v-btn
            variant="flat"
            color="success"
            class="text-none font-weight-bold"
            :disabled="missingSkuCount > 0 || savingAll"
            :loading="savingAll"
            @click="handleMarkAsReceived"
          >
            <v-icon start size="16">mdi-check-circle</v-icon>
            {{ missingSkuCount > 0 ? `Fill ${missingSkuCount} SKU(s) First` : 'Mark as Received' }}
          </v-btn>
        </template>
        <template v-else>
          <v-btn
            variant="outlined"
            class="text-none"
            @click="emit('update:modelValue', false)"
          >
            Close
          </v-btn>
          <v-btn
            variant="text"
            color="error"
            prepend-icon="mdi-printer"
            class="text-none"
            @click="handlePrint"
          >
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
.sku-text {
  font-family: 'Courier New', monospace;
  font-weight: 500;
}
.sku-input {
  max-width: 140px;
}
.sku-input :deep(.v-field) {
  padding: 0;
}
.sku-input :deep(.v-field__field) input {
  padding: 4px 8px;
  font-size: 0.875rem;
}
</style>