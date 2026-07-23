<script setup lang="ts">
import { computed } from 'vue'
import { formatDatePR_ISO } from '@/utils/helpers'
import type { RequestHistoryItem } from '../composables/useRequestHistory'
import {
  getStatusColor,
  getStatusIcon,
  getStatusLabel,
  getRequestTypeLabel,
  getRequisitionRef,
} from '../helpers/requestHistoryHelpers'

const dialog = defineModel<boolean>('modelValue', { default: false })

const props = defineProps<{ request?: RequestHistoryItem | null }>()

const handleClose = () => {
  dialog.value = false
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="600" scrollable>
    <v-card v-if="props.request" rounded="lg">
      <v-card-title class="d-flex align-center justify-space-between pa-4">
        <div class="d-flex align-center ga-2">
          <v-avatar
            size="36"
            rounded="lg"
            :color="getStatusColor(props.request.status)"
            variant="tonal"
          >
            <v-icon
              :color="getStatusColor(props.request.status)"
              :icon="getStatusIcon(props.request.status)"
              size="20"
            />
          </v-avatar>
          <span class="text-h6 font-weight-bold">Request Details</span>
        </div>
        <v-btn icon size="small" variant="text" @click="handleClose">
          <v-icon icon="mdi-close" />
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4 pa-md-6">
        <div class="d-flex align-center ga-2 mb-4">
          <v-chip
            :color="getStatusColor(props.request.status)"
            variant="tonal"
            size="small"
            class="font-weight-bold"
          >
            <v-icon start size="14">{{ getStatusIcon(props.request.status) }}</v-icon>
            {{ getStatusLabel(props.request.status) }}
          </v-chip>
          <v-chip color="purple" variant="outlined" size="small">
            {{ getRequestTypeLabel(props.request.request_type) }}
          </v-chip>
          <v-spacer />
          <span class="text-caption text-medium-emphasis">#{{ props.request.id }}</span>
        </div>

        <v-sheet rounded="lg" variant="tonal" color="surface-variant" class="pa-3 mb-4">
          <div class="d-flex align-center ga-3">
            <v-avatar size="36" rounded="lg" color="primary" variant="tonal" class="flex-shrink-0">
              <v-icon color="primary" icon="mdi-file-document-outline" size="18" />
            </v-avatar>
            <div class="flex-grow-1" style="min-width: 0">
              <div class="text-body-2 font-weight-bold text-green">
                {{ getRequisitionRef(props.request) }}
              </div>
              <div class="text-caption text-medium-emphasis">Purchase Requisition</div>
            </div>
          </div>

          <v-divider class="my-3" />

          <div class="d-flex ga-6 flex-wrap">
            <div>
              <div class="text-caption text-medium-emphasis">Requested by</div>
              <div class="text-body-2 text-high-emphasis">
                {{ props.request.created_by_email ?? '—' }}
              </div>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis">Requested on</div>
              <div class="text-body-2 text-high-emphasis">
                {{ formatDatePR_ISO(props.request.created_at) }}
              </div>
            </div>
          </div>
        </v-sheet>

        <div v-if="props.request.summary" class="mb-4">
          <div class="text-caption font-weight-bold text-medium-emphasis mb-1">SUMMARY</div>
          <v-sheet rounded="lg" variant="tonal" color="surface-variant" class="pa-3 text-body-2">
            {{ props.request.summary }}
          </v-sheet>
        </div>

        <div v-if="props.request.reason" class="mb-4">
          <div class="text-caption font-weight-bold text-medium-emphasis mb-1">REASON</div>
          <v-sheet
            rounded="lg"
            variant="tonal"
            color="surface-variant"
            class="pa-3 text-body-2 border-s-lg"
            :class="props.request.status === 'approved' ? 'border-success' : 'border-error'"
          >
            {{ props.request.reason }}
          </v-sheet>
        </div>

        <div v-if="props.request.resolved_at" class="mb-4">
          <div class="text-caption font-weight-bold text-medium-emphasis mb-1">RESOLUTION</div>
          <v-sheet rounded="lg" variant="tonal" color="surface-variant" class="pa-3">
            <div class="d-flex flex-column ga-2">
              <div class="d-flex ga-4">
                <div>
                  <div class="text-caption text-medium-emphasis">Resolved by</div>
                  <div class="text-body-2 text-high-emphasis">
                    {{ props.request.resolved_by_email ?? '—' }}
                  </div>
                </div>
                <div>
                  <div class="text-caption text-medium-emphasis">Resolved on</div>
                  <div class="text-body-2 text-high-emphasis">
                    {{ formatDatePR_ISO(props.request.resolved_at) }}
                  </div>
                </div>
              </div>
              <div v-if="props.request.resolution_note">
                <div class="text-caption text-medium-emphasis">Note</div>
                <div class="text-body-2 text-high-emphasis">
                  {{ props.request.resolution_note }}
                </div>
              </div>
            </div>
          </v-sheet>
        </div>

        <div
          v-if="props.request.from_transaction_no || props.request.to_transaction_no"
          class="mb-4"
        >
          <div class="text-caption font-weight-bold text-medium-emphasis mb-1">
            TRANSACTION REFERENCES
          </div>
          <v-sheet rounded="lg" variant="tonal" color="surface-variant" class="pa-3">
            <div class="d-flex ga-6 flex-wrap">
              <div v-if="props.request.from_transaction_no">
                <div class="text-caption text-medium-emphasis">From</div>
                <div class="text-body-2 text-high-emphasis">
                  {{ props.request.from_transaction_no }}
                </div>
              </div>
              <div v-if="props.request.to_transaction_no">
                <div class="text-caption text-medium-emphasis">To</div>
                <div class="text-body-2 text-high-emphasis">
                  {{ props.request.to_transaction_no }}
                </div>
              </div>
            </div>
          </v-sheet>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4 d-flex justify-end">
        <v-btn variant="outlined" class="text-none" @click="handleClose"> Close </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.border-s-lg {
  border-left-width: 4px !important;
  border-left-style: solid;
}
.border-success {
  border-left-color: rgb(var(--v-theme-success)) !important;
}
.border-error {
  border-left-color: rgb(var(--v-theme-error)) !important;
}
</style>
