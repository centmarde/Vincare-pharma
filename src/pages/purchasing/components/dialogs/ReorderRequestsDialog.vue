<script setup lang="ts">
import { computed } from 'vue'

interface ReorderRequestsDialogProps {
  modelValue: boolean
  reorderRequests: any[]
  selectedReorderIds: number[]
}

const props = defineProps<ReorderRequestsDialogProps>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:selectedReorderIds': [value: number[]]
  'create-pr': []
}>()

const selectedCount = computed(() => props.selectedReorderIds.length)

function isSelected(id: number): boolean {
  return props.selectedReorderIds.includes(id)
}

function toggleSelection(id: number): void {
  if (isSelected(id)) {
    emit('update:selectedReorderIds', props.selectedReorderIds.filter(i => i !== id))
  } else {
    emit('update:selectedReorderIds', [...props.selectedReorderIds, id])
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="600"
  >
    <v-card>
      <v-card-title class="d-flex align-center pa-4">
        <v-icon icon="mdi-cart-arrow-down" color="teal" class="mr-2"></v-icon>
        <span class="text-h6 font-weight-bold">Reorder Requests</span>
        <v-spacer></v-spacer>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="emit('update:modelValue', false)"
        ></v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text class="pa-0" style="max-height: 400px; overflow-y: auto;">
        <v-list v-if="reorderRequests.length" density="comfortable">
          <v-list-item v-for="r in reorderRequests" :key="r.id">
            <template #prepend>
              <v-checkbox-btn
                :model-value="isSelected(r.id)"
                @update:model-value="() => toggleSelection(r.id)"
              />
            </template>
            <v-list-item-title class="font-weight-medium">
              {{ r.product?.product_name }}
            </v-list-item-title>
            <v-list-item-subtitle>
              Stock: {{ r.product?.current_stock ?? 0 }}
              <span v-if="r.product?.reorder_level != null">
                · reorder at {{ r.product.reorder_level }}
              </span>
              · Flagged by {{ r.requester_name }}
            </v-list-item-subtitle>
            <template #append>
              <v-chip
                size="small"
                :color="r.transaction_type === 'reorder_outofstock' ? 'error' : r.transaction_type === 'reorder_lowstock' ? 'warning' : 'orange'"
                variant="tonal"
              >
                {{ r.transaction_type.replace('reorder_', '').replace('_', ' ') }}
              </v-chip>
            </template>
          </v-list-item>
        </v-list>
        <div v-else class="text-center py-8 text-medium-emphasis">
          No pending reorder requests
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4 d-flex justify-end">
        <v-btn
          color="primary"
          class="text-none font-weight-bold"
          :disabled="!selectedCount"
          @click="emit('create-pr')"
        >
          Create Purchase Requisition ({{ selectedCount }})
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* No additional styles needed */
</style>
