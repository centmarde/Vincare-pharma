<template>
  <v-form @submit.prevent="submit">
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
    <v-select v-model="form.agent_id" :items="agentOptions" label="Agent" item-title="title" item-value="value" />
    <v-checkbox v-model="form.is_active" label="Active" />
    <div class="d-flex gap-2 mt-4">
      <v-btn color="primary" type="submit">Save</v-btn>
      <v-btn @click="$emit('cancel')">Cancel</v-btn>
    </div>
  </v-form>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import type { CreateCustomerData } from '@/stores/customersData'
import type { AgentType } from '@/stores/agentsData'

interface Props {
  customer?: any
  agentOptions?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  agentOptions: () => [],
})

const emit = defineEmits<{ submit: [CreateCustomerData]; cancel: [] }>()

const required = [(v: any) => !!v || 'Required']

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
})

function submit() {
  emit('submit', form)
}
</script>
