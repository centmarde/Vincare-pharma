<script setup lang="ts">
import { headers } from '../composables/usePurchaseRequisitionList'
import { useTransactionsData } from '@/composables/useTransactionsData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import type { PR } from '@/stores/purchaseRequisitionData'

interface TableOptions {
  page: number
  itemsPerPage: number
  sortBy: { key: string; order: 'asc' | 'desc' }[]
}

defineProps<{
  items: PR[]
  loading: boolean
  totalItems: number
}>()

const searchInput = defineModel<string>('searchInput', { required: true })
const filterStatus = defineModel<string | null>('filterStatus', { required: true })
const itemsPerPage = defineModel<number>('itemsPerPage', { required: true })

const emit = defineEmits<{
  'new-pr': []
  'commit-search': []
  'clear-search': []
  refresh: []
  'load-items': [options: TableOptions]
  'view-detail': [item: PR]
  'issue-po': [item: PR]
}>()

const { totalQty, totalCost, itemSummary, itemNames, statusConfig, statusOptions } =
  useTransactionsData()
</script>

<template>
  <v-card class="mx-auto w-100" rounded="lg" elevation="1">
    <v-card-title class="pa-4 pa-sm-5">
      <div class="d-flex justify-space-between align-center">
        <div class="d-flex align-center">
          <v-icon icon="mdi-clipboard-list-outline" size="36" class="mr-1 text-primary" />
          <span class="text-h6 font-weight-bold">Purchase Requisition</span>
        </div>

        <div class="d-flex align-center" style="gap: 12px">
          <v-btn
            color="primary"
            class="text-none font-weight-bold"
            prepend-icon="mdi-plus"
            elevation="0"
            @click="emit('new-pr')"
          >
            New Requisition
          </v-btn>
          <v-text-field
            v-model="searchInput"
            placeholder="Search... (press Enter)"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            style="min-width: 240px"
            @keyup.enter="emit('commit-search')"
            @click:clear="emit('clear-search')"
          />
          <v-menu>
            <template #activator="{ props: menuProps }">
              <v-btn
                v-bind="menuProps"
                variant="text"
                class="text-none font-weight-bold"
                color="primary"
                append-icon="mdi-chevron-down"
                >Filter</v-btn
              >
            </template>
            <v-list density="compact" min-width="180">
              <v-list-item
                v-for="opt in statusOptions"
                :key="String(opt.value)"
                :title="opt.title"
                :active="filterStatus === opt.value"
                active-color="primary"
                @click="filterStatus = opt.value"
              />
            </v-list>
          </v-menu>
          <v-btn
            icon="mdi-refresh"
            variant="text"
            class="text-none"
            color="primary"
            :disabled="loading"
            :loading="loading"
            @click="emit('refresh')"
          />
        </div>
      </div>
    </v-card-title>

    <v-divider />

    <v-data-table-server
      v-model:items-per-page="itemsPerPage"
      :headers="headers"
      :items="items"
      :items-length="totalItems"
      :loading="loading"
      :items-per-page-options="[5, 10, 15, 20, 25, 50, 100]"
      hover
      loading-text="Loading purchase orders..."
      no-data-text="No purchase orders found."
      @update:options="(options) => emit('load-items', options)"
    >
      <template #item.requisition_no="{ item }">
        <span class="text-body-2 font-weight-bold" style="white-space: nowrap">
          {{ item.requisition_no }}
        </span>
      </template>

      <template #item.items="{ item }">
        <div>
          <span class="text-body-2">
            {{ itemSummary(item.items) }}
          </span>

          <v-tooltip v-if="item.items.length > 1" location="top">
            <template #activator="{ props: tooltipProps }">
              <v-icon v-bind="tooltipProps" size="14" class="ml-1 text-medium-emphasis">
                mdi-information-outline
              </v-icon>
            </template>

            <div v-for="name in itemNames(item.items)" :key="name">
              {{ name }}
            </div>
          </v-tooltip>
        </div>
      </template>

      <template #item.total_qty="{ item }">
        <span class="text-body-2">{{ totalQty(item.items).toLocaleString() }}</span>
      </template>

      <template #item.total_amount="{ item }">
        <span class="text-body-2">{{ formatCurrency(totalCost(item.items)) }}</span>
      </template>

      <template #item.requester_name="{ item }">
        <span class="text-body-2">{{ item.requester_name }}</span>
      </template>

      <template #item.created_at="{ item }">
        <span class="text-body-2" style="white-space: nowrap">
          {{ formatDatePR_ISO(item.created_at) }}
        </span>
      </template>

      <template #item.status="{ item }">
        <span
          class="status-chip text-caption font-weight-bold"
          :class="`status-chip--${item.status}`"
        >
          <span class="status-dot" />
          {{ statusConfig(item.status).label }}
        </span>
      </template>

      <template #item.reviewer_name="{ item }">
        <span class="text-body-2">{{ item.reviewer_name }}</span>
      </template>

      <template #item.actions="{ item }">
        <div class="d-flex actions-gap" style="white-space: nowrap">
          <v-btn variant="outlined" size="small" class="text-none" @click="emit('view-detail', item)">
            <v-icon color="primary" start>mdi-eye</v-icon>
            View
          </v-btn>
          <template v-if="item.status === 'approved'">
            <v-btn
              variant="outlined"
              size="small"
              class="text-none"
              prepend-icon="mdi-printer-outline"
              @click="emit('issue-po', item)"
            >
              Issue PO
            </v-btn>
          </template>
        </div>
      </template>
    </v-data-table-server>
  </v-card>
</template>

<style scoped>
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  white-space: nowrap;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: currentColor;
}

.status-chip--pending_approval {
  color: #C2922E;
  background: rgba(183, 121, 31, 0.12);
}
.status-chip--approved {
  color: #2563EB;
  background: rgba(51, 102, 204, 0.12);
}
.status-chip--rejected {
  color: #DC2626;
  background: rgba(197, 48, 48, 0.12);
}
.status-chip--ordered {
  color: #7C3AED;
  background: rgba(79, 70, 229, 0.12);
}
.status-chip--complete {
  color: #15803D;
  background: rgba(47, 133, 90, 0.12);
}
.status-chip--change_request {
  color: #fb8c00;
  background: rgba(255, 152, 0, 0.12);
}

.actions-gap {
  gap: 6px;
}

:deep(.v-table thead tr th) {
  background: rgba(0, 0, 0, 0.03) !important;
  padding: 12px 16px !important;
  letter-spacing: 0.04em;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
}
:deep(.v-table tbody tr td) {
  padding: 10px 7px !important;
  vertical-align: middle;
}
:deep(.v-table tbody tr:not(:last-child) td) {
  border-bottom: 1px solid rgba(0, 0, 0, 0.05) !important;
}
</style>
