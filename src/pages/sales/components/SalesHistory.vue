<script setup lang="ts">
import { onMounted } from 'vue'
import { useSalesHistory, headers } from '../composables/useSalesHistory'
import PosReceiptDialog from '../dialogs/PosReceiptDialog.vue'
import ChangeRequestDialog from '@/components/changeRequests/ChangeRequestDialog.vue'
import { useChangeRequestFiling } from '@/composables/useChangeRequestFiling'
import type { SaleType } from '@/stores/salesData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const {
  loading, search, filterStatus, filterOutletId, outletOptions, dateFrom, dateTo, statusOptions,
  filteredSales, cashierName, canVoid,
  showReceipt, receipt,
  load, openReceipt,
} = useSalesHistory()

// Voiding a completed sale now needs executive approval. A sale isn't edited —
// void + re-ring — so the request is void-only.
const { showDialog, config, isPending, loadPending, open, submit, submitting } =
  useChangeRequestFiling('sales', 'sale')

function openChange(s: SaleType) {
  open({
    id: s.id,
    ref: s.sale_no,
    fields: [],
    voidSummary: `Void ${s.sale_no ?? `sale #${s.id}`} — reverses the sale in the ledger (posts a sales return), returns the sold items to branch stock, and marks the sale voided.`,
    allowEdit: false,
    allowVoid: true,
  })
}

onMounted(loadPending)
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">

      <v-card-title class="d-flex justify-space-between align-center pa-5 flex-wrap ga-3">
        <span class="text-h6 font-weight-bold">Sales History</span>
        <div class="d-flex align-center flex-wrap ga-3">
          <v-select
            v-model="filterOutletId"
            :items="outletOptions"
            item-title="title"
            item-value="value"
            label="Branch"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 170px"
            @update:model-value="load"
          />
          <v-text-field
            v-model="dateFrom"
            type="date"
            label="From"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 150px"
            @update:model-value="load"
          />
          <v-text-field
            v-model="dateTo"
            type="date"
            label="To"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 150px"
            @update:model-value="load"
          />
          <v-text-field
            v-model="search"
            placeholder="Search sale # or customer..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 220px"
          />
          <v-select
            v-model="filterStatus"
            :items="statusOptions"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 150px"
          />
        </div>
      </v-card-title>

      <v-divider />

      <v-data-table
        :headers="headers"
        :items="filteredSales"
        :loading="loading"
        loading-text="Loading sales..."
        no-data-text="No sales found."
        hover
      >
        <template #item.sale_no="{ item }">
          <span class="font-weight-medium">{{ item.sale_no }}</span>
        </template>

        <template #item.outlet="{ item }">
          {{ item.outlet?.name ?? '—' }}
        </template>

        <template #item.created_at="{ item }">
          <span class="text-body-2 text-medium-emphasis">{{ formatDatePR_ISO(item.created_at) }}</span>
        </template>

        <template #item.customer="{ item }">
          {{ item.customer?.name || '—' }}
        </template>

        <template #item.cashier="{ item }">
          {{ cashierName(item.cashier_id) }}
        </template>

        <template #item.items="{ item }">
          {{ item.sale_items?.length ?? 0 }}
        </template>

        <template #item.total_amount="{ item }">
          {{ formatCurrency(item.total_amount ?? 0) }}
        </template>

        <template #item.status="{ item }">
          <v-chip :color="item.status === 'voided' ? 'error' : 'success'" size="small" variant="tonal" class="font-weight-bold">
            {{ item.status === 'voided' ? 'Voided' : 'Completed' }}
          </v-chip>
        </template>

        <template #item.actions="{ item }">
          <v-btn variant="text" size="small" color="primary" class="text-none" @click="openReceipt(item)">
            Reprint
          </v-btn>
          <v-chip v-if="isPending(item.id)" size="x-small" color="warning" variant="tonal" label class="ml-1">Void pending</v-chip>
          <v-btn
            v-else-if="canVoid(item)"
            variant="text"
            size="small"
            color="error"
            class="text-none"
            @click="openChange(item)"
          >
            Request Void
          </v-btn>
        </template>
      </v-data-table>

    </v-card>

    <PosReceiptDialog v-model="showReceipt" :receipt="receipt" />

    <ChangeRequestDialog
      v-if="config"
      v-model="showDialog"
      :target-ref="config.ref"
      :fields="config.fields"
      :allow-edit="config.allowEdit"
      :allow-void="config.allowVoid"
      :void-summary="config.voidSummary"
      :loading="submitting"
      @submit="submit"
    />

  </v-container>
</template>

<style scoped>
:deep(.v-data-table thead th) {
  background: #f5f5f5 !important;
  font-weight: 700 !important;
  font-size: 0.75rem !important;
  letter-spacing: 0.04em;
  color: #616161 !important;
}
</style>
