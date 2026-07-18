<script setup lang="ts">
const open = defineModel<boolean>({ required: true })
const category = defineModel<string | null>('category', { required: true })
const name = defineModel<string>('name', { required: true })
const isContra = defineModel<boolean>('isContra', { required: true })

defineProps<{
  categoryOptions: { title: string; value: string }[]
  previewCode: number | null
  canCreate: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'submit'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <v-dialog v-model="open" max-width="480px" persistent>
    <v-card rounded="lg">
      <v-card-title class="pa-4 pb-2 text-h6 font-weight-bold">New Account</v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <div class="text-caption text-medium-emphasis mb-3">
          Pick where this account belongs — the code is assigned automatically from that category's range.
        </div>

        <label class="lbl">Category <span class="text-error">*</span></label>
        <v-select
          v-model="category" :items="categoryOptions"
          placeholder="Select where this belongs"
          variant="outlined" density="compact" hide-details class="mb-3" />

        <label class="lbl">Account Name <span class="text-error">*</span></label>
        <v-text-field
          v-model="name" placeholder="e.g. Franchise Fee Expense"
          variant="outlined" density="compact" hide-details class="mb-3" />

        <v-checkbox
          v-model="isContra" density="compact" hide-details class="mb-2"
          label="This is a contra account (normal balance opposite its class, e.g. Sales Returns, Owner's Drawings)" />

        <v-alert v-if="previewCode" type="info" variant="tonal" density="compact">
          This account will be created as <b>{{ previewCode }}</b> — {{ name || '(name)' }}
        </v-alert>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4 justify-end" style="gap:8px">
        <v-btn variant="outlined" class="text-none" @click="emit('cancel')">Cancel</v-btn>
        <v-btn
          color="primary" class="text-none font-weight-bold" elevation="0"
          :disabled="!canCreate" :loading="loading"
          @click="emit('submit')">
          Create Account
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.lbl { display:block; font-size:.8rem; font-weight:600; color:#424242; margin-bottom:4px; }
</style>
