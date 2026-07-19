<script setup lang="ts">
import { useChangeRequests } from '../../finance/composables/useChangeRequests'
import { formatDatePR_ISO } from '@/utils/helpers'
import { computed } from 'vue'

const { requests, approve, reject } = useChangeRequests()

const selected = defineModel<boolean>('modelValue', { default: false })
const props = defineProps<{ request?: any }>()

const request = computed(() => props.request)
</script>

<template>
  <v-dialog v-model="selected" max-width="900">
    <v-card class="rounded-xl" elevation="0">
      <v-card-text class="pa-4 pa-md-6">
        <div class="d-flex align-center justify-end mb-2">
          <v-btn icon size="small" variant="text" @click="selected = false">
            <v-icon icon="mdi-close" />
          </v-btn>
        </div>

        <div v-if="!request" class="pa-6 text-center text-caption text-medium-emphasis">No request selected.</div>

        <template v-else>
          <div class="pb-4 mb-3" style="border-bottom: 1px solid #eee">
            <div class="d-flex align-center ga-3 flex-grow-1 pr-3 flex-wrap">
              <v-avatar
                size="36"
                rounded="lg"
                :color="request.request_type === 'void' ? 'error' : 'primary'"
                variant="tonal"
                class="flex-shrink-0"
              >
                <v-icon
                  :color="request.request_type === 'void' ? 'error' : 'primary'"
                  :icon="request.request_type === 'void' ? 'mdi-cancel' : 'mdi-pencil-circle-outline'"
                  size="18"
                />
              </v-avatar>
              <div class="flex-grow-1" style="min-width: 0">
                <div class="d-flex align-center ga-2">
                  <span class="text-body-2 font-weight-medium text-truncate">
                    {{ request.target_ref ?? `#${request.target_id}` }}
                  </span>
                  <v-chip
                    size="x-small"
                    :color="request.request_type === 'void' ? 'error' : 'primary'"
                    variant="tonal"
                    label
                    class="flex-shrink-0"
                  >
                    {{ request.request_type === 'void' ? 'Undo' : 'Edit' }}
                  </v-chip>
                </div>
                <div class="text-caption text-medium-emphasis mt-1">
                  {{ request.summary ?? (request.request_type === 'void' ? 'Undo this document.' : 'Edit this document.') }}
                </div>
              </div>
              <div class="text-right flex-shrink-0">
                <div class="text-caption text-medium-emphasis">
                  {{ request.created_by_email ?? '—' }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  {{ formatDatePR_ISO(request.created_at) }}
                </div>
              </div>
            </div>
          </div>

          <template v-if="request.request_type === 'edit' && Object.keys(request.proposed_changes || {}).length">
            <div class="text-caption font-weight-bold mb-1">Before → After</div>
            <v-table density="compact" class="mb-3" style="border:1px solid #eee; border-radius:8px">
              <thead>
                <tr>
                  <th class="text-left">Field</th>
                  <th class="text-left">Before</th>
                  <th class="text-left">After</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(diff, key) in request.proposed_changes" :key="key">
                  <td class="font-weight-medium">{{ key }}</td>
                  <td class="text-medium-emphasis text-decoration-line-through">{{ diff.from ?? '—' }}</td>
                  <td class="font-weight-bold text-success">{{ diff.to ?? '—' }}</td>
                </tr>
              </tbody>
            </v-table>
          </template>

          <div class="text-caption font-weight-bold">Reason</div>
          <div class="text-body-2 mb-1">{{ request.reason ?? '—' }}</div>
          <div class="text-caption text-medium-emphasis mb-3">{{ request.module }}</div>

          <div class="d-flex justify-end ga-2">
            <v-btn size="small" variant="outlined" color="error" class="text-none" @click="reject(request.id)">Reject</v-btn>
            <v-btn size="small" color="success" class="text-none font-weight-bold" elevation="0" @click="approve(request.id)">
              Approve & Apply
            </v-btn>
          </div>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
