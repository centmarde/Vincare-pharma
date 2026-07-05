<script setup lang="ts">
import { ref, watch } from 'vue'
import { parseMonthYear, formatMonthYear, maskMonthYearInput } from '@/utils/helpers'
import type { CreateProductData, UpdateProductData } from '@/stores/productsData'

const props = defineProps<{
  modelValue: boolean
  dialogMode: 'create' | 'edit'
  productForm: CreateProductData & UpdateProductData
  loading: boolean
  mobile: boolean
  rules: {
    required: (value: any) => true | string
    positiveNumber: (value: number | null) => true | string
  }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'submit': []
  'close': []
}>()

const form = defineModel<any>('form')

// Stepper state
const step = ref(1)
const stepperRef = ref<any>(null)

function nextStep() {
  if (step.value < 3) step.value++
}

function prevStep() {
  if (step.value > 1) step.value--
}

// Batch expiry only ever needs month/year (e.g. "04/2026") — entered as a
// masked MM/YYYY text field. products.expiry_date is a native Postgres `date`
// column (day required), so a valid MM/YYYY commits as "YYYY-MM-01".
// A local text ref holds what the user types so partial input stays visible
// (a computed proxy backed by the parsed date would erase incomplete text).
const EXPIRY_YEARS_BACK = 10
const EXPIRY_YEARS_OUT = 15
const expiryText = ref('')

// Keep the field in sync when the form's date changes externally (e.g. the
// dialog opens in edit mode).
watch(() => props.productForm.expiry_date, (value) => {
  const d = value ? new Date(value) : null
  expiryText.value = d && !Number.isNaN(d.getTime()) ? formatMonthYear(d) : ''
}, { immediate: true })

function commitExpiry(date: Date | null) {
  props.productForm.expiry_date = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
    : null
}

function onExpiryInput(raw: string) {
  expiryText.value = maskMonthYearInput(raw)
  const d = parseMonthYear(expiryText.value)
  if (d) commitExpiry(d)          // commit as soon as it's a complete valid MM/YYYY
}

function onExpiryBlur() {
  if (!expiryText.value) { commitExpiry(null); return }
  const d = parseMonthYear(expiryText.value)
  if (!d) return                  // partial/invalid — leave text for the user to finish
  const max = new Date(); max.setFullYear(max.getFullYear() + EXPIRY_YEARS_OUT)
  const min = new Date(); min.setFullYear(min.getFullYear() - EXPIRY_YEARS_BACK)
  const clamped = d > max ? max : d < min ? min : d
  expiryText.value = formatMonthYear(clamped)
  commitExpiry(clamped)
}

