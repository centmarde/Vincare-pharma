<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { CreateCustomerData } from '@/stores/customersData'
import type { AgentType } from '@/stores/agentsData'

interface Props {
  customer?: any
  agentOptions?: any[]
  businessStructureOptions?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  agentOptions: () => [],
  businessStructureOptions: () => [],
})

const emit = defineEmits<{ submit: [CreateCustomerData]; cancel: [] }>()

const required = [(v: any) => !!v || 'Required']
// Legal structure drives which registration number is required — the
// accountant's "avoid ghost transactions" control: every AR balance should
// tie to a verifiably real, registered entity.
const requiredIfSec = [
  (v: any) =>
    (form.business_structure !== 'corporation' && form.business_structure !== 'partnership') ||
    !!v || 'SEC Registration No. is required for this business structure',
]
const requiredIfDti = [
  (v: any) =>
    form.business_structure !== 'sole_proprietorship' ||
    !!v || 'DTI Registration No. is required for this business structure',
]

const form = reactive<CreateCustomerData>({
  name: props.customer?.name ?? null,
  agency_type: props.customer?.agency_type ?? 'private',
  contact_person: props.customer?.contact_person ?? null,
  contact_no: props.customer?.contact_no ?? null,
  email: props.customer?.email ?? null,
  address: props.customer?.address ?? null,
  agent_id: props.customer?.agent_id ?? null,
  is_active: props.customer?.is_active ?? true,
  department: 'ethical',
  is_vat_registered: props.customer?.is_vat_registered ?? false,
  tin_number: props.customer?.tin_number ?? null,
  business_structure: props.customer?.business_structure ?? 'other',
  sec_registration_no: props.customer?.sec_registration_no ?? null,
  dti_registration_no: props.customer?.dti_registration_no ?? null,
})

const formRef = ref()

async function submit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return
  emit('submit', form)
}
</script>

<template>
  <v-form ref="formRef" @submit.prevent="submit">
    <v-text-field v-model="form.name" label="Name" :rules="required" />
    <v-select
      v-model="form.agency_type"
      :items="[{ title: 'Government', value: 'government' }, { title: 'LGU', value: 'lgu' }, { title: 'Private', value: 'private' }]"
      label="Type"
    />
    <v-text-field v-model="form.contact_person" label="Contact Person" />
    <v-text-field v-model="form.contact_no" label="Phone" />
    <v-text-field v-model="form.email" label="Email" type="email" />
    <v-text-field v-model="form.address" label="Address" />
    <v-text-field
      v-model="form.tin_number"
      label="TIN"
      hint="BIR Tax Identification Number, e.g. 123-456-789-000"
      persistent-hint
      class="mb-2"
    />
    <v-radio-group v-model="form.is_vat_registered" label="VAT classification" inline hide-details class="mt-1 mb-2">
      <v-radio label="VAT-registered" :value="true" />
      <v-radio label="Non-VAT" :value="false" />
    </v-radio-group>

    <v-select
      v-model="form.business_structure"
      :items="businessStructureOptions"
      label="Business Structure"
      class="mb-2"
    />
    <v-text-field
      v-if="form.business_structure === 'corporation' || form.business_structure === 'partnership'"
      v-model="form.sec_registration_no"
      label="SEC Registration No."
      hint="Securities and Exchange Commission registration number"
      persistent-hint
      :rules="requiredIfSec"
      class="mb-2"
    />
    <v-text-field
      v-if="form.business_structure === 'sole_proprietorship'"
      v-model="form.dti_registration_no"
      label="DTI Registration No."
      hint="DTI Certificate of Business Name Registration number"
      persistent-hint
      :rules="requiredIfDti"
      class="mb-2"
    />

    <v-select v-model="form.agent_id" :items="agentOptions" label="Agent" item-title="title" item-value="value" class="mt-2" />
    <v-checkbox v-model="form.is_active" label="Active" />
    <div class="d-flex gap-2 mt-4">
      <v-btn color="primary" type="submit">Save</v-btn>
      <v-btn @click="$emit('cancel')">Cancel</v-btn>
    </div>
  </v-form>
</template>
