<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatDatePR_ISO } from '@/utils/helpers'
import { useRequestHistory } from '../composables/useRequestHistory'
import type { RequestHistoryItem } from '../composables/useRequestHistory'
import RequestHistoryDetailedDialog from './RequestHistoryDetailedDialog.vue'
import {
  getStatusColor,
  getStatusIcon,
  getStatusLabel,
  getRequestTypeLabel,
  getRequisitionRef,
} from '../helpers/requestHistoryHelpers'

const dialog = defineModel<boolean>('modelValue', { default: false })

const {
  loading,
  paginatedRequests,
  requests,
  page,
  totalPages,
  totalItems,
  fetchHistory,
} = useRequestHistory()

const selectedReq = ref<RequestHistoryItem | null>(null)
const detailDialog = ref(false)
const searchQuery = ref('')
const statusFilter = ref<'all' | 'approved' | 'rejected'>('all')
const perPage = 5

const filteredRequests = computed(() => {
  const base = requests.value || []
  const q = searchQuery.value.trim().toLowerCase()

  return base.filter((req) => {
    const matchesStatus =
      statusFilter.value === 'all' ? true : req.status === statusFilter.value

    if (!q) return matchesStatus

    const ref = getRequisitionRef(req)
    const summary = req.summary ?? ''
    const type = req.request_type ?? ''
    const matchesSearch =
      String(ref).toLowerCase().includes(q) ||
      String(summary).toLowerCase().includes(q) ||
      String(type).toLowerCase().includes(q)

    return matchesStatus && matchesSearch
  })
})

const filteredTotalPages = computed(() =>
  Math.max(1, Math.ceil(filteredRequests.value.length / perPage)),
)

const paginatedFilteredRequests = computed(() => {
  const start = (page.value - 1) * perPage
  return filteredRequests.value.slice(start, start + perPage)
})

watch(
  () => dialog.value,
  (val) => {
    if (val) {
      fetchHistory()
      page.value = 1
    }
  },
)

function openRequest(req: RequestHistoryItem) {
  selectedReq.value = req
  detailDialog.value = true
}

const handleClose = () => {
  dialog.value = false
}

watch(
  [searchQuery, statusFilter],
  () => {
    page.value = 1
  },
)
</script>

<template>
  <v-dialog
    v-model="dialog"
    max-width="900"
    scrollable
    @click:outside="handleClose"
    @keydown.esc="handleClose"
  >
    <v-card rounded="lg" class="position-relative">
      <v-btn
        icon
        size="small"
        variant="text"
        @click="handleClose"
        class="position-absolute"
        style="top: 12px; right: 12px; z-index: 1;"
      >
        <v-icon icon="mdi-close" />
      </v-btn>
      <v-card-title class="pa-4">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-history" color="primary" size="24" class="flex-shrink-0" />
          <span class="text-h6 font-weight-bold flex-shrink-0">Request History</span>
          <v-chip v-if="totalItems" size="small" color="primary" variant="flat" class="flex-shrink-0">
            {{ totalItems }}
          </v-chip>
          <v-select
            v-model="statusFilter"
            :items="[
              { title: 'All', value: 'all' },
              { title: 'Approved', value: 'approved' },
              { title: 'Rejected', value: 'rejected' },
            ]"
            item-title="title"
            item-value="value"
            hide-details
            density="compact"
            variant="outlined"
            class="text-none flex-shrink-0"
            style="min-width: 140px; max-width: 180px;"
          ></v-select>
          <v-text-field
            v-model="searchQuery"
            placeholder="Search history..."
            prepend-inner-icon="mdi-magnify"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            class="ml-2"
            style="max-width: 260px; flex-shrink: 0;"
          ></v-text-field>
        </div>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-0">
        <div v-if="loading" class="pa-8 text-center">
          <v-progress-circular indeterminate size="32" width="3" class="mb-3" />
          <div class="text-body-2 text-medium-emphasis">Loading request history…</div>
        </div>

        <v-list v-else-if="filteredRequests.length" class="pa-4" lines="two">
          <template v-for="(req, i) in paginatedFilteredRequests" :key="`${req.source}-${req.id}`">
            <v-list-item class="px-3 py-3 rounded-lg history-item mb-2" @click="openRequest(req)">
              <template #prepend>
                <v-avatar
                  size="40"
                  rounded="lg"
                  :color="getStatusColor(req.status)"
                  variant="tonal"
                >
                  <v-icon
                    :color="getStatusColor(req.status)"
                    :icon="getStatusIcon(req.status)"
                    size="22"
                  />
                </v-avatar>
              </template>

              <v-list-item-title class="d-flex align-center ga-2 mb-1">
                <v-chip
                  size="x-small"
                  :color="getStatusColor(req.status)"
                  variant="tonal"
                  label
                  class="font-weight-bold"
                >
                  {{ getStatusLabel(req.status) }}
                </v-chip>
                <v-chip size="x-small" color="purple" variant="outlined">
                  {{ getRequestTypeLabel(req.request_type) }}
                </v-chip>
                <span class="text-body-2 font-weight-medium">
                  {{ getRequisitionRef(req) }}
                </span>
                <v-spacer />
                <span class="text-caption text-medium-emphasis flex-shrink-0">
                  {{ formatDatePR_ISO(req.resolved_at ?? req.created_at) }}
                </span>
              </v-list-item-title>

              <v-list-item-subtitle
                v-if="req.summary"
                class="text-caption text-medium-emphasis"
                style="white-space: normal; line-height: 1.4"
              >
                <v-icon
                  icon="mdi-comment-text-outline"
                  size="12"
                  class="mr-1"
                  style="opacity: 0.7"
                />
                {{ req.summary }}
              </v-list-item-subtitle>

              <template #append>
                <v-icon icon="mdi-chevron-right" size="20" color="medium-emphasis" />
              </template>
            </v-list-item>

            <v-divider v-if="i < paginatedFilteredRequests.length - 1" class="my-1" />
          </template>

          <div v-if="filteredTotalPages > 1" class="d-flex justify-center pa-4">
            <v-pagination
              v-model="page"
              :length="filteredTotalPages"
              density="comfortable"
              :total-visible="7"
            />
          </div>
        </v-list>

        <div v-else class="pa-8 text-center">
          <v-icon icon="mdi-history" size="48" color="grey-lighten-1" class="mb-3" />
          <div class="text-body-2 text-medium-emphasis">
            {{ searchQuery ? 'No results match your search.' : 'No request history available.' }}
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4 d-flex justify-end">
        <v-btn variant="outlined" class="text-none" @click="handleClose"> Close </v-btn>
      </v-card-actions>
    </v-card>

    <RequestHistoryDetailedDialog v-model="detailDialog" :request="selectedReq" />
  </v-dialog>
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