// Reset stepper when dialog opens
watch(() => props.modelValue, (val) => {
  if (val) step.value = 1
})
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="mobile ? undefined : '800px'"
    :fullscreen="mobile"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center pa-4">
        <v-icon
          :icon="dialogMode === 'create' ? 'mdi-plus-circle' : 'mdi-pencil-circle'"
          class="mr-2"
          color="primary"
        ></v-icon>
        <span class="text-h6 font-weight-bold">
          {{ dialogMode === 'create' ? 'Add New Product' : 'Edit Product' }}
        </span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('close')"></v-btn>
      </v-card-title>

      <v-divider></v-divider>

      <v-card-text class="overflow-y-auto pa-0">
        <v-stepper
          v-model="step"
          ref="stepperRef"
          :mobile="mobile"
          :flat="mobile"
          :elevation="mobile ? 0 : undefined"
          class="pa-0"
        >
          <!-- Step headers -->
          <v-stepper-header>
            <v-stepper-item
              :complete="step > 1"
              :value="1"
              title="Basic Info"
              subtitle="Name & identifiers"
              color="primary"
              :editable="true"
            >
              <template #icon>
                <v-icon :icon="step > 1 ? 'mdi-check' : 'mdi-information-outline'"></v-icon>
              </template>
            </v-stepper-item>
            <v-divider></v-divider>
            <v-stepper-item
              :complete="step > 2"
              :value="2"
              title="Pricing & Stock"
              subtitle="Cost & inventory"
              color="primary"
              :editable="true"
            >
              <template #icon>
                <v-icon :icon="step > 2 ? 'mdi-check' : 'mdi-currency-usd'"></v-icon>
              </template>
            </v-stepper-item>
            <v-divider></v-divider>
            <v-stepper-item
              :value="3"
              title="Additional Details"
              subtitle="Extra info"
              color="primary"
              :editable="true"
            >
              <template #icon>
                <v-icon icon="mdi-text-box-outline"></v-icon>
              </template>
            </v-stepper-item>
          </v-stepper-header>

          <v-divider></v-divider>

          <!-- Step 1: Basic Info -->
          <v-stepper-window>
            <v-stepper-window-item :value="1">
              <v-form ref="form" @submit.prevent="emit('submit')">
                <div class="pa-4">
                  <v-row>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model="productForm.product_name" label="Product Name" prepend-inner-icon="mdi-package-variant" variant="outlined" density="comfortable" :rules="[rules.required]" required></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model="productForm.generic_name" label="Generic Name" prepend-inner-icon="mdi-label" variant="outlined" density="comfortable"></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model="productForm.barcode" label="Barcode" prepend-inner-icon="mdi-barcode" variant="outlined" density="comfortable"></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model="productForm.sku" label="SKU" prepend-inner-icon="mdi-tag" variant="outlined" density="comfortable" :rules="[rules.required]" required></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model="productForm.category" label="Category" prepend-inner-icon="mdi-shape" variant="outlined" density="comfortable"></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model="productForm.status" label="Status" prepend-inner-icon="mdi-information" variant="outlined" density="comfortable"></v-text-field>
                    </v-col>
                  </v-row>
                </div>
              </v-form>
            </v-stepper-window-item>

            <!-- Step 2: Pricing & Stock -->
            <v-stepper-window-item :value="2">
              <v-form ref="form" @submit.prevent="emit('submit')">
                <div class="pa-4">
                  <v-row>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model.number="productForm.current_stock" label="Current Stock" type="number" prepend-inner-icon="mdi-numeric" variant="outlined" density="comfortable" :rules="[rules.positiveNumber]" min="0"></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model.number="productForm.cost_price" label="Cost Price" type="number" step="0.01" prepend-inner-icon="mdi-currency-php" variant="outlined" density="comfortable" :rules="[rules.positiveNumber]" min="0"></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model.number="productForm.selling_price" label="Selling Price" type="number" step="0.01" prepend-inner-icon="mdi-currency-php" variant="outlined" density="comfortable" :rules="[rules.positiveNumber]" min="0"></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model.number="productForm.reorder_level" label="Reorder Level" type="number" step="0.01" prepend-inner-icon="mdi-alert" variant="outlined" density="comfortable" :rules="[rules.positiveNumber]" min="0"></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model.number="productForm.offer_per_unit" label="Offer Per Unit" type="number" step="0.01" prepend-inner-icon="mdi-percent" variant="outlined" density="comfortable" :rules="[rules.positiveNumber]" min="0"></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model.number="productForm.cost_per_unit" label="Cost Per Unit" type="number" step="0.01" prepend-inner-icon="mdi-currency-php" variant="outlined" density="comfortable" :rules="[rules.positiveNumber]" min="0"></v-text-field>
                    </v-col>
                  </v-row>
                </div>
              </v-form>
            </v-stepper-window-item>

            <!-- Step 3: Additional Details -->
            <v-stepper-window-item :value="3">
              <v-form ref="form" @submit.prevent="emit('submit')">
                <div class="pa-4">
                  <v-row>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model.number="productForm.supplier_id" label="Supplier ID" type="number" prepend-inner-icon="mdi-truck-delivery" variant="outlined" density="comfortable" min="0"></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model.number="productForm.batch_no" label="Batch No." type="number" prepend-inner-icon="mdi-numeric" variant="outlined" density="comfortable"></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field :model-value="expiryText" label="Expiry Date" placeholder="MM/YYYY" maxlength="7" inputmode="numeric" prepend-inner-icon="mdi-calendar-clock" variant="outlined" density="comfortable" @update:model-value="onExpiryInput" @blur="onExpiryBlur"></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model="productForm.item_decription" label="Item Description" prepend-inner-icon="mdi-text" variant="outlined" density="comfortable"></v-text-field>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-select v-model="productForm.unit" label="Unit" prepend-inner-icon="mdi-counter" variant="outlined" density="comfortable" :items="['Box', 'Pcs', 'Set', 'Unit', 'Kg', 'M']" clearable ></v-select>
                    </v-col>
                    <v-col cols="12" :sm="mobile ? 12 : 6">
                      <v-text-field v-model.number="productForm.no" label="No." type="number" prepend-inner-icon="mdi-numeric" variant="outlined" density="comfortable" min="0"></v-text-field>
                    </v-col>
                  </v-row>
                </div>
              </v-form>
            </v-stepper-window-item>
          </v-stepper-window>
        </v-stepper>
      </v-card-text>

      <v-divider></v-divider>

      <v-card-actions class="px-4 py-3">
        <v-btn
          v-if="step > 1"
          color="grey"
          variant="text"
          prepend-icon="mdi-arrow-left"
          @click="prevStep"
          :disabled="loading"
        >
          Back
        </v-btn>
        <v-spacer></v-spacer>
        <v-btn color="grey" variant="text" @click="emit('close')" :disabled="loading">Cancel</v-btn>
        <v-btn
          v-if="step < 3"
          color="primary"
          variant="flat"
          append-icon="mdi-arrow-right"
          @click="nextStep"
        >
          Next
        </v-btn>
        <v-btn
          v-else
          color="primary"
          variant="flat"
          @click="emit('submit')"
          :loading="loading"
        >
          {{ dialogMode === 'create' ? 'Create' : 'Update' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
