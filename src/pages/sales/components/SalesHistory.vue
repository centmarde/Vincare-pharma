<script setup lang="ts">
import { onMounted } from 'vue'
import ChangeRequestDialog from '@/components/changeRequests/ChangeRequestDialog.vue'
import { useChangeRequestFiling } from '@/composables/useChangeRequestFiling'
import { useSalesHistory, headers } from '../composables/useSalesHistory'
import { useSalesChangeRequestStore } from '../stores/salesChangeRequest'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import PosReceiptDialog from '../dialogs/PosReceiptDialog.vue'
import type { SaleType } from '@/stores/salesData'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const {
  loading, search, filterStatus, filterOutletId, outletOptions, dateFrom, dateTo, statusOptions,
  filteredSales, cashierName, canVoid,
  showReceipt, receipt,
  load, openReceipt,
} = useSalesHistory()

// Voiding a completed sale now needs executive approval. A sale isn't edited —
// void + re-ring — so the request is void-only.
const { showDialog, config, isPending, loadPending, open, submit, submitting } =
  useChangeRequestFiling(useSalesChangeRequestStore())

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
        <div class="d-flex align-center flex-wrap ga-3" :class="mobile ? 'w-100' : ''">
          <v-select
            v-model="filterOutletId"
            :items="outletOptions"
            item-title="title"
            item-value="value"
            label="Branch"
            variant="outlined"
            density="compact"
            hide-details
            :style="mobile ? 'width: 100%' : 'min-width: 170px'"
            @update:model-value="load"
          />
          <v-text-field
            v-model="dateFrom"
            type="date"
            label="From"
            variant="outlined"
            density="compact"
            hide-details
            :style="mobile ? 'width: 100%' : 'min-width: 150px'"
            @update:model-value="load"
          />
          <v-text-field
            v-model="dateTo"
            type="date"
            label="To"
            variant="outlined"
            density="compact"
            hide-details
            :style="mobile ? 'width: 100%' : 'min-width: 150px'"
            @update:model-value="load"
          />
          <v-text-field
            v-model="search"
            placeholder="Search sale # or customer..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            :style="mobile ? 'width: 100%' : 'min-width: 220px'"
          />
          <v-select
            v-model="filterStatus"
            :items="statusOptions"
            variant="outlined"
            density="compact"
            hide-details
            :style="mobile ? 'width: 100%' : 'min-width: 150px'"
          />
        </div>
      </v-card-title>

      <v-divider />

      <!-- Mobile: card list -->
      <v-list v-if="mobile" lines="two" :loading="loading">
        <v-list-item v-for="s in filteredSales" :key="s.id">
          <template #prepend>
            <v-avatar color="primary" variant="tonal" size="40" class="text-caption font-weight-bold">
              {{ s.sale_no?.slice(-4) }}
            </v-avatar>
          </template>
          <template #title>
            <div class="text-body-2 font-weight-medium">{{ s.sale_no }}</div>
          </template>
          <template #subtitle>
            <div class="text-caption">{{ formatDatePR_ISO(s.created_at) }}</div>
          </template>
          <template #append>
            <div class="text-right">
              <div class="font-weight-bold text-body-2">{{ formatCurrency(s.total_amount ?? 0) }}</div>
              <v-chip :color="s.status === 'voided' ? 'error' : 'success'" size="x-small" variant="tonal">
                {{ s.status === 'voided' ? 'Voided' : 'Completed' }}
              </v-chip>
            </div>
          </template>
          <template #default>
            <div class="text-caption text-medium-emphasis mt-1">
              <div>{{ s.warehouse?.name ?? '—' }} · {{ s.customer?.name || '—' }}</div>
              <div>{{ cashierName(s.cashier_id) }} · {{ s.sale_items?.length ?? 0 }} item(s)</div>
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <v-btn variant="text" size="small" color="primary" class="text-none" @click="openReceipt(s)">
                Reprint
              </v-btn>
              <v-chip v-if="isPending(s.id)" size="x-small" color="warning" variant="tonal" label>Void pending</v-chip>
              <v-btn
                v-else-if="canVoid(s)"
                variant="text"
                size="small"
                color="error"
                class="text-none"
                @click="openChange(s)"
              >
                Request Void
              </v-btn>
            </div>
          </template>
        </v-list-item>
        <v-list-item v-if="!filteredSales.length && !loading">
          <v-list-item-title class="text-medium-emphasis text-body-2">No sales found.</v-list-item-title>
        </v-list-item>
      </v-list>

      <!-- Desktop: table -->
      <v-data-table
        v-else
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
          {{ item.warehouse?.name ?? '—' }}
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