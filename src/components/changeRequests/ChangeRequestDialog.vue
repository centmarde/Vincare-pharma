<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ChangeRequestField, ProposedChange } from '@/stores/changeRequestsData'

const props = defineProps<{
  modelValue: boolean
  targetRef: string | null
  fields: ChangeRequestField[]
  allowEdit: boolean
  allowVoid: boolean
  voidSummary: string   // human description of what an undo/void will do
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', payload: { requestType: 'edit' | 'void'; proposedChanges: ProposedChange; summary: string; reason: string }): void
}>()

const mode = ref<'edit' | 'void'>('edit')
const draft = ref<Record<string, string | number | null>>({})
const reason = ref('')

// Reset the form each time the dialog opens (prefill edit fields with current values).
watch(() => props.modelValue, (open) => {
  if (!open) return
  mode.value = props.allowEdit ? 'edit' : 'void'
  reason.value = ''
  const next: Record<string, string | number | null> = {}
  for (const f of props.fields) next[f.key] = f.value
  draft.value = next
})

const changedFields = computed(() =>
  props.fields
    .filter((f) => normalize(draft.value[f.key]) !== normalize(f.value))
    .map((f) => ({
      key: f.key,
      label: f.label,
      from: f.value,
      to: draft.value[f.key],
      fromDisplay: displayValue(f, f.value),
      toDisplay: displayValue(f, draft.value[f.key]),
    })))

function normalize(v: string | number | null): string {
  return v == null ? '' : String(v)
}

function displayValue(field: ChangeRequestField, raw: string | number | null): string {
  if (raw == null || raw === '') return '—'
  if (field.type === 'select') return field.items?.find((i) => i.value === raw)?.title ?? String(raw)
  return String(raw)
}

const proposedChanges = computed<ProposedChange>(() => {
  const out: ProposedChange = {}
  for (const c of changedFields.value) out[c.key] = { from: c.from, to: c.to }
  return out
})

const editSummary = computed(() =>
  changedFields.value.map((c) => `${c.label}: ${c.fromDisplay} → ${c.toDisplay}`).join('; '))

const canSubmit = computed(() => {
  if (!reason.value.trim()) return false
  return mode.value === 'void' ? true : changedFields.value.length > 0
})

function submit() {
  if (mode.value === 'void') {
    emit('submit', { requestType: 'void', proposedChanges: {}, summary: props.voidSummary, reason: reason.value.trim() })
  } else {
    emit('submit', { requestType: 'edit', proposedChanges: proposedChanges.value, summary: editSummary.value, reason: reason.value.trim() })
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="620"
    persistent
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-2">
        <div class="text-h6 font-weight-bold">Request Change</div>
        <div class="text-caption text-medium-emphasis">
          {{ targetRef ?? 'Document' }} — needs executive approval before it takes effect.
        </div>
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <v-btn-toggle v-model="mode" mandatory density="compact" color="primary" variant="outlined" class="mb-4">
          <v-btn v-if="allowEdit" value="edit" size="small" class="text-none">Edit fields</v-btn>
          <v-btn v-if="allowVoid" value="void" size="small" class="text-none">Undo / Void</v-btn>
        </v-btn-toggle>

        <!-- EDIT: prefilled fields + live diff -->
        <template v-if="mode === 'edit'">
          <v-row dense>
            <v-col v-for="f in fields" :key="f.key" cols="12" sm="6">
              <v-select
                v-if="f.type === 'select'"
                v-model="draft[f.key]" :items="f.items" :label="f.label"
                variant="outlined" density="compact" hide-details />
              <v-text-field
                v-else
                v-model="draft[f.key]" :label="f.label"
                :type="f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'"
                variant="outlined" density="compact" hide-details />
            </v-col>
          </v-row>

          <v-alert v-if="changedFields.length" type="info" variant="tonal" density="compact" class="mt-4">
            <div class="text-caption font-weight-bold mb-1">What will change ({{ changedFields.length }})</div>
            <div v-for="c in changedFields" :key="c.key" class="text-caption">
              <b>{{ c.label }}:</b> {{ c.fromDisplay }} → {{ c.toDisplay }}
            </div>
          </v-alert>
          <div v-else class="text-caption text-medium-emphasis mt-3">
            Change a field above to propose an edit.
          </div>
        </template>

        <!-- VOID -->
        <template v-else>
          <v-alert type="warning" variant="tonal" density="compact">
            {{ voidSummary }}
          </v-alert>
        </template>

        <v-textarea
          v-model="reason"
          label="Reason (required)"
          placeholder="Why is this change needed? The approver will see this."
          variant="outlined" density="compact" rows="2" class="mt-4" hide-details />
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4 justify-end" style="gap:8px">
        <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn
          color="primary" class="text-none font-weight-bold" elevation="0"
          :disabled="!canSubmit" :loading="loading"
          @click="submit">
          Submit for Approval
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
