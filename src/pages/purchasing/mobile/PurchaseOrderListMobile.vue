<script setup lang="ts">
import { useTransactionsData } from '@/composables/useTransactionsData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import type { PurchaseOrder } from '../composables/usePODetailModal'
import type { SupplierSummary } from '../composables/usePurchaseOrderList'
import { computed } from 'vue'

const props = defineProps<{
  items: PurchaseOrder[]
  loading: boolean
  page: number
  totalItems: number
  itemsPerPage: number
  statusLabel: (status: string) => string
  getSupplierSummary: (poId: number) => SupplierSummary
}>()

const searchInput = defineModel<string>('searchInput', { required: true })
const filterStatus = defineModel<string | string[] | null>('filterStatus', { required: true })

const emit = defineEmits<{
  'commit-search': []
  'clear-search': []
  refresh: []
  'view-detail': [item: PurchaseOrder]
  'change-page': [newPage: number]
}>()

const { poStatusOptions, statusConfig } = useTransactionsData()

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
        <div class="text-subtitle-1 font-weight-medium">Purchase Order</div>
        <div class="text-caption text-medium-emphasis">
          {{ totalItems.toLocaleString() }} total
        </div>
      </div>
      <v-btn
        icon="mdi-refresh"
        variant="text"
        aria-label="Refresh"
        :disabled="loading"
        :loading="loading"
        @click="emit('refresh')"
      />
    </div>

    <v-text-field
      v-model="searchInput"
      placeholder="Search purchase orders"
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
        v-for="opt in poStatusOptions"
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
      icon="mdi-package-variant-closed-remove"
      title="No purchase orders found"
      text="Try a different search or status filter."
      action-text="Clear filters"
      @click:action="clearFilters"
    />

    <div v-else class="d-flex flex-column ga-2">
      <v-card
        v-for="item in items"
        :key="item.po_no"
        variant="outlined"
        rounded="lg"
        class="pa-4"
        @click="emit('view-detail', item)"
      >
        <div class="d-flex align-center justify-space-between ga-2 mb-2">
          <span class="text-subtitle-2 font-weight-bold">{{ item.po_no }}</span>
          <v-chip :color="statusConfig(item.status).color" size="small" variant="tonal">
            <v-icon icon="mdi-circle" size="8" start />
            {{ statusLabel(item.status) }}
          </v-chip>
        </div>

        <div class="d-flex align-center ga-1 text-body-2">
          <v-icon icon="mdi-domain" size="16" class="text-medium-emphasis" />
          <span class="text-truncate">{{ getSupplierSummary(item.id).display }}</span>
        </div>
        <div
          v-if="getSupplierSummary(item.id).isMultiple"
          class="text-caption text-medium-emphasis"
        >
          {{ getSupplierSummary(item.id).names.join(', ') }}
        </div>

        <div
          v-if="item.ship_via || item.ship_method"
          class="d-flex align-center ga-1 text-caption text-medium-emphasis mt-1"
        >
          <v-icon icon="mdi-truck-outline" size="14" />
          <span>{{ [item.ship_via, item.ship_method].filter(Boolean).join(' · ') }}</span>
        </div>

        <div class="d-flex align-center ga-2 text-caption text-medium-emphasis mt-1">
          <div class="d-flex align-center ga-1">
            <v-icon icon="mdi-calendar-outline" size="14" />
            <span>{{ item.created_at ? formatDatePR_ISO(item.created_at) : '—' }}</span>
          </div>
          <v-chip
            v-if="item.status === 'complete'"
            color="success"
            size="x-small"
            variant="tonal"
            label
          >
            <v-icon start size="12">mdi-check-circle</v-icon>
            Delivered
          </v-chip>
        </div>

        <v-divider class="my-2" />

        <div class="d-flex align-center justify-space-between ga-2">
          <span class="text-subtitle-1 font-weight-bold">
            {{ formatCurrency(item.total_amount) }}
          </span>
          <v-icon icon="mdi-chevron-right" class="text-medium-emphasis" />
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
