<template>
  <v-form @submit.prevent="submit">
    <v-text-field v-model="form.name" label="Name" :rules="required" />
    <v-text-field v-model="form.email" label="Email" type="email" />
    <v-text-field v-model="form.contact_no" label="Phone" />
    <v-text-field v-model="form.area" label="Area" />
    <v-text-field v-model.number="form.commission_rate" label="Commission Rate (%)" type="number" min="0" max="100" />
    <v-checkbox v-model="form.is_active" label="Active" />
    <v-text-field v-model="form.notes" label="Notes" />
    <div class="d-flex gap-2 mt-4">
      <v-btn color="primary" type="submit">Save</v-btn>
      <v-btn @click="$emit('cancel')">Cancel</v-btn>
    </div>
  </v-form>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import type { CreateAgentData } from '@/stores/agentsData'

interface Props {
  agent?: any
}

const props = defineProps<Props>()
const emit = defineEmits<{ submit: [CreateAgentData]; cancel: [] }>()

const required = [(v: any) => !!v || 'Required']

const form = reactive<CreateAgentData>({
  name: props.agent?.name ?? null,
  email: props.agent?.email ?? null,
  contact_no: props.agent?.contact_no ?? null,
  area: props.agent?.area ?? null,
  commission_rate: props.agent?.commission_rate ?? 0,
  is_active: props.agent?.is_active ?? true,
  notes: props.agent?.notes ?? null,
})

function submit() {
  emit('submit', form)
}
</script>
