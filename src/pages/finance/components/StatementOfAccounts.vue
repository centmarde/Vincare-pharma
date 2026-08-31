<script setup lang="ts">
import { useStatementOfAccounts } from '../composables/useStatementOfAccounts'

const {
  register,
  totals,
  loading,
  filterCustomerId,
  filterArea,
  filterSource,
  filterDateFrom,
  filterDateTo,
  outstandingOnly,
  areaOptions,
  customerOptions,
  asOfLabel,
  outstandingTotal,
  agedTotal,
  unagedRows,
  unagedTotal,
  SOA_HEADERS,
  TERM_LABELS,
  TERM_COLORS,
  refresh,
  clearFilters,
  cellValue,
  exportCsv,
  formatCurrency,
} = useStatementOfAccounts()

const SOURCE_OPTIONS = [
  { title: 'In-House', value: 'inhouse_order' },
  { title: 'Ethical', value: 'ethical_order' },
]

// Which columns get the aging tint — mirrors the green block on the sheet.
const AGING_KEYS = new Set([
  'days_outstanding',
  'due_date',
  'amount_unpaid',
  'term',
  'bucket_1_30',
  'bucket_31_60',
  'bucket_61_90',
  'bucket_91_180',
  'bucket_180_plus',
])
const RECEIPT_KEYS = new Set(['or_date', 'or_no', 'or_amount', 'discount', 'credit'])

