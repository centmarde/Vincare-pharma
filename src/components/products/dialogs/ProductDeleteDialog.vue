<script setup lang="ts">
import type { ProductType } from '@/stores/productsData'

defineProps<{
  modelValue: boolean
  currentProduct: ProductType | null
  loading: boolean
  mobile: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'confirm': []
  'close': []
}>()
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="mobile ? undefined : '400px'"
    :fullscreen="mobile"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center pa-4">
        <v-icon icon="mdi-alert-circle" class="mr-2" color="error"></v-icon>
        <span class="text-h6 font-weight-bold">Confirm Delete</span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('close')"></v-btn>
      </v-card-title>

      <v-divider></v-divider>

      <v-card-text class="pa-4">
        <p>Are you sure you want to delete this product?</p>
        <p v-if="currentProduct" class="font-weight-bold mt-2">
          {{ currentProduct.product_name }} (ID: {{ currentProduct.id }}) Recorded on Logs
        </p>
        <p class="text-caption text-grey mt-2">This action cannot be undone and the system will record the deletion.</p>
      </v-card-text>

      <v-divider></v-divider>

      <v-card-actions class="px-4 py-3">
        <v-spacer></v-spacer>
        <v-btn color="grey" variant="text" @click="emit('close')" :disabled="loading">Cancel</v-btn>
        <v-btn color="error" variant="flat" @click="emit('confirm')" :loading="loading">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
