<script setup lang="ts">
import { ref } from 'vue'
import type { CreateCustomerData, CustomerType } from '@/stores/customersData'
import type { DiscountProfile } from '@/stores/discountsData'
import { agencyTypes, businessStructures } from '../composables/useCustomers'
import CustomerTermsCard from '@/components/customers/CustomerTermsCard.vue'

interface Props {
  modelValue: boolean
  mobile: boolean
  editingId: number | null
  form: CreateCustomerData
  rules: Record<string, (value: unknown) => boolean | string>
  loading: boolean
  editingCustomer: CustomerType | null
  profileFor: (id: number | null | undefined) => DiscountProfile | null | undefined
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  cancel: []
  submit: []
}>()

const formRef = ref()

async function onSubmit() {
  const { valid } = await formRef.value.validate()

  if (!valid) {
    return
  }

  emit('submit')
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :fullscreen="mobile"
    :max-width="mobile ? undefined : 640"
    :transition="mobile ? 'dialog-bottom-transition' : undefined"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card :rounded="mobile ? '0' : 'lg'">
      <v-toolbar v-if="mobile" color="surface" density="comfortable">
        <v-btn icon="mdi-close" @click="emit('cancel')" />

        <v-toolbar-title class="text-body-1 font-weight-bold">
          {{ editingId ? 'Edit Customer' : 'New Customer' }}
        </v-toolbar-title>

        <v-btn
          variant="flat"
          color="primary"
          class="text-none mr-2"
          :loading="loading"
          @click="onSubmit"
        >
          {{ editingId ? 'Save' : 'Create' }}
        </v-btn>
      </v-toolbar>

      <v-card-title v-else class="pa-4 pa-sm-5 d-flex align-center ga-2">
        <v-icon
          :icon="editingId ? 'mdi-account-edit-outline' : 'mdi-account-plus-outline'"
          color="primary"
        />

        <span class="text-h6 font-weight-bold">
          {{ editingId ? 'Edit Customer' : 'New Customer' }}
        </span>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <v-form ref="formRef">
          <CustomerTermsCard
            v-if="editingCustomer"
            :customer="editingCustomer"
            :profile="profileFor(editingCustomer.id)"
            class="mb-3"
          />

          <v-text-field
            v-model="form.name"
            label="Name *"
            :rules="[rules.required]"
            variant="outlined"
            density="compact"
            class="mb-3"
            prepend-inner-icon="mdi-account-outline"
          />

          <v-row dense>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.agency_type"
                :items="agencyTypes"
                label="Type"
                variant="outlined"
                density="compact"
                class="mb-3"
                hide-details
                prepend-inner-icon="mdi-domain"
              />
            </v-col>

            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.contact_person"
                label="Contact person"
                variant="outlined"
                density="compact"
                class="mb-3"
                hide-details
                prepend-inner-icon="mdi-account-tie-outline"
              />
            </v-col>
          </v-row>

          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.contact_no"
                label="Contact no."
                variant="outlined"
                density="compact"
                class="mb-3"
                hide-details
                prepend-inner-icon="mdi-phone-outline"
              />
            </v-col>

            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.email"
                label="Email"
                variant="outlined"
                density="compact"
                class="mb-3"
                hide-details
                prepend-inner-icon="mdi-email-outline"
              />
            </v-col>
          </v-row>

          <v-textarea
            v-model="form.address"
            label="Address"
            variant="outlined"
            density="compact"
            rows="2"
            class="mb-3"
            hide-details
            prepend-inner-icon="mdi-home-outline"
          />

          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.area"
                label="Area"
                hint="Sales area — a column on the Statement of Accounts register"
                persistent-hint
                variant="outlined"
                density="compact"
                class="mb-3"
                prepend-inner-icon="mdi-map-marker-outline"
              />
            </v-col>

            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.term_days"
                label="Payment terms"
                placeholder="e.g. 60 Days, COD, Consignment"
                hint="A leading number sets the due date; without one the receivable cannot be aged."
                persistent-hint
                variant="outlined"
                density="compact"
                class="mb-3"
                prepend-inner-icon="mdi-calendar-clock-outline"
              />
            </v-col>
          </v-row>

          <v-text-field
            v-model="form.tin_number"
            label="TIN"
            hint="BIR Tax Identification Number, e.g. 123-456-789-000"
            persistent-hint
            variant="outlined"
            density="compact"
            class="mb-3"
            prepend-inner-icon="mdi-card-account-details-outline"
          />

          <v-radio-group
            v-model="form.is_vat_registered"
            label="VAT classification"
            :inline="!mobile"
            hide-details
            class="mt-1 mb-3"
          >
            <v-radio label="VAT-registered" :value="true" />

            <v-radio label="Non-VAT" :value="false" />
          </v-radio-group>

          <v-select
            v-model="form.business_structure"
            :items="businessStructures"
            label="Business Structure"
            variant="outlined"
            density="compact"
            class="mb-3"
            hide-details
            prepend-inner-icon="mdi-bank-outline"
          />

          <v-text-field
            v-if="
              form.business_structure === 'corporation' ||
              form.business_structure === 'partnership'
            "
            v-model="form.sec_registration_no"
            label="SEC Registration No. *"
            hint="Securities and Exchange Commission registration number"
            persistent-hint
            :rules="[rules.requiredIfSec]"
            variant="outlined"
            density="compact"
            class="mb-3"
            prepend-inner-icon="mdi-file-document-outline"
          />

          <v-text-field
            v-if="form.business_structure === 'sole_proprietorship'"
            v-model="form.dti_registration_no"
            label="DTI Registration No. *"
            hint="DTI Certificate of Business Name Registration number"
            persistent-hint
            :rules="[rules.requiredIfDti]"
            variant="outlined"
            density="compact"
            class="mb-3"
            prepend-inner-icon="mdi-file-document-outline"
          />
        </v-form>
      </v-card-text>

      <template v-if="!mobile">
        <v-divider />

        <v-card-actions class="pa-4">
          <v-spacer />

          <v-btn variant="text" class="text-none" @click="emit('cancel')"> Cancel </v-btn>

          <v-btn
            color="primary"
            variant="flat"
            class="text-none px-6"
            :loading="loading"
            @click="onSubmit"
          >
            {{ editingId ? 'Save changes' : 'Create customer' }}
          </v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
</template>