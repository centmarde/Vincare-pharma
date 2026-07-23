<script setup lang="ts">
import { onMounted } from 'vue'
import { useRebatePayouts } from '../composables/useRebatePayouts'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const {
  rows, loading, searchText, statusFilter, headers,
  paymentMethodOptions, statusFilterOptions, cashAccountOptions, statusMeta,
  pendingCount, pendingTotal, approvedTotal,
  showPayDialog, payingOrder, payMethod, payReference, payPaidTo, payCashAccountId,
  showRejectDialog, rejectReason,
  init, approve, openReject, cancelReject, confirmReject, openPay, cancelPay, confirmPay,
} = useRebatePayouts()

onMounted(() => init())
</script>

<template>
  <v-container fluid pa-0>
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center ga-2 pb-2">
        <span>Rebate Payouts</span>
      </v-card-title>

      <v-card-text>
        <div class="text-caption text-medium-emphasis mb-4">
          A rebate becomes due once its order is paid in full. Every rebate needs approval
          before cash goes out. Record who received it — it's the only support for the expense.
        </div>

        <v-row dense class="mb-2">
          <v-col cols="12" sm="4">
            <v-card variant="tonal" color="warning" class="pa-3">
              <div class="text-caption">Pending Approval</div>
              <div class="text-h6 font-weight-bold">{{ pendingCount }}</div>
              <div class="text-caption">{{ formatCurrency(pendingTotal) }}</div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="4">
            <v-card variant="tonal" color="info" class="pa-3">
              <div class="text-caption">Approved — awaiting payout</div>
              <div class="text-h6 font-weight-bold">{{ formatCurrency(approvedTotal) }}</div>
            </v-card>
          </v-col>
        </v-row>

        <div class="d-flex ga-2 mb-4">
          <v-text-field
            v-model="searchText"
            density="compact"
            placeholder="Search order, customer, MSR..."
            prepend-icon="mdi-magnify"
            hide-details
          />
          <v-select
            v-model="statusFilter"
            :items="statusFilterOptions"
            item-title="title"
            item-value="value"
            density="compact"
            hide-details
            style="max-width: 240px"
          />
        </div>

        <v-progress-linear v-if="loading" indeterminate />
        <v-data-table :headers="headers" :items="rows" :loading="loading">
          <template #item.total_amount="{ item }">
            {{ formatCurrency(item.total_amount ?? 0) }}
          </template>
          <template #item.rebate_amount="{ item }">
            <span class="font-weight-bold">{{ formatCurrency(item.rebate_amount ?? 0) }}</span>
          </template>
          <template #item.paid_at="{ item }">
            {{ item.paid_at ? formatDatePR_ISO(item.paid_at) : '—' }}
          </template>
          <template #item.rebate_status="{ item }">
            <v-chip :color="statusMeta(item.rebate_status).color" size="small" label>
              {{ statusMeta(item.rebate_status).label }}
            </v-chip>
          </template>
          <template #item.actions="{ item }">
            <template v-if="item.rebate_status === 'pending_approval'">
              <v-btn size="x-small" color="success" variant="text" class="text-none" @click="approve(item.id)">
                Approve
              </v-btn>
              <v-btn size="x-small" color="error" variant="text" class="text-none" @click="openReject(item.id)">
                Reject
              </v-btn>
            </template>
            <v-btn
              v-else-if="item.rebate_status === 'approved'"
              size="x-small"
              color="primary"
              class="text-none font-weight-bold"
              elevation="0"
              @click="openPay(item.id)"
            >
              Record Payout
            </v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <!-- Payout -->
    <v-dialog v-model="showPayDialog" persistent max-width="560px">
      <v-card v-if="payingOrder">
        <v-card-title>Record Rebate Payout</v-card-title>
        <v-card-text>
          <div class="mb-3">
            <div class="text-body-2">Order <strong>{{ payingOrder.order_no }}</strong></div>
            <div class="text-body-2">{{ payingOrder.customer?.name }}</div>
            <div class="text-h6 font-weight-bold mt-1">{{ formatCurrency(payingOrder.rebate_amount ?? 0) }}</div>
          </div>

          <v-text-field
            v-model="payPaidTo"
            label="Received by"
            hint="Name of the person who actually received the rebate — required support for the expense"
            persistent-hint
            class="mb-2"
          />
          <v-select
            v-model="payMethod"
            :items="paymentMethodOptions"
            item-title="title"
            item-value="value"
            label="Payment Method"
            class="mb-2"
          />
          <v-text-field
            v-model="payReference"
            label="Reference No."
            :hint="payMethod === 'cheque' ? 'Cheque number' : payMethod === 'gcash' ? 'GCash reference no.' : 'Reference / receipt no. (optional for cash)'"
            persistent-hint
            class="mb-2"
          />
          <v-select
            v-model="payCashAccountId"
            :items="cashAccountOptions"
            item-title="title"
            item-value="value"
            label="Funding Cash Account"
            hint="Petty cash credits 1010 Cash on Hand; everything else credits 1020 Cash in Bank"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn class="text-none" @click="cancelPay">Cancel</v-btn>
          <v-btn color="primary" class="text-none font-weight-bold" elevation="0" :loading="loading" @click="confirmPay">
            Record Payout
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Reject -->
    <v-dialog v-model="showRejectDialog" persistent max-width="480px">
      <v-card>
        <v-card-title>Reject Rebate</v-card-title>
        <v-card-text>
          <div class="text-caption text-medium-emphasis mb-2">
            Rejecting reverses the accrued rebate expense in the General Ledger.
          </div>
          <v-textarea v-model="rejectReason" label="Reason" rows="3" auto-grow />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn class="text-none" @click="cancelReject">Cancel</v-btn>
          <v-btn color="error" class="text-none font-weight-bold" elevation="0" :loading="loading" @click="confirmReject">
            Reject
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
