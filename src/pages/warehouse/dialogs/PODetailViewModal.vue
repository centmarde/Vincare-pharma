<script setup lang="ts">
import { usePODetailModal } from '@/pages/purchasing/composables/usePODetailModal'
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import { usePODetailView } from '../composables/usePODetailView'
import type { PR } from '@/stores/purchaseRequisitionData'
import PODetailViewBody from '../components/PODetailViewBody.vue'
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

const { printArea, handlePrint } = usePODetailModal(props as any, emit as any)
const {
  savingAll,
  transactionItems,
  effectiveEmptyRows,
  warehouses,
  missingSkuCount,
  missingActualCount,
  missingWarehouseCount,
  handleMarkAsReceived,
} = usePODetailView(props as any, emit as any)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="mobile ? '95%' : '1100'"
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
          <PODetailViewBody
            :po="po"
            :pr="pr"
            :mobile="mobile"
            :sku-edit-mode="skuEditMode"
            :transaction-items="transactionItems"
            :effective-empty-rows="effectiveEmptyRows"
            :warehouses="warehouses"
          />
        </div>
      </v-card-text>

      <v-divider class="d-print-none" />

      <!-- Actions -->
      <v-card-actions :class="mobile ? 'pa-3 ga-2 flex-wrap' : 'pa-4 justify-end'">
        <div
          v-if="skuEditMode && (missingSkuCount > 0 || missingActualCount > 0 || missingWarehouseCount > 0)"
          :class="mobile ? 'text-caption text-medium-emphasis w-100 mb-2' : 'text-body-2 text-medium-emphasis'"
        >
          <v-icon size="16" color="error" class="mr-1">mdi-alert-circle-outline</v-icon>
          <template v-if="missingSkuCount > 0">{{ missingSkuCount }} SKU{{ missingSkuCount !== 1 ? 's' : '' }} missing</template>
          <template v-if="missingActualCount > 0">
            {{ missingSkuCount > 0 ? ' / ' : '' }}{{ missingActualCount }} actual count{{ missingActualCount !== 1 ? 's' : '' }} missing
          </template>
          <template v-if="missingWarehouseCount > 0">
            {{ missingSkuCount > 0 || missingActualCount > 0 ? ' / ' : '' }}{{ missingWarehouseCount }} warehouse{{ missingWarehouseCount !== 1 ? 's' : '' }} missing
          </template>
        </div>

        <v-spacer v-if="!mobile" />
        <template v-if="skuEditMode">
          <v-btn variant="outlined" size="small" class="text-none" @click="emit('update:modelValue', false)">Cancel</v-btn>
          <v-btn
            color="success"
            variant="flat"
            size="small"
            :loading="savingAll"
            :disabled="missingSkuCount > 0 || missingActualCount > 0 || missingWarehouseCount > 0 || savingAll"
            @click="handleMarkAsReceived"
          >
            <template v-if="missingSkuCount > 0">
              Input SKU ({{ missingSkuCount + missingActualCount + missingWarehouseCount }})
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
