<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { computed } from 'vue'

const { mobile } = useDisplay()

interface ConfirmDialogData {
  show: boolean
  action: 'APPROVE' | 'REJECT'
  prNumber: string
}

const props = defineProps<{
  modelValue: boolean
  confirmData: ConfirmDialogData
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
  confirm: []
}>()

const dialogColor = computed(() => {
  return props.confirmData.action === 'APPROVE' ? 'green-darken-2' : 'red-darken-2'
})

const confirmLabel = computed(() => {
  return props.confirmData.action === 'APPROVE' ? 'Approve' : 'Reject'
})

const iconName = computed(() => {
  return props.confirmData.action === 'APPROVE'
    ? 'mdi-check-circle-outline'
    : 'mdi-close-circle-outline'
})
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="mobile ? '100%' : '400'"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center ga-2 pt-5 px-5">
        <v-icon :color="dialogColor" size="22">
          {{ iconName }}
        </v-icon>
        <span class="text-body-1 font-weight-bold">
          {{ confirmLabel }} Purchase Requisition
        </span>
      </v-card-title>

      <v-card-text class="px-5 pb-2 text-body-2 text-medium-emphasis">
        Are you sure you want to
        <strong>{{ confirmData.action }}</strong>
        &nbsp;- <strong>({{ confirmData.prNumber }})</strong>? This action cannot be undone.
      </v-card-text>

      <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
        <v-btn
          variant="outlined"
          class="text-none"
          :disabled="loading"
          @click="emit('close')"
        >
          Cancel
        </v-btn>
        <v-btn
          :color="dialogColor"
          :variant="confirmData.action === 'APPROVE' ? 'flat' : 'outlined'"
          class="text-none"
          :loading="loading"
          :disabled="loading"
          @click="emit('confirm')"
        >
          Yes, {{ confirmLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* No additional styles needed */
</style>
