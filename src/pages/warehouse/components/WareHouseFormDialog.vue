<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  modelValue: boolean
  dialogMode: 'create' | 'edit'
  loading: boolean
  rules: {
    required: (v: string) => true | string
  }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: []
  close: []
}>()

const form = defineModel<any>('form', { required: true })

async function onSubmit() {
  emit('submit')
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-5 pb-3">
        <span class="text-h6 font-weight-bold">
          {{ dialogMode === 'create' ? 'Add Warehouse' : 'Edit Warehouse' }}
        </span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('close')"></v-btn>
      </v-card-title>

      <v-divider />

      <v-form ref="formRef">
        <v-card-text class="pa-5">
          <v-row dense>
            <v-col cols="12">
              <label class="field-label">Warehouse Name <span class="text-error">*</span></label>
              <v-text-field
                v-model="form.name"
                placeholder="e.g. Main Warehouse"
                variant="outlined"
                density="compact"
                hide-details="auto"
                :rules="[rules.required]"
              />
            </v-col>
            <v-col cols="12">
              <label class="field-label">Location</label>
              <v-text-field
                v-model="form.location"
                placeholder="e.g. 123 Industrial Ave."
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
          </v-row>
        </v-card-text>
      </v-form>

      <v-divider />

      <v-card-actions class="pa-4 justify-end" style="gap: 8px">
        <v-btn variant="outlined" class="text-none" :disabled="loading" @click="emit('close')">
          Cancel
        </v-btn>
        <v-btn
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          :loading="loading"
          @click="onSubmit"
        >
          {{ dialogMode === 'create' ? 'Add Warehouse' : 'Save Changes' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #424242;
  margin-bottom: 4px;
}
</style>