<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { CreateOutletData, OutletType } from '@/stores/outletsData'

interface Props {
  outlet?: OutletType
}

const props = defineProps<Props>()
const emit = defineEmits<{ submit: [CreateOutletData]; cancel: [] }>()

const required = [(v: any) => !!v?.toString().trim() || 'Required']

const channelOptions = [
  { title: 'POS (Exelmed-style)', value: 'pos' },
  { title: 'Ethical', value: 'ethical' },
]

const form = reactive<CreateOutletData>({
  code: props.outlet?.code ?? '',
  name: props.outlet?.name ?? '',
  channel: props.outlet?.channel ?? 'pos',
  region: props.outlet?.region ?? null,
  is_active: props.outlet?.is_active ?? true,
})

// v-text-field :rules only render an error message — they never block a
// submit on their own, so an empty Code/Name could previously sail straight
// into the database (that's how branch id=5 ended up with code = '').
const formRef = ref()

async function submit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return
  emit('submit', form)
}
</script>

<template>
  <v-form ref="formRef" @submit.prevent="submit">
    <v-text-field
      v-model="form.code"
      label="Code"
      hint="Short unique code, e.g. EXELMED-CGY. Fixed after creation — rename the branch via Name instead."
      persistent-hint
      :disabled="!!props.outlet"
      :rules="required"
    />
    <v-text-field v-model="form.name" label="Name" class="mt-4" :rules="required" />
    <v-select v-model="form.channel" :items="channelOptions" item-title="title" item-value="value" label="Channel" class="mt-4" :rules="required" />
    <v-text-field v-model="form.region" label="Region" class="mt-4" />
    <v-checkbox v-model="form.is_active" label="Active" />
    <div class="d-flex gap-2 mt-4">
      <v-btn color="primary" type="submit">Save</v-btn>
      <v-btn @click="$emit('cancel')">Cancel</v-btn>
    </div>
  </v-form>
</template>
