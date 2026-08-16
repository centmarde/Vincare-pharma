<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCommissions } from '../composables/useCommissions'
import { useEthicalDataStore } from '@/stores/ethicalData'
import { formatCurrency } from '@/utils/helpers'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const { collections, commissionSummary, loading, statusFilter, init } = useCommissions()
const ethical = useEthicalDataStore()

async function markPaid(collectionId: number) {
  await ethical.markCommissionPaid(collectionId)
}

onMounted(() => init())
</script>

<template>
  <v-container fluid class="pa-2 pa-sm-4 fill-height align-start">
    <div class="mx-auto w-100">
      <v-card class="elevation-0" rounded="lg">
        <!-- Header -->
        <v-card-title class="pa-4 pa-sm-5 d-flex align-center ga-2">
          <v-icon icon="mdi-cash-multiple" color="primary" />
          <span class="text-h6 font-weight-bold">Commission Tracking</span>
        </v-card-title>
        <v-divider />

        <v-card-text class="pa-4 pa-sm-5">
          <!-- Commission Summary -->
          <h4 class="mb-3 text-body-1 font-weight-bold">Commission Summary by Medical Sales Representative</h4>

          <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

          <!-- MOBILE: summary cards -->
          <template v-if="mobile">
            <v-card
              v-for="(summary, idx) in commissionSummary" :key="`summary-${idx}`"
              variant="outlined" rounded="lg" class="mb-2 pa-3"
            >
              <div class="d-flex align-start ga-3">
                <v-avatar size="36" color="primary" variant="tonal">
                  <span class="text-body-2 font-weight-bold">
                    {{ (summary.agent_name || '?').charAt(0).toUpperCase() }}
                  </span>
                </v-avatar>
                <div class="flex-grow-1" style="min-width: 0">
                  <div class="font-weight-medium text-body-2 text-truncate">
                    {{ summary.agent_name || 'Unassigned' }}
                  </div>
                  <div class="text-caption text-medium-emphasis mt-2">
                    <div class="d-flex justify-space-between mb-1">
                      <span>Total Commission</span>
                      <span class="font-weight-medium">{{ formatCurrency(summary.total_commission) }}</span>
                    </div>
                    <div class="d-flex justify-space-between mb-1">
                      <span class="text-warning">Unpaid</span>
                      <span class="font-weight-medium text-warning">{{ formatCurrency(summary.unpaid_commission) }}</span>
                    </div>
                    <div class="d-flex justify-space-between">
                      <span class="text-success">Paid</span>
                      <span class="font-weight-medium text-success">{{ formatCurrency(summary.paid_commission) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </v-card>
          </template>

          <!-- DESKTOP: summary table -->
          <v-table v-else dense class="commission-table">
            <thead>
              <tr>
                <th>MSR</th>
                <th class="text-right">Total Commission</th>
                <th class="text-right">Unpaid</th>
                <th class="text-right">Paid</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(summary, idx) in commissionSummary" :key="`summary-${idx}`">
                <td>{{ summary.agent_name || 'Unassigned' }}</td>
                <td class="text-right">{{ formatCurrency(summary.total_commission) }}</td>
                <td class="text-right">{{ formatCurrency(summary.unpaid_commission) }}</td>
                <td class="text-right">{{ formatCurrency(summary.paid_commission) }}</td>
              </tr>
            </tbody>
          </v-table>

          <v-divider class="my-4" />

          <!-- Collection Details -->
          <h4 class="mb-3 text-body-1 font-weight-bold">Collection Details</h4>

          <div class="mb-4">
            <v-select
              v-model="statusFilter"
              :items="[{ title: 'All', value: 'all' }, { title: 'Paid', value: 'paid' }, { title: 'Unpaid', value: 'unpaid' }]"
              label="Commission Status"
              variant="outlined" density="compact" hide-details
              :style="mobile ? undefined : 'max-width: 200px'"
            />
          </div>

          <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

          <!-- Empty state -->
          <div
            v-if="!loading && collections.length === 0"
            class="d-flex flex-column align-center py-8 text-medium-emphasis"
          >
            <v-icon icon="mdi-cash-off" size="40" class="mb-2" />
            <span class="text-body-2">No collection records found</span>
          </div>

          <!-- MOBILE: collection cards -->
          <template v-else-if="mobile">
            <v-card
              v-for="(col, idx) in collections" :key="`col-${idx}`"
              variant="outlined" rounded="lg" class="mb-2 pa-3"
            >
              <div class="d-flex align-start ga-3">
                <v-avatar size="36" color="primary" variant="tonal">
                  <v-icon size="20" icon="mdi-cash" />
                </v-avatar>
                <div class="flex-grow-1" style="min-width: 0">
                  <div class="d-flex align-center justify-space-between ga-2">
                    <span class="font-weight-medium text-body-2">
                      {{ col.created_at ? new Date(col.created_at).toLocaleDateString() : '—' }}
                    </span>
                    <v-chip
                      :color="col.commission_status === 'paid' ? 'success' : 'warning'"
                      size="x-small" variant="tonal"
                    >
                      {{ col.commission_status }}
                    </v-chip>
                  </div>

                  <div class="text-caption text-medium-emphasis mt-2">
                    <div class="d-flex justify-space-between mb-1">
                      <span>Amount</span>
                      <span class="font-weight-medium">{{ formatCurrency(col.amount ?? 0) }}</span>
                    </div>
                    <div class="d-flex justify-space-between mb-1">
                      <span>Commission %</span>
                      <span class="font-weight-medium">{{ col.commission_rate?.toFixed(2) }}%</span>
                    </div>
                    <div class="d-flex justify-space-between mb-1">
                      <span>Commission Amt</span>
                      <span class="font-weight-medium">{{ formatCurrency(col.commission_amount ?? 0) }}</span>
                    </div>
                  </div>

                  <v-btn
                    v-if="col.commission_status === 'unpaid' && col.id"
                    size="small" variant="flat" color="primary" class="text-none mt-2"
                    :block="mobile"
                    @click="markPaid(col.id || 0)"
                  >
                    Mark Paid
                  </v-btn>
                </div>
              </div>
            </v-card>
          </template>

          <!-- DESKTOP: collection table -->
          <v-table v-else dense class="commission-table">
            <thead>
              <tr>
                <th>Date</th>
                <th class="text-right">Amount</th>
                <th class="text-right">Commission %</th>
                <th class="text-right">Commission Amt</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(col, idx) in collections" :key="`col-${idx}`">
                <td>{{ col.created_at ? new Date(col.created_at).toLocaleDateString() : '—' }}</td>
                <td class="text-right">{{ formatCurrency(col.amount ?? 0) }}</td>
                <td class="text-right">{{ col.commission_rate?.toFixed(2) }}%</td>
                <td class="text-right">{{ formatCurrency(col.commission_amount ?? 0) }}</td>
                <td>
                  <v-chip :color="col.commission_status === 'paid' ? 'success' : 'warning'" size="x-small">
                    {{ col.commission_status }}
                  </v-chip>
                </td>
                <td>
                  <v-btn
                    v-if="col.commission_status === 'unpaid' && col.id"
                    size="x-small"
                    color="primary"
                    @click="markPaid(col.id || 0)"
                  >
                    Mark Paid
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </div>
  </v-container>
</template>

<style scoped>
.commission-table :deep(tbody tr:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>