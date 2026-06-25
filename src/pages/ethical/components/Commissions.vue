<template>
  <v-container fluid pa-0>
    <v-card class="elevation-0">
      <v-card-title>Commission Tracking</v-card-title>

      <v-card-text>
        <div class="mb-4">
          <h4 class="mb-3">Commission Summary by Agent</h4>
          <v-table dense>
            <thead>
              <tr>
                <th>Agent</th>
                <th class="text-right">Total Commission</th>
                <th class="text-right">Unpaid</th>
                <th class="text-right">Paid</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(summary, idx) in commissionSummary" :key="`summary-${idx}`">
                <td>{{ summary.agent_name || 'Unassigned' }}</td>
                <td class="text-right">{{ summary.total_commission.toFixed(2) }}</td>
                <td class="text-right">{{ summary.unpaid_commission.toFixed(2) }}</td>
                <td class="text-right">{{ summary.paid_commission.toFixed(2) }}</td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <v-divider class="my-4" />

        <div>
          <h4 class="mb-3">Collection Details</h4>
          <div class="mb-4 d-flex gap-2">
            <v-select
              v-model="statusFilter"
              :items="[{ title: 'All', value: 'all' }, { title: 'Paid', value: 'paid' }, { title: 'Unpaid', value: 'unpaid' }]"
              label="Commission Status"
              style="max-width: 200px"
            />
          </div>

          <v-progress-linear v-if="loading" indeterminate />
          <v-table dense>
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
                <td class="text-right">{{ col.amount?.toFixed(2) }}</td>
                <td class="text-right">{{ col.commission_rate?.toFixed(2) }}%</td>
                <td class="text-right">{{ col.commission_amount?.toFixed(2) }}</td>
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
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCommissions } from '../composables/useCommissions'
import { useEthicalDataStore } from '@/stores/ethicalData'

const { collections, commissionSummary, loading, statusFilter, init } = useCommissions()
const ethical = useEthicalDataStore()

async function markPaid(collectionId: number) {
  await ethical.markCommissionPaid(collectionId)
}

onMounted(() => init())
</script>
