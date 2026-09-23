<script setup lang="ts">
import { ref } from 'vue'
import type { ProductType } from '@/stores/productsData'
import DisposeProductDialog from './DisposeProductDialog.vue'

const props = defineProps<{
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

// Dispose choice — opens the dedicated dispose-confirmation dialog so the
// user can decide outright delete vs. executive-requested disposal.
const disposeTarget = ref<ProductType | null>(null)
const showDisposeDialog = ref(false)

function openDisposeDialog() {
  disposeTarget.value = props.currentProduct
  showDisposeDialog.value = true
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="mobile ? undefined : '480px'"
    :fullscreen="mobile"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center pa-4">
        <v-icon icon="mdi-alert-circle" class="mr-2" color="error"></v-icon>
        <span class="text-h6 font-weight-bold">Delete or Dispose?</span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('close')"></v-btn>
      </v-card-title>

      <v-divider></v-divider>

      <v-card-text class="pa-4">
        <p v-if="currentProduct" class="font-weight-bold">
          {{ currentProduct.product_name }} (ID: {{ currentProduct.id }})
        </p>
        <p class="text-caption text-grey mt-1">Recorded on Logs</p>

        <div class="d-flex flex-column ga-3 mt-4">
          <v-alert
            type="error"
            variant="tonal"
            density="comfortable"
            title="Delete"
            icon="mdi-delete"
          >
            Permanently remove this product record. This action
            <strong>cannot be undone</strong> and the system will log the deletion.
          </v-alert>

          <v-alert
            type="warning"
            variant="tonal"
            density="comfortable"
            title="Dispose"
            icon="mdi-delete-alert-outline"
          >
            Flag this product for disposal. This requires
            <strong>sending a request to the executive first</strong> for approval
            before it can be disposed.
          </v-alert>
        </div>
      </v-card-text>

      <v-divider></v-divider>

      <v-card-actions class="px-4 py-3">
        <v-spacer></v-spacer>
        <v-btn color="grey" variant="text" @click="emit('close')" :disabled="loading">Cancel</v-btn>
        <v-btn
          color="warning"
          variant="tonal"
          prepend-icon="mdi-delete-alert-outline"
          class="text-none"
          @click="openDisposeDialog"
          :disabled="loading"
        >
          Dispose
        </v-btn>
        <v-btn color="error" variant="flat" prepend-icon="mdi-delete" @click="emit('confirm')" :loading="loading">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <DisposeProductDialog
    v-model="showDisposeDialog"
    :product="disposeTarget"
  />
</template>
