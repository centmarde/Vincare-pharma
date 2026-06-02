<template>
  <v-dialog v-model="show" max-width="400px" persistent>
    <v-card>
      <v-card-title class="text-h6 pa-6">
        <v-icon icon="mdi-alert-circle" color="warning" class="mr-3" />
        Confirm Delete
      </v-card-title>

      <v-card-text class="pa-6">
        <p class="mb-4">
          Are you sure you want to delete this announcement?
        </p>

        <v-alert
          type="warning"
          variant="tonal"
          class="mb-0"
        >
          <template v-slot:text>
            <strong>This action cannot be undone.</strong>
            <br>
            The announcement will be permanently removed from the system.
          </template>
        </v-alert>
      </v-card-text>

      <v-card-actions class="pa-6">
        <v-spacer />
        <v-btn
          @click="handleCancel"
          variant="outlined"
          :disabled="loading"
        >
          Cancel
        </v-btn>
        <v-btn
          @click="handleConfirm"
          color="error"
          :loading="loading"
          :disabled="loading"
        >
          <v-icon start>mdi-delete</v-icon>
          Delete
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// Props
type Props = {
  modelValue: boolean
  loading?: boolean
  announcementTitle?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  loading: false,
  announcementTitle: ''
})

// Emits
type Emits = {
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}

const emit = defineEmits<Emits>()

// Computed
const show = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

// Methods
const handleConfirm = () => {
  emit('confirm')
}

const handleCancel = () => {
  emit('cancel')
}
</script>

<style scoped>
.v-card {
  border-radius: 12px !important;
}

.v-alert {
  border-radius: 8px !important;
}
</style>
