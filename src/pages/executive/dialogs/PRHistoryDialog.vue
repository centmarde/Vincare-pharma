<!-- src/pages/executive/dialogs/PRHistoryDialog.vue -->
<script setup lang="ts">
import { usePRHistory, historyHeaders } from '../composables/usePRHistory'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import { watch } from 'vue'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()

const model = defineModel<boolean>()

const {
  loading, searchInput, commitSearch, clearSearch,
  serverItems, loadItems,
} = usePRHistory()

// Fetch only when the dialog opens — not on dashboard mount.
watch(model, (open) => {
  if (open) loadItems()
})
</script>

<template>
  <v-dialog v-model="model" :max-width="mobile ? '95%' : '1200'" scrollable>
    <v-card rounded="lg">
      <v-card-title
        :class="mobile ? 'pa-3 d-flex flex-column ga-2' : 'd-flex justify-space-between align-center pa-4'"
      >
        <div class="d-flex align-center" style="min-width: 0">
          <v-icon icon="mdi-package-variant-closed" size="28" class="mr-2 text-primary" />
          <span class="text-h6 font-weight-bold text-truncate">Product Purchase History</span>
        </div>
        <v-text-field
          v-model="searchInput"
          placeholder="Search product, PR #, or supplier... (press Enter)"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          :style="mobile ? 'width: 100%' : 'max-width: 320px'"
          @keyup.enter="commitSearch"
          @click:clear="clearSearch"
        />
      </v-card-title>

      <v-divider />

      <!-- ── Desktop: Table ─────────────────────────────────────── -->
      <v-data-table
        v-if="!mobile"
        :headers="historyHeaders"
        :items="serverItems"
        :loading="loading"
        :items-per-page-options="[10, 25, 50, 100]"
        hover
        loading-text="Loading product purchase history..."
        no-data-text="No product purchase history found."
      >
        <template #item.product_name="{ item }">
          <span class="text-body-2 font-weight-bold">{{ item.product_name }}</span>
        </template>

        <template #item.requisition_no="{ item }">
          <span class="text-body-2">{{ item.requisition_no }}</span>
        </template>

        <template #item.qty="{ item }">
          {{ item.qty.toLocaleString() }}
        </template>

        <template #item.cost_per_unit="{ item }">
          {{ formatCurrency(item.cost_per_unit) }}
        </template>

        <template #item.offer_per_unit="{ item }">
          {{ formatCurrency(item.offer_per_unit) }}
        </template>

        <template #item.total_cost="{ item }">
          <span class="font-weight-bold">{{ formatCurrency(item.total_cost) }}</span>
        </template>

        <template #item.created_at="{ item }">
          {{ formatDatePR_ISO(item.created_at) }}
        </template>
      </v-data-table>

      <!-- ── Mobile: Cards ──────────────────────────────────────── -->
      <div v-else class="pa-3">
        <div v-if="loading" class="pa-6 text-center">
          <v-progress-circular indeterminate size="24" width="2" class="mb-2" />
          <div class="text-caption text-medium-emphasis">Loading product purchase history...</div>
        </div>

        <div v-else-if="!serverItems.length" class="pa-6 text-center">
          <v-icon icon="mdi-package-variant-closed" size="32" color="grey-lighten-1" class="mb-2" />
          <div class="text-caption text-medium-emphasis">No product purchase history found.</div>
        </div>

        <v-card
          v-for="item in serverItems"
          :key="`${item.requisition_no}-${item.product_id}-${item.created_at}`"
          class="mb-2"
          variant="outlined"
          rounded="lg"
        >
          <v-card-text class="pa-3">
            <div class="d-flex justify-space-between align-start mb-1">
              <div class="d-flex ga-2 align-center" style="min-width: 0">
                <span class="text-caption font-weight-bold text-primary text-truncate">
                  {{ item.product_name }}
                </span>
              </div>
              <v-chip size="x-small" color="primary" variant="tonal" label class="flex-shrink-0">
                {{ item.requisition_no }}
              </v-chip>
            </div>

            <v-divider class="my-1" />

            <div class="d-flex flex-wrap ga-3 text-caption">
              <div>
                <span class="text-medium-emphasis">Qty: </span>{{ item.qty.toLocaleString() }}
                <span class="text-medium-emphasis"> {{ item.unit }}</span>
              </div>
              <div>
                <span class="text-medium-emphasis">Cost/Unit: </span
                >{{ formatCurrency(item.cost_per_unit) }}
              </div>
              <div>
                <span class="text-medium-emphasis">Offer/Unit: </span
                >{{ formatCurrency(item.offer_per_unit) }}
              </div>
              <div>
                <span class="text-medium-emphasis">Total: </span
                ><span class="font-weight-bold">{{ formatCurrency(item.total_cost) }}</span>
              </div>
              <div>
                <span class="text-medium-emphasis">Supplier: </span>{{ item.supplier_name }}
              </div>
              <div>
                <span class="text-medium-emphasis">Date: </span
                >{{ formatDatePR_ISO(item.created_at) }}
              </div>
            </div>
          </v-card-text>
        </v-card>
      </div>

      <v-card-actions class="pa-4 justify-end">
        <v-btn variant="outlined" class="text-none" @click="model = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>