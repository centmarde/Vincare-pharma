<script setup lang="ts">
import { ref, watch } from 'vue'
import ProductPickerDialog from '@/components/products/ProductPicker.vue'
import type { ProductPickerResult } from '@/stores/productsData'
import type { SalesReturnType } from '@/stores/salesReturnsData'
import { useIssueReplacement } from '../composables/useIssueReplacement'

const props = defineProps<{ modelValue: boolean; returnRow: SalesReturnType | null }>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'issued'): void
}>()

const {
  loading, source, lines,
  creditAvailable, total, remaining, exceedsCredit,
  blockers, canSubmit,
  addLine, applyPickedProduct, removeLine, lineTotal,
  open, reset, submit,
  formatCurrency,
} = useIssueReplacement(() => emit('issued'))

const showProductPicker = ref(false)
const pickerTargetIndex = ref<number | null>(null)

function openProductPicker(index: number) {
  pickerTargetIndex.value = index
  showProductPicker.value = true
}

function onProductSelected(product: ProductPickerResult) {
  if (pickerTargetIndex.value === null) return
  applyPickedProduct(pickerTargetIndex.value, product)
  pickerTargetIndex.value = null
}

function close() {
  emit('update:modelValue', false)
}

function cancel() {
  reset()
  close()
}

async function handleSubmit() {
  const result = await submit()
  if (result.success) close()
}

watch(
  () => props.modelValue,
  (isOpen) => { if (isOpen && props.returnRow) open(props.returnRow) },
  { immediate: true },
)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="900"
    scrollable
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-4 pa-sm-5">
        <v-icon icon="mdi-swap-horizontal" class="mr-2 text-primary" size="26" />
        <span class="text-h6 font-weight-bold">Issue Replacement</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="cancel" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <v-alert type="info" variant="tonal" density="compact" class="mb-4">
          Settling <strong>{{ source?.return_no }}</strong> —
          credit of <strong>{{ formatCurrency(creditAvailable) }}</strong>
          <span v-if="source?.customer_name"> for {{ source.customer_name }}</span>
          <span v-else> (walk-in)</span>.
          Goods are issued against this credit; no money changes hands.
        </v-alert>

        <div class="d-flex align-center mb-2 ga-2">
          <span class="text-subtitle-2 font-weight-bold">Replacement items</span>
          <v-spacer />
          <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="addLine">
            Add Item
          </v-btn>
        </div>

        <v-row
          v-for="(line, i) in lines"
          :key="i"
          dense
          class="align-center mb-1"
        >
          <v-col cols="12" md="5">
            <v-text-field
              :model-value="line.product_name"
              label="Product"
              placeholder="Pick a batch..."
              variant="outlined"
              density="compact"
              readonly
              hide-details
              append-inner-icon="mdi-magnify"
              @click="openProductPicker(i)"
              @click:append-inner="openProductPicker(i)"
            />
          </v-col>
          <v-col cols="4" md="2">
            <v-text-field
              v-model.number="line.qty"
              label="Qty"
              type="number"
              min="1"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="6" md="3">
            <v-text-field
              v-model.number="line.unit_price"
              label="Price / unit"
              type="number"
              step="0.01"
              min="0"
              prepend-inner-icon="mdi-currency-php"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="2" md="2" class="d-flex align-center justify-end ga-1">
            <span class="text-body-2 font-weight-medium d-none d-md-inline">
              {{ formatCurrency(lineTotal(line)) }}
            </span>
            <v-btn icon="mdi-close" variant="text" size="x-small" color="error" @click="removeLine(i)" />
          </v-col>
        </v-row>

        <v-divider class="my-4" />

        <div class="d-flex flex-wrap ga-4 justify-end">
          <div class="text-right">
            <div class="text-caption text-medium-emphasis">Credit available</div>
            <div class="text-body-1 font-weight-medium">{{ formatCurrency(creditAvailable) }}</div>
          </div>
          <div class="text-right">
            <div class="text-caption text-medium-emphasis">Goods issued</div>
            <div class="text-body-1 font-weight-medium" :class="exceedsCredit ? 'text-error' : ''">
              {{ formatCurrency(total) }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-caption text-medium-emphasis">Stays on account</div>
            <div class="text-h6 font-weight-bold" :class="remaining > 0 ? 'text-info' : ''">
              {{ formatCurrency(remaining) }}
            </div>
          </div>
        </div>

        <v-alert
          v-if="remaining > 0 && !exceedsCredit"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          {{ formatCurrency(remaining) }} of this credit is not being used. It stays owed to
          the customer and remains on the books until goods are issued against it.
        </v-alert>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-3 pa-sm-5">
        <span v-if="blockers.length" class="text-caption text-medium-emphasis">
          Still needed: {{ blockers.join(', ') }}
        </span>
        <v-spacer />
        <v-btn variant="text" @click="cancel">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!canSubmit"
          :loading="loading"
          @click="handleSubmit"
        >
          Issue Replacement
        </v-btn>
      </v-card-actions>
    </v-card>

    <ProductPickerDialog
      v-model="showProductPicker"
      mode="batch"
      :location-id="source?.warehouse_id ?? null"
      @select="onProductSelected"
    />
  </v-dialog>
</template>
