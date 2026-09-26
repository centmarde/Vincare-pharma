<script setup lang="ts">
import { ref, watch } from 'vue'
import ProductPickerDialog from '@/components/products/ProductPicker.vue'
import type { ProductPickerResult } from '@/stores/productsData'
import { useAcceptReturn } from '../composables/useAcceptReturn'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created'): void
}>()

const {
  loading,
  customerId, locationId, settlement, remarks, lines,
  locationOptions, customerOptions, returnConditions,
  totalAmount, restockLines, writeOffLines, writeOffValue,
  blockers, canSubmit,
  addLine, applyPickedProduct, removeLine, batchLabel, lineTotal,
  submit, reset, init,
  formatCurrency,
} = useAcceptReturn(() => emit('created'))

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

async function handleSubmit() {
  const result = await submit()
  if (result.success) close()
}

function cancel() {
  reset()
  close()
}

watch(() => props.modelValue, (open) => { if (open) void init() }, { immediate: true })
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="1000"
    scrollable
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-4 pa-sm-5">
        <v-icon icon="mdi-keyboard-return" class="mr-2 text-primary" size="26" />
        <span class="text-h6 font-weight-bold">Accept Return</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="cancel" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <p class="text-body-2 text-medium-emphasis mb-4">
          Goods come back and other goods go out in their place — no money is refunded.
          Items in good condition return to their original batch; expired or broken items
          are written off and never re-enter stock.
        </p>

        <v-row dense>
          <v-col cols="12" sm="6">
            <v-autocomplete
              v-model="customerId"
              :items="customerOptions"
              label="Customer (optional)"
              hint="Required only to leave the value as credit"
              persistent-hint
              variant="outlined"
              density="compact"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="locationId"
              :items="locationOptions"
              label="Returned to"
              hint="Where the stock physically goes back"
              persistent-hint
              variant="outlined"
              density="compact"
            />
          </v-col>
        </v-row>

        <div class="mt-4">
          <div class="text-subtitle-2 font-weight-bold mb-1">Settlement</div>
          <v-btn-toggle v-model="settlement" mandatory density="compact" variant="outlined" divided>
            <v-btn value="swapped" size="small">Issue replacement now</v-btn>
            <v-btn value="credited" size="small" :disabled="customerId == null">
              Leave as credit
            </v-btn>
          </v-btn-toggle>
          <div class="text-caption text-medium-emphasis mt-1">
            <span v-if="settlement === 'credited'">
              The value stays on the customer's account until they take goods against it.
            </span>
            <span v-else>
              Replacement goods are issued against this return. Any value they don't use
              stays on account when a customer is selected.
            </span>
          </div>
        </div>

        <v-divider class="my-4" />

        <div class="d-flex align-center mb-2 ga-2">
          <span class="text-subtitle-2 font-weight-bold">Returned items</span>
          <v-spacer />
          <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="addLine">
            Add Item
          </v-btn>
        </div>

        <div class="returns-lines">
          <v-row
            v-for="(line, i) in lines"
            :key="i"
            dense
            class="align-center mb-1"
          >
            <v-col cols="12" md="4">
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
              <div v-if="line.product_id" class="text-caption text-medium-emphasis mt-1">
                {{ batchLabel(line) }}
              </div>
            </v-col>
            <v-col cols="6" md="1">
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
            <v-col cols="6" md="2">
              <v-text-field
                v-model.number="line.unit_price"
                label="Credit / unit"
                type="number"
                step="0.01"
                min="0"
                prepend-inner-icon="mdi-currency-php"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="10" md="3">
              <v-select
                v-model="line.condition"
                :items="returnConditions"
                label="Condition"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="2" md="2" class="d-flex align-center justify-end ga-1">
              <span class="text-body-2 font-weight-medium d-none d-md-inline">
                {{ formatCurrency(lineTotal(line)) }}
              </span>
              <v-btn
                icon="mdi-close"
                variant="text"
                size="x-small"
                color="error"
                @click="removeLine(i)"
              />
            </v-col>
          </v-row>
        </div>

        <v-textarea
          v-model="remarks"
          label="Remarks"
          rows="2"
          auto-grow
          variant="outlined"
          density="compact"
          class="mt-3"
          hide-details
        />

        <v-divider class="my-4" />

        <div class="d-flex flex-wrap ga-4 justify-end">
          <div class="text-right">
            <div class="text-caption text-medium-emphasis">Back into stock</div>
            <div class="text-body-2 font-weight-medium">{{ restockLines.length }} line(s)</div>
          </div>
          <div class="text-right">
            <div class="text-caption text-medium-emphasis">Written off</div>
            <div class="text-body-2 font-weight-medium" :class="writeOffLines.length ? 'text-warning' : ''">
              {{ writeOffLines.length }} line(s) · {{ formatCurrency(writeOffValue) }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-caption text-medium-emphasis">Total credit</div>
            <div class="text-h6 font-weight-bold">{{ formatCurrency(totalAmount) }}</div>
          </div>
        </div>
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
          Record Return
        </v-btn>
      </v-card-actions>
    </v-card>

    <ProductPickerDialog
      v-model="showProductPicker"
      mode="batch"
      :location-id="locationId"
      @select="onProductSelected"
    />
  </v-dialog>
</template>

<style scoped>
.returns-lines {
  max-height: 320px;
  overflow-y: auto;
}
</style>
