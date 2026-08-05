<!-- src/pages/executive/dialogs/PRHistoryDialog.vue -->
<script setup lang="ts">
import { usePRHistory, historyHeaders } from '../composables/usePRHistory'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import PRDetailModal from '@/pages/purchasing/components/dialogs/PRDetailModal.vue'
import { watch } from 'vue'

const model = defineModel<boolean>()

const {
  loading, searchInput, commitSearch, clearSearch,
  page, itemsPerPage, serverItems, totalItems,
  selectedPR, showModal, openDetail,
  totalQty, totalCost, itemSummary, itemNames,
  loadItems,
} = usePRHistory()

// Fetch only when the dialog opens — not on dashboard mount.
watch(model, (open) => {
  if (open) loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
})
</script>

<template>
  <v-dialog v-model="model" max-width="1100" scrollable>
    <v-card rounded="lg">
      <v-card-title class="d-flex justify-space-between align-center pa-4">
        <div class="d-flex align-center">
          <v-icon icon="mdi-history" size="28" class="mr-2 text-primary" />
          <span class="text-h6 font-weight-bold">Purchase Requisition History</span>
        </div>
        <v-text-field
          v-model="searchInput"
          placeholder="Search... (press Enter)"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="max-width: 260px"
          @keyup.enter="commitSearch"
          @click:clear="clearSearch"
        />
      </v-card-title>

      <v-divider />

      <v-data-table-server
        v-model:items-per-page="itemsPerPage"
        :headers="historyHeaders"
        :items="serverItems"
        :items-length="totalItems"
        :loading="loading"
        :items-per-page-options="[5, 10, 15, 20, 25, 50]"
        hover
        loading-text="Loading completed purchase requisitions..."
        no-data-text="No completed purchase requisitions found."
        @update:options="loadItems"
      >
        <template #item.requisition_no="{ item }">
          <span class="text-body-2 font-weight-bold">{{ item.requisition_no }}</span>
        </template>

        <template #item.items="{ item }">
          <span class="text-body-2">{{ itemSummary(item.items) }}</span>
          <v-tooltip v-if="item.items.length > 1" location="top">
            <template #activator="{ props }">
              <v-icon v-bind="props" size="14" class="ml-1 text-medium-emphasis">
                mdi-information-outline
              </v-icon>
            </template>
            <div v-for="name in itemNames(item.items)" :key="name">{{ name }}</div>
          </v-tooltip>
        </template>

        <template #item.total_qty="{ item }">
          {{ totalQty(item.items).toLocaleString() }}
        </template>

        <template #item.total_amount="{ item }">
          {{ formatCurrency(totalCost(item.items)) }}
        </template>

        <template #item.created_at="{ item }">
          {{ formatDatePR_ISO(item.created_at) }}
        </template>

        <template #item.actions="{ item }">
          <v-btn variant="outlined" size="small" class="text-none" @click="openDetail(item)">
            <v-icon color="primary" start>mdi-eye</v-icon>
            View
          </v-btn>
        </template>
      </v-data-table-server>

      <v-card-actions class="pa-4 justify-end">
        <v-btn variant="outlined" class="text-none" @click="model = false">Close</v-btn>
      </v-card-actions>
    </v-card>

    <!-- Reuses the existing PRDetailModal as-is — it already renders
         read-only (no approve/reject/edit) for status === 'complete'. -->
    <PRDetailModal v-if="selectedPR" v-model="showModal" :pr="selectedPR" />
  </v-dialog>
</template>