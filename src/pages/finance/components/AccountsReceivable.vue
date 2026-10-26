<script setup lang="ts">
import { ref } from 'vue'
import { useAccountsReceivable, arHeaders, arSourceLabel } from '../composables/useAccountsReceivable'
import type { ARAgingRow } from '@/stores/financeData'
import { formatCurrency } from '@/utils/helpers'
import ARDetailDialog from './dialogs/ARDetailDialog.vue'
import RecordChargePaymentDialog from './dialogs/RecordChargePaymentDialog.vue'
import SOADialog from './dialogs/SOADialog.vue'
import ConsignmentDialog from './dialogs/ConsignmentDialog.vue'
import CreditMemoRequestDialog from './dialogs/CreditMemoRequestDialog.vue'
import CreditMemosDialog from './dialogs/CreditMemosDialog.vue'
import type { CreditMemoTarget } from '../composables/useCreditMemos'
import { financePageSizes, financeDefaultPageSize } from '../composables/financeTable'

const {
  loading,
  totalReceivable,
  termTotals,
  overdueReceivable,
  customerJackets,
  consignmentReceivable,
  consignmentCollectors,
  showConsignment,
  openConsignment,
  detailOpen,
  detailLoading,
  selectedDetail,
  openDetail,
  refreshDetail,
  paymentOpen, payAmount, payMethod, payReference, payRemarks, payCashAccountId, paying,
  payChequeBank, payChequeNo, payChequeDate,
  cashAccountOptions, canRecordPayment, openPayment, confirmPayment,
  soaOpen,
  soaLoading,
  soaData,
  openSOA,
} = useAccountsReceivable()

/**
 * What the customer's open items are, when they are all one kind — the hint a
 * customer with no department needs for its statement (fetchStatementOfAccount).
 */
function jacketSource(rows: ARAgingRow[]) {
  const first = rows[0]?.source
  return first && rows.every((r) => r.source === first) ? first : undefined
}

// v-data-table @click:row passes (pointerEvent, { item }); typing lives here in
// <script> because an inline type annotation in the template is a parse error.
function onRowClick(_event: unknown, { item }: { item: ARAgingRow }) {
  openDetail(item)
}

/** A consignment customer's statement, opened from the collector list. */
function openConsignmentSOA(customerIds: number[]) {
  const jacket = customerJackets.value.find((j) => j.customerIds.some((id) => customerIds.includes(id)))
  openSOA(customerIds, jacket ? jacketSource(jacket.rows) : undefined)
}

// Credit memos: asking for one on the open bill, and the register.
const showCreditMemoRequest = ref(false)
const creditMemoTarget = ref<CreditMemoTarget | null>(null)
const showCreditMemos = ref(false)

function openCreditMemoRequest() {
  const d = selectedDetail.value
  if (!d) return
  creditMemoTarget.value = { source: d.source, id: d.id, reference_no: d.reference_no, customer_name: d.customer_name, balance: d.balance }
  showCreditMemoRequest.value = true
}

function deliveredAgo(days: number | null): string {
  if (days == null) return 'Consignment'
  return `Consignment · ${days} day${days === 1 ? '' : 's'} out`
}

