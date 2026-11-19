<script setup lang="ts">
import { useDisplay } from 'vuetify'
import type { ChangeHistoryEntry } from '@/utils/changeRequests'

// A document's change history: every request filed on it — what it asked to
// change (from → to), who asked and why, who decided and what that did.
// Read-only. The caller formats the values (account names, pesos, dates).

defineProps<{
  modelValue: boolean
  /** The document, e.g. "EXP-2026-334". */
  title: string
  entries: ChangeHistoryEntry[]
  loading: boolean
  /** The history could not be read (not the same as "no requests"). */
  failed?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'retry'): void
}>()

const { smAndDown } = useDisplay()

const statusLabel: Record<ChangeHistoryEntry['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

const statusColor: Record<ChangeHistoryEntry['status'], string> = {
  pending: 'warning',
  approved: 'green',
  rejected: 'error',
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="640" scrollable :fullscreen="smAndDown" @update:model-value="close">
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3 d-flex align-center ga-2">
        <v-icon icon="mdi-history" size="20" />
        <span class="text-h6 font-weight-bold">Change history — {{ title }}</span>
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <div v-if="loading" class="text-center py-6">
          <v-progress-circular indeterminate color="primary" />
        </div>
        <v-alert v-else-if="failed" type="error" variant="tonal" density="compact">
          <div class="d-flex align-center flex-wrap ga-2">
            <span class="flex-grow-1">Could not load the change history.</span>
            <v-btn size="small" variant="text" class="text-none" prepend-icon="mdi-refresh" @click="emit('retry')">Try again</v-btn>
          </div>
        </v-alert>
        <div v-else-if="!entries.length" class="text-body-2 text-medium-emphasis text-center py-6">
          No change requests on this document.
        </div>

        <v-sheet v-for="entry in entries" v-else :key="entry.id" rounded="lg" border class="pa-3 mb-3">
          <div class="d-flex align-center flex-wrap ga-2 mb-2">
            <span class="text-body-2 font-weight-bold">Request #{{ entry.id }} · {{ entry.kind }}</span>
            <v-chip size="x-small" variant="tonal" label :color="statusColor[entry.status]">
              {{ statusLabel[entry.status] }}
            </v-chip>
            <v-spacer />
            <span class="text-caption text-medium-emphasis">{{ entry.filedAt }}</span>
          </div>

          <div class="text-caption text-medium-emphasis mb-2">
            Asked by {{ entry.requestedBy ?? 'unknown' }}<template v-if="entry.reason"> — “{{ entry.reason }}”</template>
          </div>

          <v-table v-if="entry.changes.length" density="compact" class="border rounded mb-2">
            <thead>
              <tr>
                <th class="text-left">Field</th>
                <th class="text-left">Was</th>
                <th class="text-left">Changed to</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="change in entry.changes" :key="change.label">
                <td class="text-caption">{{ change.label }}</td>
                <td class="text-caption text-medium-emphasis">{{ change.from }}</td>
                <td class="text-caption font-weight-medium">{{ change.to }}</td>
              </tr>
            </tbody>
          </v-table>

          <div v-if="entry.status !== 'pending'" class="text-caption">
            <span class="text-medium-emphasis">
              {{ entry.status === 'approved' ? 'Approved' : 'Rejected' }} by {{ entry.resolvedBy ?? 'unknown' }}<template v-if="entry.resolvedAt">, {{ entry.resolvedAt }}</template>.
            </span>
            <span v-if="entry.outcome"> {{ entry.outcome }}</span>
          </div>
          <div v-else class="text-caption text-medium-emphasis">Waiting for approval.</div>
        </v-sheet>
      </v-card-text>

      <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
        <v-btn variant="text" class="text-none" @click="close">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