const TOTAL_KEYS: Record<string, keyof typeof totals.value> = {
  dr_amount: 'dr_amount',
  or_amount: 'or_amount',
  discount: 'discount',
  accounts_receivable: 'accounts_receivable',
  bucket_1_30: 'bucket_1_30',
  bucket_31_60: 'bucket_31_60',
  bucket_61_90: 'bucket_61_90',
  bucket_91_180: 'bucket_91_180',
  bucket_180_plus: 'bucket_180_plus',
}
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <div class="mx-auto w-100">
      <!-- Summary -->
      <v-row dense class="mb-1">
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Outstanding Balance</div>
            <div class="text-h5 font-weight-bold">{{ formatCurrency(outstandingTotal) }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ register.length }} delivery receipt{{ register.length === 1 ? '' : 's' }}
            </div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Past Due</div>
            <div class="text-h5 font-weight-bold text-error">{{ formatCurrency(agedTotal) }}</div>
            <div class="text-caption text-medium-emphasis">1–30 through over 6 months</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Collected</div>
            <div class="text-h5 font-weight-bold">{{ formatCurrency(totals.or_amount) }}</div>
            <div class="text-caption text-medium-emphasis">ORs applied to these receipts</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Current Date</div>
            <div class="text-body-1 font-weight-bold">{{ asOfLabel }}</div>
            <div class="text-caption text-medium-emphasis">Aging computed as of today</div>
          </v-card>
        </v-col>
      </v-row>

      <v-card rounded="lg" elevation="1">
        <v-card-title class="pa-4 pa-sm-5 d-flex align-center flex-wrap ga-2">
          <span class="text-h6 font-weight-bold">Statement of Accounts</span>
          <v-spacer />
          <v-btn
            size="small"
            variant="tonal"
            color="primary"
            class="text-none"
            prepend-icon="mdi-file-delimited-outline"
            :disabled="!register.length"
            @click="exportCsv"
          >
            Export CSV
          </v-btn>
        </v-card-title>
        <v-divider />

        <!-- Filters -->
        <div class="pa-4 pa-sm-5">
          <v-row dense>
            <v-col cols="12" sm="6" md="3">
              <v-autocomplete
                v-model="filterCustomerId"
                :items="customerOptions"
                label="Customer"
                density="compact"
                variant="outlined"
                clearable
                hide-details
                @update:model-value="refresh"
              />
            </v-col>
            <v-col cols="12" sm="6" md="2">
              <v-select
                v-model="filterArea"
                :items="areaOptions"
                label="Area"
                density="compact"
                variant="outlined"
                clearable
                hide-details
                @update:model-value="refresh"
              />
            </v-col>
            <v-col cols="12" sm="6" md="2">
              <v-select
                v-model="filterSource"
                :items="SOURCE_OPTIONS"
                label="Department"
                density="compact"
                variant="outlined"
                clearable
                hide-details
                @update:model-value="refresh"
              />
            </v-col>
            <v-col cols="12" sm="6" md="2">
              <v-text-field
                v-model="filterDateFrom"
                label="DR date from"
                type="date"
                density="compact"
                variant="outlined"
                clearable
                hide-details
                @update:model-value="refresh"
              />
            </v-col>
            <v-col cols="12" sm="6" md="2">
              <v-text-field
                v-model="filterDateTo"
                label="DR date to"
                type="date"
                density="compact"
                variant="outlined"
                clearable
                hide-details
                @update:model-value="refresh"
              />
            </v-col>
            <v-col cols="12" sm="6" md="1" class="d-flex align-center">
              <v-btn size="small" variant="text" class="text-none" @click="clearFilters"
                >Clear</v-btn
              >
            </v-col>
          </v-row>
          <div class="d-flex align-center flex-wrap ga-2 mt-2">
            <v-switch
              v-model="outstandingOnly"
              label="Outstanding only"
              color="primary"
              density="compact"
              hide-details
              inset
              @update:model-value="refresh"
            />
          </div>
        </div>

        <div v-if="unagedRows.length" class="px-4 px-sm-5 pb-4">
          <v-alert type="warning" variant="tonal" density="compact" class="text-caption">
            {{ unagedRows.length }} receipt{{ unagedRows.length === 1 ? '' : 's' }} ({{
              formatCurrency(unagedTotal)
            }}) can't be aged — the customer has no payment terms set. In-House orders carry no due
            date of their own, so set <strong>Term (days)</strong> on the customer record for these
            to fall into a bucket.
          </v-alert>
        </div>

        <v-divider />

        <div v-if="loading" class="pa-6 text-center text-caption text-medium-emphasis">
          Building the register...
        </div>
        <div
          v-else-if="!register.length"
          class="pa-6 text-center text-caption text-medium-emphasis"
        >
          No delivery receipts match these filters.
        </div>

        <v-data-table
          mobile-breakpoint="md"
          v-else
          :headers="SOA_HEADERS"
          :items="register"
          item-value="delivery_receipt_id"
          density="compact"
          class="text-no-wrap soa-table"
          :items-per-page="50"
        >
          <template #item="{ item }">
            <tr>
              <td
                v-for="h in SOA_HEADERS"
                :key="h.key"
                :class="[
                  h.align === 'end' ? 'text-right' : '',
                  AGING_KEYS.has(h.key) ? 'soa-aging' : '',
                  RECEIPT_KEYS.has(h.key) ? 'soa-receipt' : '',
                  h.key === 'accounts_receivable' || h.key === 'pdc_amount' ? 'soa-ar' : '',
                ]"
              >
                <v-chip
                  v-if="h.key === 'term'"
                  size="x-small"
                  variant="tonal"
                  :color="TERM_COLORS[item.term]"
                >
                  {{ TERM_LABELS[item.term] }}
                </v-chip>
                <template v-else-if="h.key === 'or_no'">
                  {{ cellValue(item, h.key) }}
                  <v-tooltip
                    v-if="item.or_count > 1"
                    text="Settled by more than one OR — the latest is shown"
                  >
                    <template #activator="{ props }">
                      <v-icon v-bind="props" size="x-small" class="ml-1"
                        >mdi-information-outline</v-icon
                      >
                    </template>
                  </v-tooltip>
                </template>
                <template v-else>{{ cellValue(item, h.key) }}</template>
              </td>
            </tr>
          </template>

          <template #body.append>
            <tr class="font-weight-bold">
              <td
                v-for="h in SOA_HEADERS"
                :key="h.key"
                :class="[
                  h.align === 'end' ? 'text-right' : '',
                  AGING_KEYS.has(h.key) ? 'soa-aging' : '',
                  RECEIPT_KEYS.has(h.key) ? 'soa-receipt' : '',
                ]"
              >
                <span v-if="h.key === 'customer_name'">TOTAL</span>
                <span v-else-if="TOTAL_KEYS[h.key]">{{
                  formatCurrency(totals[TOTAL_KEYS[h.key]])
                }}</span>
              </td>
            </tr>
          </template>
        </v-data-table>

        <v-divider />
        <div class="pa-4 pa-sm-5 text-caption text-medium-emphasis">
          One row per delivery receipt. Payments are recorded against the order, so each OR is
          applied to that order's delivery receipts oldest-first — per-DR figures are a derived
          allocation, not a recorded fact. Order-level totals always tie out exactly.
          <strong>Credit</strong> and <strong>PDC</strong> are layout placeholders: neither credit
          memos nor post-dated cheques are tracked in the system, so those columns stay blank rather
          than showing a number that isn't real.
        </div>
      </v-card>
    </div>
  </v-container>
</template>

<style scoped>
.soa-table :deep(td) {
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.soa-table :deep(.soa-aging) {
  background-color: rgba(76, 175, 80, 0.08);
}
.soa-table :deep(.soa-receipt) {
  background-color: rgba(255, 138, 101, 0.08);
}
.soa-table :deep(.soa-ar) {
  background-color: rgba(66, 165, 245, 0.08);
}
</style>