const termColor: Record<string, string> = {
  // Explicit green: the theme's 'success' is a shade of the brand red.
  current: 'green-darken-1',
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
            <div class="text-h5 font-weight-bold text-error">
              {{ formatCurrency(overdueReceivable) }}
            </div>
            <div class="text-caption text-medium-emphasis">
              Past due date (1-30 through over 6 months)
            </div>
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
              <div>
                <div class="text-caption text-medium-emphasis">Consignment</div>
                <div class="text-body-1 font-weight-bold text-blue-grey">{{ formatCurrency(consignmentReceivable) }}</div>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- AR ledger, grouped into per-customer jackets -->
      <v-card rounded="lg" elevation="1">
        <v-card-title class="pa-4 pa-sm-5 d-flex flex-wrap align-center ga-2">
          <span class="text-h6 font-weight-bold">Accounts Receivable</span>
          <v-spacer />
          <v-btn
            variant="tonal"
            size="small"
            class="text-none"
            prepend-icon="mdi-file-document-minus-outline"
            @click="showCreditMemos = true"
          >
            Credit memos
          </v-btn>
          <v-btn
            variant="tonal"
            size="small"
            class="text-none"
            prepend-icon="mdi-truck-delivery-outline"
            @click="openConsignment"
          >
            Consignment ({{ consignmentCollectors.length }})
          </v-btn>
        </v-card-title>
        <v-divider />

        <div v-if="loading" class="pa-6 text-center text-caption text-medium-emphasis">
          Loading accounts receivable...
        </div>
        <div
          v-else-if="!customerJackets.length"
          class="pa-6 text-center text-caption text-medium-emphasis"
        >
          No outstanding receivables.
        </div>

        <v-expansion-panels v-else variant="accordion" multiple>
          <v-expansion-panel v-for="jacket in customerJackets" :key="jacket.key">
            <v-expansion-panel-title>
              <div class="d-flex align-center ga-3 flex-grow-1 pr-3">
                <span class="font-weight-medium">{{ jacket.customerName }}</span>
                <v-chip size="small" variant="tonal"
                  >{{ jacket.docCount }} open doc{{ jacket.docCount === 1 ? '' : 's' }}</v-chip
                >
                <v-tooltip
                  v-if="jacket.customerIds.length > 1"
                  :text="`Filed together: this customer has ${jacket.customerIds.length} records in the customer list (duplicates). The statement covers all of them.`"
                >
                  <template #activator="{ props: tip }">
                    <v-chip v-bind="tip" size="small" variant="outlined" prepend-icon="mdi-account-multiple-outline">
                      {{ jacket.customerIds.length }} records
                    </v-chip>
                  </template>
                </v-tooltip>
                <v-btn
                  v-if="jacket.customerIds.length"
                  size="small"
                  variant="text"
                  color="primary"
                  class="text-none"
                  prepend-icon="mdi-file-document-outline"
                  @click.stop="openSOA(jacket.customerIds, jacketSource(jacket.rows))"
                >
                  View SOA
                </v-btn>
                <v-spacer />
                <v-chip v-if="jacket.consignment" size="small" variant="tonal" color="blue-grey">Consignment</v-chip>
                <v-chip v-else size="small" variant="tonal" :color="termColor[jacket.worstTerm]">
                  {{ termLabels[jacket.worstTerm] }}
                </v-chip>
                <span class="font-weight-bold">{{ formatCurrency(jacket.totalBalance) }}</span>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text class="pa-0">
              <v-data-table
                :items-per-page-options="financePageSizes"
                mobile-breakpoint="md"
                :headers="arHeaders"
                :items="jacket.rows"
                :hide-default-footer="jacket.rows.length <= financeDefaultPageSize"
                hover
                @click:row="onRowClick"
              >
                <template #item.source="{ item }">
                  <v-chip size="small" variant="tonal">{{ arSourceLabel[item.source] }}</v-chip>
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
                  <v-chip v-if="item.consignment" size="small" variant="tonal" color="blue-grey">
                    {{ deliveredAgo(item.days_since_delivery) }}
                  </v-chip>
                  <v-chip v-else size="small" variant="tonal" :color="termColor[item.term]">
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
        @record-payment="openPayment"
        @changed="refreshDetail"
        @issue-credit-memo="openCreditMemoRequest"
      />

      <CreditMemoRequestDialog v-model="showCreditMemoRequest" :target="creditMemoTarget" @sent="showCreditMemos = true" />
      <CreditMemosDialog v-model="showCreditMemos" />

      <RecordChargePaymentDialog
        v-model="paymentOpen"
        v-model:amount="payAmount"
        v-model:method="payMethod"
        v-model:reference="payReference"
        v-model:remarks="payRemarks"
        v-model:cash-account-id="payCashAccountId"
        v-model:cheque-bank="payChequeBank"
        v-model:cheque-no="payChequeNo"
        v-model:cheque-date="payChequeDate"
        :sale-no="selectedDetail?.reference_no ?? null"
        :customer-name="selectedDetail?.customer_name ?? null"
        :balance="selectedDetail?.balance ?? 0"
        :cash-account-options="cashAccountOptions"
        :can-confirm="canRecordPayment"
        :loading="paying"
        @confirm="confirmPayment"
      />

      <SOADialog v-model="soaOpen" :loading="soaLoading" :soa="soaData" />

      <ConsignmentDialog
        v-model="showConsignment"
        :collectors="consignmentCollectors"
        @view-soa="openConsignmentSOA"
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
