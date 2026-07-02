<script setup lang="ts">
import { useCashAccounts, requestHeaders } from '../composables/useCashAccounts'
import CashAccountsManager from './CashAccountsManager.vue'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const {
  cashAccounts, pettyCashAccount, bankAccounts,
  replenishmentRequests, loading,
  showRequestDialog, fundingAccountId, remarks, canSubmitRequest,
  requestPreview, requestPreviewTotal, requestPreviewLoading,
  showReportDialog, reportItems, reportTotal, openReportDialog,
  showRejectDialog, rejectReason,
  isOwnRequest,
  openRequestDialog, submitRequest, approve, openRejectDialog, confirmReject,
  createAccount,
} = useCashAccounts()
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <div class="mx-auto w-100">

      <!-- Accounts grouped by classification (header + cards + add dialog) -->
      <CashAccountsManager :accounts="cashAccounts" :loading="loading" @create="createAccount" />

      <!-- Replenishment requests -->
      <v-card rounded="lg" elevation="1">
        <v-card-title class="pa-4 pa-sm-5 d-flex justify-space-between align-center">
          <span class="text-h6 font-weight-bold">Petty Cash Replenishment Requests</span>
          <v-btn
            class="text-none"
            size="small"
            color="primary"
            variant="tonal"
            :disabled="!pettyCashAccount || bankAccounts.length === 0"
            @click="openRequestDialog"
          >
            Request Replenishment
          </v-btn>
        </v-card-title>
        <v-divider />

        <v-data-table
          :headers="requestHeaders"
          :items="replenishmentRequests"
          :loading="loading"
          loading-text="Loading requests..."
          no-data-text="No replenishment requests yet."
          hover
        >
          <template #item.created_at="{ item }">
            {{ formatDatePR_ISO(item.created_at) }}
          </template>

          <template #item.cash_account_name="{ item }">
            {{ item.cash_account_name ?? '—' }}
          </template>

          <template #item.funding_account_name="{ item }">
            {{ item.funding_account_name ?? '—' }}
          </template>

          <template #item.amount="{ item }">
            <span class="font-weight-medium">{{ formatCurrency(item.amount) }}</span>
          </template>

          <template #item.remarks="{ item }">
            <span class="text-truncate d-inline-block" style="max-width: 180px">{{ item.remarks || '—' }}</span>
          </template>

          <template #item.status="{ item }">
            <v-chip
              size="small"
              variant="tonal"
              :color="item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'"
            >
              {{ item.status }}
            </v-chip>
          </template>

          <template #item.actions="{ item }">
            <div class="d-flex justify-center align-center ga-2">
              <v-btn size="small" variant="text" @click="openReportDialog(item.id)">
                View Report
              </v-btn>
              <template v-if="item.status === 'pending_approval'">
                <v-tooltip v-if="isOwnRequest(item)" text="You requested this — someone else must approve it.">
                  <template #activator="{ props: tooltipProps }">
                    <span v-bind="tooltipProps">
                      <v-btn size="small" color="success" variant="tonal" disabled>Approve</v-btn>
                    </span>
                  </template>
                </v-tooltip>
                <v-btn
                  v-else
                  size="small"
                  color="success"
                  variant="tonal"
                  :loading="loading"
                  @click="approve(item.id)"
                >
                  Approve
                </v-btn>
                <v-btn
                  size="small"
                  color="error"
                  variant="tonal"
                  :disabled="isOwnRequest(item)"
                  @click="openRejectDialog(item.id)"
                >
                  Reject
                </v-btn>
              </template>
            </div>
          </template>
        </v-data-table>
      </v-card>

    </div>

    <!-- Request replenishment dialog -->
    <v-dialog v-model="showRequestDialog" max-width="520" persistent>
      <v-card rounded="lg">
        <v-card-title class="pa-4 pa-sm-5 pb-3 text-h6 font-weight-bold">Request Petty Cash Replenishment</v-card-title>
        <v-divider />
        <v-card-text class="pa-4 pa-sm-5">
          <label class="field-label">Funding Bank Account <span class="text-error">*</span></label>
          <v-select
            v-model="fundingAccountId"
            :items="bankAccounts"
            item-title="name"
            item-value="id"
            placeholder="Select bank account"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
          />

          <label class="field-label">
            Liquidation Report — how the previous float was spent
          </label>
          <v-sheet rounded="lg" border class="mb-3" style="max-height: 220px; overflow-y: auto">
            <div v-if="requestPreviewLoading" class="pa-4 text-center text-medium-emphasis text-caption">
              Loading...
            </div>
            <div v-else-if="!requestPreview.length" class="pa-4 text-center text-medium-emphasis text-caption">
              No expenses recorded against Petty Cash yet.
            </div>
            <v-table v-else density="compact">
              <thead>
                <tr>
                  <th class="text-left">Particulars</th>
                  <th class="text-left">OR/SI No.</th>
                  <th class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in requestPreview" :key="idx">
                  <td class="text-left">{{ row.paid_to || '—' }}</td>
                  <td class="text-left">{{ row.or_si_no || '—' }}</td>
                  <td class="text-right">{{ formatCurrency(row.amount) }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-sheet>
          <div class="d-flex justify-space-between text-caption font-weight-bold mb-3">
            <span>Total to be requested</span>
            <span>{{ formatCurrency(requestPreviewTotal) }}</span>
          </div>

          <label class="field-label">Remarks</label>
          <v-textarea
            v-model="remarks"
            placeholder="Optional — explain if requesting before the fund is fully depleted"
            variant="outlined"
            density="compact"
            rows="2"
            hide-details
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
          <v-btn variant="outlined" class="text-none" @click="showRequestDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            class="text-none font-weight-bold"
            elevation="0"
            :loading="loading"
            :disabled="!canSubmitRequest"
            @click="submitRequest"
          >
            Submit Request
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- View liquidation report dialog (already-submitted requests) -->
    <v-dialog v-model="showReportDialog" max-width="520">
      <v-card rounded="lg">
        <v-card-title class="pa-4 pa-sm-5 pb-3 text-h6 font-weight-bold">Liquidation Report</v-card-title>
        <v-divider />
        <v-card-text class="pa-4 pa-sm-5">
          <div v-if="!reportItems.length" class="pa-4 text-center text-medium-emphasis text-caption">
            No expense lines attached to this request.
          </div>
          <v-table v-else density="compact">
            <thead>
              <tr>
                <th class="text-left">Particulars</th>
                <th class="text-left">OR/SI No.</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in reportItems" :key="idx">
                <td class="text-left">{{ row.paid_to || '—' }}</td>
                <td class="text-left">{{ row.or_si_no || '—' }}</td>
                <td class="text-right">{{ formatCurrency(row.amount) }}</td>
              </tr>
            </tbody>
          </v-table>
          <div class="d-flex justify-space-between text-caption font-weight-bold mt-3">
            <span>Total</span>
            <span>{{ formatCurrency(reportTotal) }}</span>
          </div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
          <v-btn variant="outlined" class="text-none" @click="showReportDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Reject dialog -->
    <v-dialog v-model="showRejectDialog" max-width="400" persistent>
      <v-card rounded="lg">
        <v-card-title class="text-h6 pa-6">
          <v-icon icon="mdi-alert-circle" color="warning" class="mr-3" />
          Reject Request
        </v-card-title>
        <v-card-text class="pa-6 pt-0">
          <label class="field-label">Reason</label>
          <v-textarea
            v-model="rejectReason"
            placeholder="Why is this request being rejected?"
            variant="outlined"
            density="compact"
            rows="2"
            hide-details
          />
        </v-card-text>
        <v-card-actions class="pa-6 pt-0">
          <v-spacer />
          <v-btn variant="outlined" :disabled="loading" @click="showRejectDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="loading" @click="confirmReject">Reject</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </v-container>
</template>

<style scoped>
.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #424242;
  margin-bottom: 4px;
}
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
:deep(.v-data-table td:has(.font-weight-medium)) {
  text-align: right !important;
}
</style>
