<script setup lang="ts">
import { onMounted } from 'vue'
import { useRebatePayouts } from '../composables/useRebatePayouts'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const {
  rows, loading, searchText, statusFilter, headers,
  paymentMethodOptions, statusFilterOptions, cashAccountOptions, statusMeta,
  pendingCount, pendingTotal, approvedTotal,
  showPayDialog, payingOrder, payMethod, payReference, payPaidTo, payCashAccountId,
  showRejectDialog, rejectReason,
  init, approve, openReject, cancelReject, confirmReject, openPay, cancelPay, confirmPay,
} = useRebatePayouts()

onMounted(() => init())

const notSet = (field: string) => `No ${field} set`
</script>

<template>
  <v-container fluid class="pa-2 pa-sm-4 fill-height align-start">
    <div class="mx-auto w-100">
      <v-card class="elevation-0" rounded="lg">
        <!-- Header -->
        <v-card-title class="pa-4 pa-sm-5 d-flex align-center ga-2">
          <v-icon icon="mdi-cash-refund" color="primary" />
          <span class="text-h6 font-weight-bold">Rebate Payouts</span>
        </v-card-title>
        <v-divider />

        <v-card-text class="pa-4 pa-sm-5">
          <div class="text-caption text-medium-emphasis mb-4">
            A rebate becomes due once its order is paid in full. Every rebate needs approval
            before cash goes out. Record who received it — it's the only support for the expense.
          </div>

          <!-- Summary cards -->
          <v-row dense class="mb-4">
            <v-col cols="12" sm="6" md="4">
              <v-card
                variant="tonal" color="warning" rounded="lg"
                class="pa-4 d-flex flex-column justify-space-between"
                style="height: 100%; min-height: 120px;"
              >
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon icon="mdi-clock-alert-outline" size="20" />
                  <span class="text-body-2 font-weight-medium">Pending Approval</span>
                </div>
                <div>
                  <div class="text-h5 font-weight-bold">{{ pendingCount }}</div>
                  <div class="text-body-2 text-medium-emphasis mt-1">{{ formatCurrency(pendingTotal) }}</div>
                </div>
              </v-card>
            </v-col>
            <v-col cols="12" sm="6" md="4">
              <v-card
                variant="tonal" color="info" rounded="lg"
                class="pa-4 d-flex flex-column justify-space-between"
                style="height: 100%; min-height: 120px;"
              >
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon icon="mdi-check-decagram-outline" size="20" />
                  <span class="text-body-2 font-weight-medium">Approved — awaiting payout</span>
                </div>
                <div>
                  <div class="text-h5 font-weight-bold">{{ formatCurrency(approvedTotal) }}</div>
                  <div class="text-body-2 text-medium-emphasis mt-1">Ready to disburse</div>
                </div>
              </v-card>
            </v-col>
          </v-row>

          <!-- Filters -->
          <div
            class="d-flex ga-2 mb-4"
            :class="mobile ? 'flex-column align-stretch' : 'flex-wrap'"
          >
            <v-text-field
              v-model="searchText"
              density="compact" variant="outlined" hide-details
              :placeholder="mobile ? 'Search rebates' : 'Search order, customer, MSR...'"
              prepend-inner-icon="mdi-magnify"
              :style="mobile ? undefined : 'max-width: 320px'" min-width="240"
              clearable
            />
            <v-select
              v-model="statusFilter"
              :items="statusFilterOptions"
              item-title="title"
              item-value="value"
              density="compact" variant="outlined" hide-details
              :style="mobile ? undefined : 'max-width: 240px'"
            />
          </div>

          <v-progress-linear v-if="loading" indeterminate color="primary" />

          <!-- Empty state (shared by both layouts) -->
          <div
            v-if="!loading && rows.length === 0"
            class="d-flex flex-column align-center py-10 text-medium-emphasis"
          >
            <v-icon icon="mdi-cash-refund" size="40" class="mb-2" />
            <span class="text-body-2">
              {{ searchText || statusFilter !== 'all' ? 'No rebates match your filters' : 'No rebate payouts yet' }}
            </span>
          </div>

          <!-- MOBILE: stacked cards -->
          <template v-else-if="mobile">
            <v-card
              v-for="item in rows" :key="item.id"
              variant="outlined" rounded="lg" class="mb-2 pa-3"
            >
              <div class="d-flex align-start ga-3">
                <v-avatar size="36" color="primary" variant="tonal">
                  <span class="text-body-2 font-weight-bold">
                    {{ (item.customer_name || '?').charAt(0).toUpperCase() }}
                  </span>
                </v-avatar>

                <div class="flex-grow-1" style="min-width: 0">
                  <div class="d-flex align-center justify-space-between ga-2">
                    <span class="font-weight-medium text-body-2 text-truncate">
                      {{ item.order_no }}
                    </span>
                    <v-chip
                      :color="statusMeta(item.rebate_status).color"
                      size="x-small" variant="tonal" label
                    >
                      {{ statusMeta(item.rebate_status).label }}
                    </v-chip>
                  </div>

                  <div class="text-caption text-medium-emphasis mt-2">
                    <div class="d-flex align-center ga-1">
                      <v-icon size="12" icon="mdi-account-outline" />
                      <span :class="{ 'font-italic': !item.customer_name || item.customer_name === '—' }">
                        {{ item.customer_name || notSet('customer') }}
                      </span>
                    </div>
                    <div class="d-flex align-center ga-1 mt-1">
                      <v-icon size="12" icon="mdi-account-tie-outline" />
                      <span :class="{ 'font-italic': !item.agent_name || item.agent_name === '—' }">
                        {{ item.agent_name || notSet('MSR') }}
                      </span>
                    </div>
                    <div class="d-flex justify-space-between mt-2">
                      <span>Invoice Total</span>
                      <span>{{ formatCurrency(item.total_amount ?? 0) }}</span>
                    </div>
                    <div class="d-flex justify-space-between mt-1">
                      <span class="font-weight-bold">Rebate</span>
                      <span class="font-weight-bold">{{ formatCurrency(item.rebate_amount ?? 0) }}</span>
                    </div>
                    <div v-if="item.paid_at" class="d-flex justify-space-between mt-1">
                      <span>Paid In Full</span>
                      <span>{{ formatDatePR_ISO(item.paid_at) }}</span>
                    </div>
                  </div>

                  <div class="d-flex flex-wrap ga-2 mt-2">
                    <template v-if="item.rebate_status === 'pending_approval'">
                      <v-btn
                        size="small" variant="flat" color="success" class="text-none"
                        @click="approve(item.id)"
                      >
                        Approve
                      </v-btn>
                      <v-btn
                        size="small" variant="outlined" color="error" class="text-none"
                        @click="openReject(item.id)"
                      >
                        Reject
                      </v-btn>
                    </template>
                    <v-btn
                      v-else-if="item.rebate_status === 'approved'"
                      size="small" variant="flat" color="primary" class="text-none font-weight-bold"
                      :block="mobile"
                      @click="openPay(item.id)"
                    >
                      Record Payout
                    </v-btn>
                  </div>
                </div>
              </div>
            </v-card>
          </template>

          <!-- DESKTOP: data table -->
          <v-data-table
            v-else
            :headers="headers"
            :items="rows"
            :loading="loading"
            class="rebate-table"
          >
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
      <v-dialog
        v-model="showPayDialog"
        :fullscreen="mobile"
        :max-width="mobile ? undefined : 560"
        :transition="mobile ? 'dialog-bottom-transition' : undefined"
        persistent
      >
        <v-card v-if="payingOrder" :rounded="mobile ? '0' : 'lg'">
          <v-toolbar v-if="mobile" color="surface" density="comfortable">
            <v-btn icon="mdi-close" @click="cancelPay" />
            <v-toolbar-title class="text-body-1 font-weight-bold">Record Rebate Payout</v-toolbar-title>
            <v-btn
              variant="flat" color="primary" class="text-none mr-2"
              :loading="loading" @click="confirmPay"
            >
              Record
            </v-btn>
          </v-toolbar>

          <v-card-title v-else class="pa-4 pa-sm-5 d-flex align-center ga-2">
            <v-icon icon="mdi-cash-refund" color="primary" />
            <span class="text-h6 font-weight-bold">Record Rebate Payout</span>
          </v-card-title>
          <v-divider />

          <v-card-text class="pa-4 pa-sm-5">
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

          <template v-if="!mobile">
            <v-divider />
            <v-card-actions>
              <v-spacer />
              <v-btn class="text-none" @click="cancelPay">Cancel</v-btn>
              <v-btn color="primary" class="text-none font-weight-bold" elevation="0" :loading="loading" @click="confirmPay">
                Record Payout
              </v-btn>
            </v-card-actions>
          </template>
        </v-card>
      </v-dialog>

      <!-- Reject -->
      <v-dialog
        v-model="showRejectDialog"
        :fullscreen="mobile"
        :max-width="mobile ? undefined : 480"
        :transition="mobile ? 'dialog-bottom-transition' : undefined"
        persistent
      >
        <v-card :rounded="mobile ? '0' : 'lg'">
          <v-toolbar v-if="mobile" color="surface" density="comfortable">
            <v-btn icon="mdi-close" @click="cancelReject" />
            <v-toolbar-title class="text-body-1 font-weight-bold">Reject Rebate</v-toolbar-title>
            <v-btn
              variant="flat" color="error" class="text-none mr-2"
              :loading="loading" @click="confirmReject"
            >
              Reject
            </v-btn>
          </v-toolbar>

          <v-card-title v-else class="pa-4 pa-sm-5 d-flex align-center ga-2">
            <v-icon icon="mdi-cash-remove" color="error" />
            <span class="text-h6 font-weight-bold">Reject Rebate</span>
          </v-card-title>
          <v-divider />

          <v-card-text class="pa-4 pa-sm-5">
            <div class="text-caption text-medium-emphasis mb-2">
              Rejecting reverses the accrued rebate expense in the General Ledger.
            </div>
            <v-textarea v-model="rejectReason" label="Reason" rows="3" auto-grow />
          </v-card-text>

          <template v-if="!mobile">
            <v-divider />
            <v-card-actions>
              <v-spacer />
              <v-btn class="text-none" @click="cancelReject">Cancel</v-btn>
              <v-btn color="error" class="text-none font-weight-bold" elevation="0" :loading="loading" @click="confirmReject">
                Reject
              </v-btn>
            </v-card-actions>
          </template>
        </v-card>
      </v-dialog>
    </div>
  </v-container>
</template>

<style scoped>
.rebate-table :deep(tbody tr:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>