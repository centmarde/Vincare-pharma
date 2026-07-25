<script setup lang="ts">
import { useProductIgnore } from '@/components/products/composables/useProductIgnore'

const props = defineProps<{
  modelValue: boolean
  ignoredProductEntries: Array<{
    id: number
    product_name: string
    sku: string
    remainingMs: number
    remainingLabel: string
  }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const productIgnore = useProductIgnore()

function unignoreAll() {
  props.ignoredProductEntries.forEach(e => productIgnore.unignoreProduct(e.id))
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="560"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center pa-4">
        <v-icon icon="mdi-bell-off-outline" color="grey-darken-1" class="mr-2"></v-icon>
        <span class="text-h6 font-weight-bold">Ignored Products</span>
        <v-spacer></v-spacer>
        <v-chip size="small" variant="tonal" color="grey-darken-1">
          {{ ignoredProductEntries.length }} product{{ ignoredProductEntries.length > 1 ? 's' : '' }}
        </v-chip>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)"></v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text class="pa-0" style="max-height: 400px; overflow-y: auto;">
        <v-list v-if="ignoredProductEntries.length > 0" density="comfortable">
          <v-list-item v-for="entry in ignoredProductEntries" :key="entry.id">
            <v-list-item-title class="font-weight-medium">
              {{ entry.product_name }}
            </v-list-item-title>
            <v-list-item-subtitle>
              SKU: {{ entry.sku }} · Remaining: {{ entry.remainingLabel }}
            </v-list-item-subtitle>
            <template #append>
              <v-btn
                size="small"
                variant="outlined"
                color="warning"
                class="text-none"
                prepend-icon="mdi-bell-ring-outline"
                @click="productIgnore.unignoreProduct(entry.id)"
              >
                Unignore
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
        <div v-else class="text-center py-8">
          <v-icon icon="mdi-check-circle-outline" size="40" color="success"></v-icon>
          <p class="text-grey mt-2">No ignored products</p>
        </div>
      </v-card-text>
      <v-divider v-if="ignoredProductEntries.length > 0"></v-divider>
      <v-card-actions v-if="ignoredProductEntries.length > 0" class="pa-4 d-flex justify-end">
        <v-btn
          color="error"
          variant="tonal"
          class="text-none"
          prepend-icon="mdi-bell-off-outline"
          @click="unignoreAll"
        >
          Unignore All
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>