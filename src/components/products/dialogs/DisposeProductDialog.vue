<script setup lang="ts">
import type { ProductType } from '@/stores/productsData'

const props = defineProps<{
  modelValue: boolean
  product: ProductType | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'confirm': [product: ProductType]
}>()

function onConfirm() {
  if (props.product) emit('confirm', props.product)
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="480"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-4">
        <v-icon icon="mdi-delete-alert-outline" color="error" class="mr-2" size="28"></v-icon>
        <span class="text-h6 font-weight-bold">Dispose Product</span>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text class="pa-4">
        <p class="text-body-1">
          Are you sure you want to dispose
          "<strong>{{ product?.product_name || 'this product' }}</strong>"?
        </p>
        <v-alert
          class="mt-4"
          type="warning"
          variant="tonal"
          density="comfortable"
          prominent
          icon="mdi-account-lock-outline"
        >
          Disposal requires executive approval. You need to
          <strong>send a request to the executive first</strong> — including the
          batch number ({{ product?.batch_no || 'N/A' }}) and the reason for
          disposal — before this product can be disposed.
        </v-alert>
      </v-card-text>
      <v-divider></v-divider>
      <v-card-actions class="px-4 py-3">
        <v-spacer></v-spacer>
        <v-btn variant="text" color="grey" @click="emit('update:modelValue', false)">
          Cancel
        </v-btn>
        <v-btn variant="flat" color="error" prepend-icon="mdi-send-outline" @click="onConfirm">
          Request Disposal
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>