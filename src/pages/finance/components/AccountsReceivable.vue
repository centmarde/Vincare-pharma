<script setup lang="ts">
import { useAccountsReceivable, arHeaders } from '../composables/useAccountsReceivable'
import { formatCurrency } from '@/utils/helpers'

const { arAging, loading, totalReceivable, bucketTotals, overdueReceivable } = useAccountsReceivable()

const bucketLabels: Record<string, string> = {
  current: 'Current',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': '90+ days',
  'no-term': 'No term',
}
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
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
            <div class="text-caption text-medium-emphasis">Past due date (1-30 through 90+)</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="6">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis mb-1">By Bucket</div>
            <div class="d-flex flex-wrap ga-3">
              <div v-for="b in bucketTotals" :key="b.bucket">
                <div class="text-caption text-medium-emphasis">{{ bucketLabels[b.bucket] }}</div>
                <div class="text-body-1 font-weight-bold">{{ formatCurrency(b.total) }}</div>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- AR ledger -->
      <v-card rounded="lg" elevation="1">
        <v-card-title class="pa-4 pa-sm-5 text-h6 font-weight-bold">Accounts Receivable</v-card-title>
        <v-divider />

        <v-data-table
          :headers="arHeaders"
          :items="arAging"
          :loading="loading"
          loading-text="Loading accounts receivable..."
          no-data-text="No outstanding receivables."
          hover
        >
          <template #item.source="{ item }">
            <v-chip size="small" variant="tonal">{{ item.source === 'ethical_order' ? 'Ethical' : 'In-House' }}</v-chip>
          </template>

          <template #item.customer_name="{ item }">
            {{ item.customer_name ?? '—' }}
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

          <template #item.bucket="{ item }">
            <v-chip
              size="small"
              variant="tonal"
              :color="item.bucket === 'current' ? 'success' : item.bucket === 'no-term' ? 'grey' : 'warning'"
            >
              {{ bucketLabels[item.bucket] }}
            </v-chip>
          </template>
        </v-data-table>
      </v-card>

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
</style>
