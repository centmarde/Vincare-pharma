<script setup lang="ts">
import { useChangeRequests } from '../composables/useChangeRequests'
import { formatDatePR_ISO } from '@/utils/helpers'

const { requests, loading, approve, reject } = useChangeRequests()

const typeColor = (t: string) => (t === 'void' ? 'error' : 'primary')
const moduleColor: Record<string, string> = {
  finance: 'teal', sales: 'indigo', ethical: 'purple', inhouse: 'blue-grey', gl: 'brown',
}
</script>

<template>
  <v-container fluid class="pa-2">
    <v-card rounded="lg" class="mx-auto w-100">
      <v-card-title class="pa-4 pa-sm-5 pb-2">
        <div class="text-h6 font-weight-bold">Change Requests</div>
        <div class="text-caption text-medium-emphasis">
          Edit / undo requests on sales & finance documents awaiting executive approval.
          Approving applies the change; rejecting leaves the document untouched.
        </div>
      </v-card-title>
      <v-divider />

      <div v-if="loading" class="pa-6 text-center text-caption text-medium-emphasis">Loading requests…</div>
      <div v-else-if="!requests.length" class="pa-6 text-center text-caption text-medium-emphasis">
        No pending change requests.
      </div>

      <v-expansion-panels v-else variant="accordion" multiple>
        <v-expansion-panel v-for="req in requests" :key="req.id">
          <v-expansion-panel-title>
            <div class="d-flex align-center ga-3 flex-grow-1 pr-3 flex-wrap">
              <v-chip size="small" variant="tonal" :color="typeColor(req.request_type)" label>
                {{ req.request_type === 'void' ? 'Undo' : 'Edit' }}
              </v-chip>
              <v-chip size="x-small" variant="tonal" :color="moduleColor[req.module] ?? 'grey'" label>{{ req.module }}</v-chip>
              <span class="font-weight-medium">{{ req.target_ref ?? `#${req.target_id}` }}</span>
              <v-spacer />
              <span class="text-caption text-medium-emphasis">
                {{ req.created_by_email ?? '—' }} · {{ formatDatePR_ISO(req.created_at) }}
              </span>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="text-caption font-weight-bold mb-1">Proposed change</div>
            <div class="text-body-2 mb-3">{{ req.summary ?? (req.request_type === 'void' ? 'Undo this document.' : 'Edit this document.') }}</div>

            <template v-if="req.request_type === 'edit' && Object.keys(req.proposed_changes || {}).length">
              <v-table density="compact" class="mb-3" style="border:1px solid #eee; border-radius:8px">
                <thead>
                  <tr><th class="text-left">Field</th><th class="text-left">From</th><th class="text-left">To</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(diff, key) in req.proposed_changes" :key="key">
                    <td class="font-weight-medium">{{ key }}</td>
                    <td class="text-medium-emphasis">{{ diff.from ?? '—' }}</td>
                    <td class="font-weight-bold">{{ diff.to ?? '—' }}</td>
                  </tr>
                </tbody>
              </v-table>
            </template>

            <div class="text-caption font-weight-bold">Reason</div>
            <div class="text-body-2 mb-3">{{ req.reason ?? '—' }}</div>

            <div class="d-flex justify-end ga-2">
              <v-btn size="small" variant="outlined" color="error" class="text-none" @click="reject(req.id)">Reject</v-btn>
              <v-btn size="small" color="success" class="text-none font-weight-bold" elevation="0" @click="approve(req.id)">
                Approve &amp; Apply
              </v-btn>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card>
  </v-container>
</template>
