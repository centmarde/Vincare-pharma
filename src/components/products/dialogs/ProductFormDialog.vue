<script setup lang="ts">
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

      <v-card-text class="overflow-y-auto">
        <v-form ref="form" @submit.prevent="emit('submit')">
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
              <v-text-field v-model="productForm.sku" label="SKU" prepend-inner-icon="mdi-tag" variant="outlined" density="comfortable"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model.number="productForm.actual_count" label="Current Stock" type="number" prepend-inner-icon="mdi-numeric" variant="outlined" density="comfortable" :rules="[rules.positiveNumber]" min="0"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model.number="productForm.cost_price" label="Cost Price" type="number" step="0.01" prepend-inner-icon="mdi-currency-usd" variant="outlined" density="comfortable" :rules="[rules.positiveNumber]" min="0"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model.number="productForm.selling_price" label="Selling Price" type="number" step="0.01" prepend-inner-icon="mdi-currency-usd" variant="outlined" density="comfortable" :rules="[rules.positiveNumber]" min="0"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model="productForm.category" label="Category" prepend-inner-icon="mdi-shape" variant="outlined" density="comfortable"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model.number="productForm.supplier_id" label="Supplier ID" type="number" prepend-inner-icon="mdi-truck-delivery" variant="outlined" density="comfortable" min="0"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model.number="productForm.batch_no" label="Batch No." type="number" prepend-inner-icon="mdi-numeric" variant="outlined" density="comfortable"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model="productForm.expiry_date" label="Expiry Date" type="date" prepend-inner-icon="mdi-calendar-clock" variant="outlined" density="comfortable"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model.number="productForm.reorder_level" label="Reorder Level" type="number" step="0.01" prepend-inner-icon="mdi-alert" variant="outlined" density="comfortable" :rules="[rules.positiveNumber]" min="0"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model="productForm.status" label="Status" prepend-inner-icon="mdi-information" variant="outlined" density="comfortable"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model="productForm.item_decription" label="Item Description" prepend-inner-icon="mdi-text" variant="outlined" density="comfortable"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model.number="productForm.offer_per_unit" label="Offer Per Unit" type="number" step="0.01" prepend-inner-icon="mdi-percent" variant="outlined" density="comfortable" :rules="[rules.positiveNumber]" min="0"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model.number="productForm.cost_per_unit" label="Cost Per Unit" type="number" step="0.01" prepend-inner-icon="mdi-currency-usd" variant="outlined" density="comfortable" :rules="[rules.positiveNumber]" min="0"></v-text-field>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-select v-model="productForm.unit" label="Unit" prepend-inner-icon="mdi-counter" variant="outlined" density="comfortable" :items="['Box', 'Pcs', 'Set', 'Unit', 'Kg', 'M']" clearable ></v-select>
            </v-col>
            <v-col cols="12" :sm="mobile ? 12 : 6">
              <v-text-field v-model.number="productForm.no" label="No." type="number" prepend-inner-icon="mdi-numeric" variant="outlined" density="comfortable" min="0"></v-text-field>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-divider></v-divider>

      <v-card-actions class="px-4 py-3">
        <v-spacer></v-spacer>
        <v-btn color="grey" variant="text" @click="emit('close')" :disabled="loading">Cancel</v-btn>
        <v-btn color="primary" variant="flat" @click="emit('submit')" :loading="loading">
          {{ dialogMode === 'create' ? 'Create' : 'Update' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>