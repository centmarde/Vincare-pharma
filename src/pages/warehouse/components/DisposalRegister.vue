<script setup lang="ts">
import { onMounted } from 'vue'
import { useDisplay } from 'vuetify'
import { formatCurrency, formatMonthYear, formatDatePR_ISO } from '@/utils/helpers'
import { useDisposalRegister } from '../composables/useDisposalRegister'
import DisposalRegisterMobile from '../mobile/DisposalRegisterMobile.vue'

const { mobile } = useDisplay()

const {
  loading,
  search,
  selectedMonthKey,
  page,
  itemsPerPage,
  headers,
  monthOptions,
  filteredDisposals,
  totalUnits,
  totalValue,
  disposalCount,
  hasData,
  clearFilters,
  init,
} = useDisposalRegister()

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2">
    <v-card class="mx-auto w-100" rounded="lg" variant="outlined">
      <v-card-item class="pa-4 pa-sm-5 pb-2">
        <div class="d-flex align-center flex-wrap ga-2">
          <div>
            <v-card-title class="text-h6 font-weight-bold pa-0">Disposed Products</v-card-title>
            <v-card-subtitle class="pa-0 pt-1" style="white-space: normal">
              Stock destroyed after executive approval, valued at cost
            </v-card-subtitle>
          </div>
          <v-spacer />
          <v-select
            v-model="selectedMonthKey"
            :items="monthOptions"
            item-title="title"
            item-value="value"
            label="Disposed month"
            density="compact"
            variant="outlined"
            hide-details
            class="filter-field"
          ></v-select>
          <v-text-field
            v-model="search"
            density="compact"
            variant="outlined"
            placeholder="Search DS no., product, batch…"
            prepend-inner-icon="mdi-magnify"
            clearable
            hide-details
            single-line
            class="filter-field"
          ></v-text-field>
          <v-btn
            variant="text"
            class="text-none"
            prepend-icon="mdi-filter-off-outline"
            @click="clearFilters"
          >
            Clear
          </v-btn>
        </div>
      </v-card-item>

      <v-divider class="my-2" />

      <v-card-text class="pa-4 pa-sm-5 pt-2">
        <v-row dense class="mb-4">
          <v-col cols="6" sm="4">
            <v-card variant="outlined" rounded="lg" class="pa-4 h-100">
              <v-icon icon="mdi-file-document-outline" size="18" class="mb-2 text-medium-emphasis" />
              <div class="text-caption text-medium-emphasis">Disposal records</div>
              <div class="text-h5 font-weight-bold">{{ disposalCount }}</div>
            </v-card>
          </v-col>
          <v-col cols="6" sm="4">
            <v-card variant="outlined" rounded="lg" class="pa-4 h-100">
              <v-icon icon="mdi-delete-outline" size="18" class="mb-2 text-medium-emphasis" />
              <div class="text-caption text-medium-emphasis">Units destroyed</div>
              <div class="text-h5 font-weight-bold">{{ totalUnits }}</div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="4">
            <v-card variant="outlined" rounded="lg" class="pa-4 h-100">
              <v-icon icon="mdi-cash-remove" size="18" class="mb-2 text-error" />
              <div class="text-caption text-medium-emphasis">Value written off</div>
              <div class="text-h5 font-weight-bold text-error text-no-wrap">
                {{ formatCurrency(totalValue) }}
              </div>
            </v-card>
          </v-col>
        </v-row>

        <div v-if="loading" class="text-center py-10">
          <v-progress-circular indeterminate color="primary" size="40"></v-progress-circular>
          <p class="text-medium-emphasis mt-3">Loading disposal register…</p>
        </div>

        <div v-else-if="!hasData" class="text-center py-10">
          <v-icon icon="mdi-delete-off-outline" size="40" color="success"></v-icon>
          <p class="text-medium-emphasis mt-3">No disposed products on record.</p>
        </div>

        <DisposalRegisterMobile v-else-if="mobile" :disposals="filteredDisposals" />

        <v-data-table
          v-else
          v-model:page="page"
          v-model:items-per-page="itemsPerPage"
          :headers="headers"
          :items="filteredDisposals"
          density="comfortable"
          class="rounded-lg border"
        >
          <template #item.reference_no="{ item }">
            <span class="font-weight-medium">{{ item.reference_no ?? `#${item.id}` }}</span>
          </template>

          <template #item.product_name="{ item }">
            <div class="text-body-2">{{ item.product?.product_name ?? '—' }}</div>
            <div class="text-caption text-medium-emphasis">
              SKU: {{ item.product?.sku || 'No SKU' }}
            </div>
          </template>

          <template #item.batch_no="{ item }">
            {{ item.product?.batch_no || '—' }}
          </template>

          <template #item.expiry_date="{ item }">
            {{ item.product?.expiry_date ? formatMonthYear(item.product.expiry_date) : 'N/A' }}
          </template>

          <template #item.qty="{ item }">
            <span class="font-weight-medium">{{ item.qty }}</span>
          </template>

          <template #item.total_cost="{ item }">
            <span class="text-error font-weight-medium">{{ formatCurrency(item.total_cost) }}</span>
          </template>

          <template #item.reason="{ item }">
            <span class="text-caption">{{ item.reason || '—' }}</span>
          </template>

          <template #item.approver_name="{ item }">
            {{ item.approver_name ?? '—' }}
          </template>

          <template #item.updated_at="{ item }">
            {{ formatDatePR_ISO(item.updated_at ?? item.created_at) }}
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
.filter-field {
  min-width: 200px;
  max-width: 280px;
  width: 100%;
}
@media (max-width: 600px) {
  .filter-field {
    min-width: 100%;
    max-width: 100%;
  }
}
</style>
