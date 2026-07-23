<script setup lang="ts">
import { ref, watch } from 'vue'
import RequestHistoryDialog from '../dialogs/RequestHistoryDialog.vue'
import { useRequestHistory } from '../composables/useRequestHistory'
import type { RequestHistoryItem } from '../composables/useRequestHistory'
import { formatDatePR_ISO } from '@/utils/helpers'

const {
  loading,
  paginatedRequests,
  requests,
  page,
  totalPages,
  totalItems,
  fetchHistory,
} = useRequestHistory()

const selected = ref(false)
const selectedReq = ref<RequestHistoryItem | null>(null)

watch(() => requests.value?.length, () => {
  page.value = 1
})

function openRequest(req: RequestHistoryItem) {
  selectedReq.value = req
  selected.value = true
}

function getStatusColor(status: string): string {
  return status === 'approved' ? 'success' : 'error'
}

function getStatusIcon(status: string): string {
  return status === 'approved' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline'
}

function getStatusLabel(status: string): string {
  return status === 'approved' ? 'Approved' : 'Rejected'
}
</script>

<template>
  <v-card class="rounded-xl" elevation="0">
    <v-card-text class="pa-4 pa-md-6">
      <v-row align="center" class="mb-2" no-gutters>
        <v-col cols="auto" class="mr-2">
          <v-icon icon="mdi-history" color="primary" size="20" />
        </v-col>
        <v-col>
          <span class="text-h6 font-weight-bold">Request History</span>
        </v-col>
        <v-col v-if="totalItems" cols="auto">
          <v-chip size="small" color="primary" variant="flat">{{ totalItems }}</v-chip>
        </v-col>
      </v-row>

      <div v-if="loading" class="pa-6 text-center text-caption text-medium-emphasis">
        <v-progress-circular indeterminate size="20" width="2" class="mb-2" />
        <div>Loading request history…</div>
      </div>

      <v-list v-else-if="requests.length" class="pa-0" lines="two">
        <template v-for="(req, i) in paginatedRequests" :key="req.id">
          <v-list-item
            class="px-2 py-3 rounded-lg history-item"
            @click="openRequest(req)"
          >
            <template #prepend>
              <v-avatar size="32" rounded="lg" :color="getStatusColor(req.status)" variant="tonal">
                <v-icon :color="getStatusColor(req.status)" :icon="getStatusIcon(req.status)" size="18" />
              </v-avatar>
            </template>

            <v-list-item-title class="d-flex align-center ga-2 mb-1">
              <v-chip
                size="x-small"
                :color="getStatusColor(req.status)"
                variant="tonal"
                label
              >
                {{ getStatusLabel(req.status) }}
              </v-chip>
              <span class="text-body-2 font-weight-medium">
                {{ req.requisition_no ?? req.from_transaction_no ?? `#${req.transaction_id}` }}
              </span>
              <v-spacer />
              <span class="text-caption text-medium-emphasis flex-shrink-0">
                {{ formatDatePR_ISO(req.resolved_at ?? req.created_at) }}
              </span>
            </v-list-item-title>

            <v-list-item-subtitle
              v-if="req.summary"
              class="text-caption text-medium-emphasis"
              style="white-space: normal; line-height: 1.4;"
            >
              <v-icon icon="mdi-comment-text-outline" size="12" class="mr-1" style="opacity: 0.7" />
              {{ req.summary }}
            </v-list-item-subtitle>

            <template #append>
              <v-icon icon="mdi-chevron-right" size="20" color="medium-emphasis" />
            </template>
          </v-list-item>

          <v-divider v-if="i < paginatedRequests.length - 1" class="my-1" />
        </template>

        <v-pagination
          v-if="totalPages > 1"
          v-model="page"
          :length="totalPages"
          density="compact"
          class="mt-4"
        />
      </v-list>

      <div v-else class="pa-6 text-center">
        <v-icon icon="mdi-history" size="32" color="grey-lighten-1" class="mb-2" />
        <div class="text-caption text-medium-emphasis">No request history available.</div>
      </div>

      <RequestHistoryDialog v-model="selected" :request="selectedReq" @close="selected = false" />
    </v-card-text>
  </v-card>
</template>

<style scoped>
.history-item {
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.history-item:hover {
  background-color: rgba(var(--v-theme-primary), 0.05);
}
</style>