<script setup lang="ts">
/**
 * Full-cover loader nga gi-display samtang ongoing pa ang CSV/PDF export.
 *
 * Gi-higot sa `exportLoading` state sa ProductsWidget — ang dialog persistent
 * (dili ma-close sa click o ESC), mao nga ma-block ang interaction ug ma-cover
 * ang table view samtang ga-fetch pa sa filtered products ug ga-generate sa file.
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    message?: string
  }>(),
  {
    message: 'Exporting products…',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()
</script>

<template>
  <v-dialog
    :model-value="props.modelValue"
    persistent
    :width="320"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-text class="pa-6 d-flex flex-column align-center ga-3">
        <v-progress-circular indeterminate color="primary" size="48" width="5" />
        <div class="text-body-1 font-weight-medium text-center">{{ props.message }}</div>
        <div class="text-caption text-center text-medium-emphasis">
          While generating, you may experience lag, flickering, or your browser may temporarily
          not respond — please don't close or refresh this page.
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
