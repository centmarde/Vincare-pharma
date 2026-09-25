<script setup lang="ts">
import { useTransactionsData } from '@/composables/useTransactionsData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import type { PR } from '@/stores/purchaseRequisitionData'
import { computed } from 'vue'

const props = defineProps<{
  items: PR[]
  loading: boolean
  page: number
  totalItems: number
  itemsPerPage: number
}>()

const searchInput = defineModel<string>('searchInput', { required: true })
const filterStatus = defineModel<string | null>('filterStatus', { required: true })

const emit = defineEmits<{
  'commit-search': []
  'clear-search': []
  refresh: []
  'new-pr': []
  'view-detail': [item: PR]
  'issue-po': [item: PR]
  'change-page': [newPage: number]
}>()

const { totalQty, totalCost, itemSummary, statusConfig, statusOptions } = useTransactionsData()

const totalPages = computed(() => Math.max(1, Math.ceil(props.totalItems / props.itemsPerPage)))

function goToPage(newPage: number) {
  if (newPage < 1 || newPage > totalPages.value || newPage === props.page) return
  emit('change-page', newPage)
}

function clearFilters() {
  filterStatus.value = null
  emit('clear-search')
}
</script>

<template>
  <div class="w-100 mt-2">
    <div class="d-flex align-center justify-space-between mb-4">
      <div>
        <div class="text-subtitle-1 font-weight-medium">Purchase Requisition</div>
        <div class="text-caption text-medium-emphasis">
          {{ totalItems.toLocaleString() }} total
        </div>
      </div>
      <div class="d-flex align-center ga-2">
        <v-btn
          icon="mdi-refresh"
          variant="text"
          aria-label="Refresh"
          :disabled="loading"
          :loading="loading"
          @click="emit('refresh')"
        />
        <v-btn
          color="primary"
          variant="flat"
          rounded="lg"
          class="text-none"
          prepend-icon="mdi-plus"
          @click="emit('new-pr')"
        >
          New
        </v-btn>
      </div>
    </div>

    <v-text-field
      v-model="searchInput"
      placeholder="Search requisitions"
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      density="comfortable"
      rounded="lg"
      enterkeyhint="search"
      hide-details
      clearable
      class="mb-2"
      @keyup.enter="emit('commit-search')"
      @click:clear="emit('clear-search')"
    />

    <div class="filter-row d-flex ga-2 mb-4">
      <v-chip
        v-for="opt in statusOptions"
        :key="String(opt.value)"
        :color="filterStatus === opt.value ? 'primary' : undefined"
        :variant="filterStatus === opt.value ? 'tonal' : 'outlined'"
        class="flex-shrink-0"
        @click="filterStatus = opt.value"
      >
        {{ opt.title }}
      </v-chip>
    </div>

    <div v-if="loading" class="d-flex flex-column ga-2">
      <v-skeleton-loader
        v-for="n in 3"
        :key="n"
        type="list-item-three-line"
        class="rounded-lg border"
      />
    </div>

    <v-empty-state
      v-else-if="items.length === 0"
      icon="mdi-clipboard-text-search-outline"
      title="No purchase requisitions found"
      text="Try a different search or status filter."
      action-text="Clear filters"
      @click:action="clearFilters"
    />

    <div v-else class="d-flex flex-column ga-2">
      <v-card
        v-for="item in items"
        :key="item.requisition_no"
        variant="outlined"
        rounded="lg"
        class="pa-4"
        @click="emit('view-detail', item)"
      >
        <div class="d-flex align-center justify-space-between ga-2 mb-2">
          <span class="text-subtitle-2 font-weight-bold">{{ item.requisition_no }}</span>
          <v-chip :color="statusConfig(item.status).color" size="small" variant="tonal">
            <v-icon icon="mdi-circle" size="8" start />
            {{ statusConfig(item.status).label }}
          </v-chip>
        </div>

        <div class="text-body-2 text-truncate">{{ itemSummary(item.items) }}</div>
        <div class="text-caption text-medium-emphasis mb-2">
          {{ item.items.length }} {{ item.items.length === 1 ? 'item' : 'items' }} &middot; Qty
          {{ totalQty(item.items).toLocaleString() }}
        </div>

        <div class="d-flex align-center ga-1 text-caption text-medium-emphasis">
          <v-icon icon="mdi-account-outline" size="14" />
          <span class="text-truncate">{{ item.requester_name }}</span>
          <span>&middot;</span>
          <span class="text-no-wrap">{{ formatDatePR_ISO(item.created_at) }}</span>
        </div>
        <div
          v-if="item.reviewer_name"
          class="d-flex align-center ga-1 text-caption text-medium-emphasis"
        >
          <v-icon icon="mdi-account-check-outline" size="14" />
          <span class="text-truncate">Reviewed by {{ item.reviewer_name }}</span>
        </div>

        <v-divider class="my-2" />

        <div class="d-flex align-center justify-space-between ga-2">
          <span class="text-subtitle-1 font-weight-bold">
            {{ formatCurrency(totalCost(item.items)) }}
          </span>
          <div class="d-flex align-center ga-2">
            <v-btn
              v-if="item.status === 'approved'"
              color="primary"
              variant="tonal"
              size="small"
              rounded="lg"
              class="text-none"
              prepend-icon="mdi-printer-outline"
              @click.stop="emit('issue-po', item)"
            >
              Issue PO
            </v-btn>
            <v-icon icon="mdi-chevron-right" class="text-medium-emphasis" />
          </div>
        </div>
      </v-card>
    </div>

    <div v-if="totalPages > 1" class="d-flex align-center justify-center ga-2 mt-4">
      <v-btn
        icon="mdi-chevron-left"
        variant="text"
        aria-label="Previous page"
        :disabled="page <= 1 || loading"
        @click="goToPage(page - 1)"
      />
      <span class="text-body-2 text-medium-emphasis">Page {{ page }} of {{ totalPages }}</span>
      <v-btn
        icon="mdi-chevron-right"
        variant="text"
        aria-label="Next page"
        :disabled="page >= totalPages || loading"
        @click="goToPage(page + 1)"
      />
    </div>
  </div>
</template>

<style scoped>
.filter-row {
  overflow-x: auto;
  scrollbar-width: none;
}
.filter-row::-webkit-scrollbar {
  display: none;
}
</style>
