<script setup lang="ts">
import { useAccountsReceivable, arHeaders } from '../composables/useAccountsReceivable'
import type { ARAgingRow } from '@/stores/financeData'
import { formatCurrency } from '@/utils/helpers'
import ARDetailDialog from './dialogs/ARDetailDialog.vue'
import SOADialog from './dialogs/SOADialog.vue'

const {
  loading, totalReceivable, termTotals, overdueReceivable, customerJackets,
  detailOpen, detailLoading, selectedDetail, openDetail,
  soaOpen, soaLoading, soaData, openSOA,
} = useAccountsReceivable()

// v-data-table @click:row passes (pointerEvent, { item }); typing lives here in
// <script> because an inline type annotation in the template is a parse error.
function onRowClick(_event: unknown, { item }: { item: ARAgingRow }) {
  openDetail(item)
}

const termColor: Record<string, string> = {
  current: 'success',
  'no-term': 'grey',
  '1-30': 'warning',
  '31-60': 'warning',
  '61-90': 'error',
  '91-180': 'error',
  '180+': 'error',
}

const termLabels: Record<string, string> = {
  current: 'Current',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '91-180': '91–180 days',
  '180+': 'Over 6 months',
  'no-term': 'No term',
}
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <div class="mx-auto w-100">

      <!-- KPI cards -->
      <v-row dense class="mb-1">
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Total Receivable</div>
            <div class="text-h5 font-weight-bold">{{ formatCurrency(totalReceivable) }}</div>
            <div class="text-caption text-medium-emphasis">Outstanding balance, all accounts</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Overdue</div>
            <div class="text-h5 font-weight-bold text-error">{{ formatCurrency(overdueReceivable) }}</div>
            <div class="text-caption text-medium-emphasis">Past due date (1-30 through over 6 months)</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="6">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis mb-1">By Term</div>
            <div class="d-flex flex-wrap ga-3">
              <div v-for="t in termTotals" :key="t.term">
                <div class="text-caption text-medium-emphasis">{{ termLabels[t.term] }}</div>
                <div class="text-body-1 font-weight-bold">{{ formatCurrency(t.total) }}</div>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- AR ledger, grouped into per-customer jackets -->
      <v-card rounded="lg" elevation="1">
        <v-card-title class="pa-4 pa-sm-5 text-h6 font-weight-bold">Accounts Receivable</v-card-title>
        <v-divider />

        <div v-if="loading" class="pa-6 text-center text-caption text-medium-emphasis">
          Loading accounts receivable...
        </div>
        <div v-else-if="!customerJackets.length" class="pa-6 text-center text-caption text-medium-emphasis">
          No outstanding receivables.
        </div>

        <v-expansion-panels v-else variant="accordion" multiple>
          <v-expansion-panel v-for="jacket in customerJackets" :key="jacket.key">
            <v-expansion-panel-title>
              <div class="d-flex align-center ga-3 flex-grow-1 pr-3">
                <span class="font-weight-medium">{{ jacket.customerName }}</span>
                <v-chip size="small" variant="tonal">{{ jacket.docCount }} open doc{{ jacket.docCount === 1 ? '' : 's' }}</v-chip>
                <v-btn
                  v-if="jacket.customerId != null"
                  size="small" variant="text" color="primary" class="text-none"
                  prepend-icon="mdi-file-document-outline"
                  @click.stop="openSOA(jacket.customerId)"
                >
                  View SOA
                </v-btn>
                <v-spacer />
                <v-chip size="small" variant="tonal" :color="termColor[jacket.worstTerm]">
                  {{ termLabels[jacket.worstTerm] }}
                </v-chip>
                <span class="font-weight-bold">{{ formatCurrency(jacket.totalBalance) }}</span>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text class="pa-0">
              <v-data-table
                :headers="arHeaders"
                :items="jacket.rows"
                hide-default-footer
                hover
                @click:row="onRowClick"
              >
                <template #item.source="{ item }">
                  <v-chip size="small" variant="tonal">{{ item.source === 'ethical_order' ? 'Ethical' : 'In-House' }}</v-chip>
                </template>

                <template #item.total_amount="{ item }">
                  {{ formatCurrency(item.total_amount) }}
                </template>

                <template #item.amount_paid="{ item }">
                  {{ formatCurrency(item.amount_paid) }}
                </template>

                <template #item.balance="{ item }">
                  <span class="font-weight-bold">{{ formatCurrency(item.balance) }}</span>
                </template>

                <template #item.days_overdue="{ item }">
                  {{ item.days_overdue ?? '—' }}
                </template>

                <template #item.term="{ item }">
                  <v-chip size="small" variant="tonal" :color="termColor[item.term]">
                    {{ termLabels[item.term] }}
                  </v-chip>
                </template>
              </v-data-table>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card>

      <ARDetailDialog
        v-model="detailOpen"
        :loading="detailLoading"
        :detail="selectedDetail"
      />

      <SOADialog
        v-model="soaOpen"
        :loading="soaLoading"
        :soa="soaData"
      />

    </div>
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
:deep(.v-data-table td) {
  text-align: center !important;
}
:deep(.v-data-table tbody tr) {
  cursor: pointer;
}
</style>
