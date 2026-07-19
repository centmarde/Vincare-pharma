<script setup lang="ts">
import { ref } from 'vue'
import ActionRequiredDialog from '../dialogs/ActionRequiredDialog.vue'
import { useChangeRequests } from '../../finance/composables/useChangeRequests'
import { formatDatePR_ISO } from '@/utils/helpers'

const { requests, loading } = useChangeRequests()
const selected = ref(false)
const selectedReq = ref<any | null>(null)
</script>

<template>
  <v-card class="rounded-xl" elevation="0">
    <v-card-text class="pa-4 pa-md-6">
      <v-row align="center" class="mb-2">
        <v-col cols="auto">
          <v-icon icon="mdi-bell-ring-outline" color="error" size="20" />
        </v-col>
        <v-col>
          <span class="text-h6 font-weight-bold">Action Required</span>
        </v-col>
      </v-row>

      <div v-if="loading" class="pa-4 text-center text-caption text-medium-emphasis">Loading requests…</div>

      <template v-else-if="requests.length">
        <div
          v-for="req in requests"
          :key="req.id"
          class="py-2"
          style="cursor: pointer"
          @click="selectedReq = req; selected = true"
        >
          <v-row align="center" dense>
            <v-col cols="auto">
              <v-avatar
                size="28"
                rounded="lg"
                :color="req.request_type === 'void' ? 'error' : 'primary'"
                variant="tonal"
              >
                <v-icon
                  :color="req.request_type === 'void' ? 'error' : 'primary'"
                  :icon="req.request_type === 'void' ? 'mdi-cancel' : 'mdi-pencil-circle-outline'"
                  size="16"
                />
              </v-avatar>
            </v-col>
            <v-col class="d-flex align-center ga-2">
              <span class="text-body-2 font-weight-medium">{{ req.target_ref ?? `#${req.target_id}` }}</span>
              <v-chip size="x-small" :color="req.request_type === 'void' ? 'error' : 'primary'" variant="tonal" label>
                {{ req.request_type === 'void' ? 'Undo' : 'Edit' }}
              </v-chip>
              <v-chip size="x-small" color="grey" variant="tonal" label>{{ req.module }}</v-chip>
            </v-col>
            <v-col cols="auto" class="text-right">
              <div class="text-caption text-medium-emphasis">
                {{ formatDatePR_ISO(req.created_at) }}
              </div>
            </v-col>
          </v-row>
          <v-divider class="mt-2" />
        </div>
      </template>

      <div v-else class="pa-4 text-center text-caption text-medium-emphasis">
        No pending change requests.
      </div>

      <ActionRequiredDialog v-model="selected" :request="selectedReq" />
    </v-card-text>
  </v-card>
</template>
