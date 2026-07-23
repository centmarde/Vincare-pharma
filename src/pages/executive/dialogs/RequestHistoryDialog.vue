<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatDatePR_ISO } from '@/utils/helpers'
import type { RequestHistoryItem } from '../composables/useRequestHistory'

const dialog = defineModel<boolean>('modelValue', { default: false })

const props = defineProps<{ request?: RequestHistoryItem | null }>()

const emit = defineEmits<{
  close: []
}>()

const request = computed(() => props.request)

const handleClose = () => {
  emit('close')
}

// Helpers
function getStatusColor(status: string): string {
  return status === 'approved' ? 'green' : 'error'
}

function getStatusIcon(status: string): string {
  return status === 'approved' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline'
}

function getStatusLabel(status: string): string {
  return status === 'approved' ? 'Approved' : 'Rejected'
}

function getRequestTypeLabel(type: string): string {
  switch (type) {
    case 'undo_pr':
      return 'Undo PR'
    case 'void':
      return 'Void'
    case 'edit':
      return 'Edit'
    default:
      return type
  }
}
</script>

<template>
  <v-dialog
    v-model="dialog"
    max-width="600"
    scrollable
    @click:outside="handleClose"
    @keydown.esc="handleClose"
  >
    <v-card rounded="lg">
      <!-- Header -->
      <v-card-title class="d-flex align-center justify-space-between pa-4">
        <div class="d-flex align-center ga-2">
          <v-icon
            :icon="request ? getStatusIcon(request.status) : 'mdi-history'"
            :color="request ? getStatusColor(request.status) : 'primary'"
          />
          <span class="text-h6 font-weight-bold">Request History</span>
        </div>
        <v-btn icon size="small" variant="text" @click="handleClose">
          <v-icon icon="mdi-close" />
        </v-btn>
      </v-card-title>

      <v-divider />

      <template v-if="!request">
        <v-card-text class="text-center pa-8 text-medium-emphasis">
          <v-icon icon="mdi-history" size="48" color="grey-lighten-1" class="mb-3" />
          <div>No request selected</div>
        </v-card-text>
      </template>

      <template v-else>
        <v-card-text class="pa-4 pa-md-6">
          <!-- Status badge -->
          <div class="d-flex align-center ga-2 mb-4">
            <v-chip
              :color="getStatusColor(request.status)"
              variant="tonal"
              size="small"
              class="font-weight-bold"
            >
              <v-icon start size="14">{{ getStatusIcon(request.status) }}</v-icon>
              {{ getStatusLabel(request.status) }}
            </v-chip>
            <v-chip
              color="purple"
              variant="outlined"
              size="small"
            >
              {{ getRequestTypeLabel(request.request_type) }}
            </v-chip>
            <v-spacer />
            <span class="text-caption text-medium-emphasis">#{{ request.id }}</span>
          </div>

          <!-- Document reference -->
          <v-sheet
            rounded="lg"
            variant="tonal"
            color="surface-variant"
            class="pa-3 mb-4"
          >
            <div class="d-flex align-center ga-3">
              <v-avatar size="36" rounded="lg" color="primary" variant="tonal" class="flex-shrink-0">
                <v-icon color="primary" icon="mdi-file-document-outline" size="18" />
              </v-avatar>
              <div class="flex-grow-1" style="min-width: 0">
                <div class="text-body-2 font-weight-bold text-green">
                  {{ request.requisition_no ?? request.from_transaction_no ?? `#${request.transaction_id}` }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  Purchase Requisition
                </div>
              </div>
            </div>

            <v-divider class="my-3" />

            <div class="d-flex ga-6 flex-wrap">
              <div>
                <div class="text-caption text-medium-emphasis">Requested by</div>
                <div class="text-body-2 text-high-emphasis">{{ request.created_by_email ?? '—' }}</div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">Requested on</div>
                <div class="text-body-2 text-high-emphasis">{{ formatDatePR_ISO(request.created_at) }}</div>
              </div>
            </div>
          </v-sheet>

          <!-- Request details -->
          <div v-if="request.summary" class="mb-4">
            <div class="text-caption font-weight-bold text-medium-emphasis mb-1">
              SUMMARY
            </div>
            <v-sheet
              rounded="lg"
              variant="tonal"
              color="surface-variant"
              class="pa-3 text-body-2"
            >
              {{ request.summary }}
            </v-sheet>
          </div>

          <div v-if="request.reason" class="mb-4">
            <div class="text-caption font-weight-bold text-medium-emphasis mb-1">
              REASON
            </div>
            <v-sheet
              rounded="lg"
              variant="tonal"
              color="surface-variant"
              class="pa-3 text-body-2 border-s-lg"
              :class="request.status === 'approved' ? 'border-success' : 'border-error'"
            >
              {{ request.reason }}
            </v-sheet>
          </div>

          <!-- Resolution details (only for resolved requests) -->
          <div v-if="request.resolved_at" class="mb-4">
            <div class="text-caption font-weight-bold text-medium-emphasis mb-1">
              RESOLUTION
            </div>
            <v-sheet
              rounded="lg"
              variant="tonal"
              color="surface-variant"
              class="pa-3"
            >
              <div class="d-flex flex-column ga-2">
                <div class="d-flex ga-4">
                  <div>
                    <div class="text-caption text-medium-emphasis">Resolved by</div>
                    <div class="text-body-2 text-high-emphasis">{{ request.resolved_by_email ?? '—' }}</div>
                  </div>
                  <div>
                    <div class="text-caption text-medium-emphasis">Resolved on</div>
                    <div class="text-body-2 text-high-emphasis">{{ formatDatePR_ISO(request.resolved_at) }}</div>
                  </div>
                </div>
                <div v-if="request.resolution_note">
                  <div class="text-caption text-medium-emphasis">Note</div>
                  <div class="text-body-2 text-high-emphasis">{{ request.resolution_note }}</div>
                </div>
              </div>
            </v-sheet>
          </div>

          <!-- Transaction numbers -->
          <div v-if="request.from_transaction_no || request.to_transaction_no" class="mb-4">
            <div class="text-caption font-weight-bold text-medium-emphasis mb-1">
              TRANSACTION REFERENCES
            </div>
            <v-sheet
              rounded="lg"
              variant="tonal"
              color="surface-variant"
              class="pa-3"
            >
              <div class="d-flex ga-6 flex-wrap">
                <div v-if="request.from_transaction_no">
                  <div class="text-caption text-medium-emphasis">From</div>
                  <div class="text-body-2 text-high-emphasis">{{ request.from_transaction_no }}</div>
                </div>
                <div v-if="request.to_transaction_no">
                  <div class="text-caption text-medium-emphasis">To</div>
                  <div class="text-body-2 text-high-emphasis">{{ request.to_transaction_no }}</div>
                </div>
              </div>
            </v-sheet>
          </div>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-4 d-flex justify-end">
          <v-btn variant="outlined" class="text-none" @click="handleClose">
            Close
          </v-btn>
        </v-card-actions>
      </template>
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