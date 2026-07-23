<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  dialogMode: 'create' | 'edit'
  loading: boolean
  rules: {
    required: (v: string) => true | string
    email: (v: string) => true | string | boolean
  }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: []
  close: []
}>()

const form = defineModel<any>('form', { required: true })

const step = ref(1)
const step1FormRef = ref<any>(null)
const step2FormRef = ref<any>(null)

async function nextStep() {
  const { valid } = await step1FormRef.value.validate()
  if (!valid) return
  step.value = 2
}

function prevStep() {
  step.value = 1
}

async function onSubmit() {
  const { valid } = await step2FormRef.value.validate()
  if (!valid) return
  emit('submit')
}

// Reset to step 1 whenever the dialog opens (create or edit)
watch(() => props.modelValue, (val) => {
  if (val) step.value = 1
})
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="560"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-5 pb-3">
        <span class="text-h6 font-weight-bold">
          {{ dialogMode === 'create' ? 'Add Supplier' : 'Edit Supplier' }}
        </span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('close')"></v-btn>
      </v-card-title>

      <v-divider />

      <v-stepper v-model="step" flat>
        <v-stepper-header>
          <v-stepper-item
            :complete="step > 1"
            :value="1"
            title="Company Info"
            color="primary"
            editable
          ></v-stepper-item>
          <v-divider></v-divider>
          <v-stepper-item
            :value="2"
            title="Legal & Banking"
            color="primary"
            editable
          ></v-stepper-item>
        </v-stepper-header>

        <v-divider />

        <v-stepper-window>
          <!-- Step 1: existing fields -->
          <v-stepper-window-item :value="1">
            <v-form ref="step1FormRef">
              <v-card-text class="pa-5">
                <v-row dense>
                  <v-col cols="12">
                    <label class="field-label">Supplier Name <span class="text-error">*</span></label>
                    <v-text-field
                      v-model="form.name"
                      placeholder="e.g. MedSupply Inc."
                      variant="outlined"
                      density="compact"
                      hide-details="auto"
                      :rules="[rules.required]"
                    />
                  </v-col>
                  <v-col cols="12" md="6">
                    <label class="field-label">Contact Person</label>
                    <v-text-field
                      v-model="form.contact_person"
                      placeholder="e.g. Juan dela Cruz"
                      variant="outlined"
                      density="compact"
                      hide-details
                    />
                  </v-col>
                  <v-col cols="12" md="6">
                    <label class="field-label">Phone</label>
                    <v-text-field
                      v-model="form.contact_no"
                      placeholder="e.g. 09123456789"
                      variant="outlined"
                      density="compact"
                      hide-details
                    />
                  </v-col>
                  <v-col cols="12" md="6">
                    <label class="field-label">Email</label>
                    <v-text-field
                      v-model="form.email"
                      placeholder="e.g. supplier@email.com"
                      variant="outlined"
                      density="compact"
                      hide-details="auto"
                      :rules="[rules.email]"
                    />
                  </v-col>
                  <v-col cols="12" md="6">
                    <label class="field-label">Balance (₱)</label>
                    <v-text-field
                      v-model.number="form.balance"
                      placeholder="e.g. 0.00"
                      variant="outlined"
                      density="compact"
                      hide-details
                      type="number"
                      prefix="₱"
                    />
                  </v-col>
                  <v-col cols="12">
                    <label class="field-label">Address</label>
                    <v-textarea
                      v-model="form.address"
                      placeholder="e.g. 2F N.B. Bldg., Ochoa Avenue"
                      variant="outlined"
                      density="compact"
                      rows="2"
                      hide-details
                    />
                  </v-col>
                  <v-col cols="12">
                    <v-switch
                      v-model="form.is_active"
                      color="primary"
                      hide-details
                      density="compact"
                      :label="form.is_active ? 'Active' : 'Inactive'"
                    />
                  </v-col>
                </v-row>
              </v-card-text>
            </v-form>
          </v-stepper-window-item>

          <!-- Step 2: legal & banking -->
          <v-stepper-window-item :value="2">
            <v-form ref="step2FormRef">
              <v-card-text class="pa-5">
                <v-row dense>
                  <v-col cols="12" md="6">
                    <label class="field-label">TIN</label>
                    <v-text-field
                      v-model="form.tin_no"
                      placeholder="e.g. 123-456-789-000"
                      variant="outlined"
                      density="compact"
                      hide-details
                    />
                  </v-col>
                  <v-col cols="12" md="6">
                    <label class="field-label">DTI No.</label>
                    <v-text-field
                      v-model="form.dti_no"
                      placeholder="e.g. 00000000"
                      variant="outlined"
                      density="compact"
                      hide-details
                    />
                  </v-col>
                  <v-col cols="12">
                    <label class="field-label">LTO</label>
                    <v-text-field
                      v-model="form.lto_no"
                      placeholder="e.g. LTO-000000"
                      variant="outlined"
                      density="compact"
                      hide-details
                    />
                  </v-col>
                  <v-col cols="12">
                    <label class="field-label">Bank Account No. / Details</label>
                    <v-textarea
                      v-model="form.bank_details"
                      placeholder="e.g. BDO - 000123456789 - Juan dela Cruz"
                      variant="outlined"
                      density="compact"
                      rows="3"
                      hide-details
                    />
                  </v-col>
                </v-row>
              </v-card-text>
            </v-form>
          </v-stepper-window-item>
        </v-stepper-window>
      </v-stepper>

      <v-divider />

      <v-card-actions class="pa-4 justify-end" style="gap: 8px">
        <v-btn
          v-if="step > 1"
          variant="text"
          class="text-none"
          prepend-icon="mdi-arrow-left"
          :disabled="loading"
          @click="prevStep"
        >
          Back
        </v-btn>
        <v-spacer v-if="step === 1"></v-spacer>
        <v-btn variant="outlined" class="text-none" :disabled="loading" @click="emit('close')">
          Cancel
        </v-btn>
        <v-btn
          v-if="step < 2"
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          append-icon="mdi-arrow-right"
          @click="nextStep"
        >
          Next
        </v-btn>
        <v-btn
          v-else
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          :loading="loading"
          @click="onSubmit"
        >
          {{ dialogMode === 'create' ? 'Add Supplier' : 'Save Changes' }}
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