<script setup lang="ts">
import { computed, watch } from 'vue'
import { formatCurrency, formatDate } from '@/utils/helpers'
import { chequeLabel, collectionMethodLabel, collectionPaymentMethodOptions } from '@/utils/paymentMethods'
import type { ARReceivableDetail, ARReceivablePayment } from '@/stores/financeData'
import { financePageSizes, financeDefaultPageSize } from '../../composables/financeTable'
import { arSourceDocument } from '../../composables/useAccountsReceivable'
import ChangeRequestDialog from '@/components/changeRequests/dialogs/ChangeRequestDialog.vue'
import { useChangeRequestFiling } from '@/composables/useChangeRequestFiling'
import { useChangeRequestsDataStore } from '@/stores/changeRequestsData'

const props = defineProps<{
  modelValue: boolean
  loading: boolean
  detail: ARReceivableDetail | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** A POS charge: its payments are recorded here, at the office. */
  (e: 'recordPayment'): void
  /** A change request was filed — the receivable's status moved. */
  (e: 'changed'): void
  /** Ask for a credit memo (an allowance) on this bill. */
  (e: 'issueCreditMemo'): void
}>()

// A payment on a POS charge is corrected or voided through an executive-
// approved change request, the same as an Ethical or In-House payment. The
// Ethical and In-House ones are filed from their order screens; a POS charge
// has no order screen, so here.
const { showDialog: crDialog, config: crConfig, isPending: crPending, loadPending: crLoad, open: crOpen, submit: crSubmit, submitting: crSubmitting } =
  useChangeRequestFiling(useChangeRequestsDataStore())
const isCharge = computed(() => props.detail?.source === 'sale')
watch(() => props.detail?.id, () => { if (isCharge.value) void crLoad() }, { immediate: true })
// While a request is pending the sale is gated, so no further payment either.
const changePending = computed(() => props.detail?.status === 'change_request')

function requestPaymentChange(p: ARReceivablePayment) {
  const d = props.detail
  if (!d) return
  crOpen({
    // The SALE's id — change_requests.transaction_id is FK'd to transactions;
    // which payment it is travels in meta (__collection_id).
    id: d.id,
    ref: d.reference_no ?? null,
    fields: [
      { key: 'amount', label: 'Amount', value: p.amount, type: 'number' },
      { key: 'payment_method', label: 'Payment Method', value: p.payment_method, type: 'select', items: collectionPaymentMethodOptions },
      { key: 'reference_no', label: 'Reference / OR #', value: p.reference_no, type: 'text' },
      { key: 'cheque_bank', label: 'Cheque bank', value: p.cheque_bank, type: 'text' },
      { key: 'cheque_no', label: 'Cheque no.', value: p.cheque_no, type: 'text' },
      { key: 'cheque_date', label: 'Cheque date', value: p.cheque_date, type: 'date' },
      { key: 'remarks', label: 'Payment note', value: p.remarks, type: 'text' },
    ],
    voidSummary: `Void this ${formatCurrency(p.amount)} payment on ${d.reference_no ?? 'the sale'} — reverses it in the ledger and puts it back on what the customer owes.`,
    allowEdit: true,
    allowVoid: true,
    meta: { __collection_id: { from: p.id, to: p.id } },
  })
}

async function submitChange(payload: Parameters<typeof crSubmit>[0]) {
  await crSubmit(payload)
  if (!crDialog.value) emit('changed')
}

const lineHeaders = [
  { title: 'PRODUCT', key: 'product_name', sortable: false, align: 'start' as const },
  { title: 'QTY', key: 'qty', sortable: false, align: 'center' as const },
  { title: 'UNIT PRICE', key: 'unit_price', sortable: false, align: 'end' as const },
  { title: 'LINE TOTAL', key: 'line_total', sortable: false, align: 'end' as const },
]

const basePaymentHeaders = [
  { title: 'DATE', key: 'date', sortable: false, align: 'start' as const },
  { title: 'METHOD', key: 'payment_method', sortable: false, align: 'center' as const },
  { title: 'REFERENCE #', key: 'reference_no', sortable: false, align: 'center' as const },
  { title: 'AMOUNT', key: 'amount', sortable: false, align: 'end' as const },
]
const paymentHeaders = computed(() => isCharge.value
  ? [...basePaymentHeaders, { title: '', key: 'actions', sortable: false, align: 'end' as const }]
  : basePaymentHeaders)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="720"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3 d-flex align-center ga-3">
        <div class="flex-grow-1">
          <div class="text-h6 font-weight-bold">
            {{ detail?.reference_no ?? 'Receivable' }}
          </div>
          <div class="text-caption text-medium-emphasis">
            {{ detail ? arSourceDocument[detail.source] : '' }}
            <template v-if="detail?.customer_name"> · {{ detail.customer_name }}</template>
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <div v-if="loading" class="pa-6 text-center text-caption text-medium-emphasis">
          Loading receivable...
        </div>
        <div v-else-if="!detail" class="pa-6 text-center text-caption text-medium-emphasis">
          Receivable not found.
        </div>

        <template v-else>
          <!-- Header / trace-back -->
          <div class="detail-grid mb-4">
            <div>
              <div class="field-label">Status</div>
              <v-chip size="small" variant="tonal" class="text-capitalize">{{ detail.status ?? '—' }}</v-chip>
            </div>
            <div>
              <div class="field-label">Invoice Date</div>
              <div class="text-body-2">{{ formatDate(detail.invoice_date ?? undefined) }}</div>
            </div>
            <div v-if="detail.source === 'inhouse_order'">
              <div class="field-label">Company PO</div>
              <div class="text-body-2">{{ detail.po_no ?? '—' }}</div>
            </div>
            <div v-if="detail.source === 'inhouse_order'">
              <div class="field-label">Government PR #</div>
              <div class="text-body-2">{{ detail.govt_po_no ?? '—' }}</div>
            </div>
            <div v-if="detail.source !== 'inhouse_order'">
              <div class="field-label">Terms</div>
              <div class="text-body-2">{{ detail.terms_days != null ? `Net ${detail.terms_days} days` : '—' }}</div>
            </div>
            <div v-if="detail.source !== 'inhouse_order'">
              <div class="field-label">Due Date</div>
              <div class="text-body-2">{{ detail.due_date ? formatDate(detail.due_date) : '—' }}</div>
            </div>
          </div>

          <!-- Line items -->
          <div class="section-label mb-1">Line Items</div>
          <v-data-table
            :items-per-page-options="financePageSizes"
            mobile-breakpoint="md"
            :headers="lineHeaders"
            :items="detail.lines"
            :hide-default-footer="detail.lines.length <= financeDefaultPageSize"
            density="compact"
            class="mb-4 bordered-table"
          >
            <template #item.qty="{ item }">{{ item.qty }}<span v-if="item.unit" class="text-medium-emphasis"> {{ item.unit }}</span></template>
            <template #item.unit_price="{ item }">{{ formatCurrency(item.unit_price) }}</template>
            <template #item.line_total="{ item }">{{ formatCurrency(item.line_total) }}</template>
            <template #no-data>
              <div class="pa-3 text-caption text-medium-emphasis">No line items.</div>
            </template>
          </v-data-table>

          <!-- Payment history -->
          <div class="section-label mb-1">Payment History</div>
          <v-data-table
            :items-per-page-options="financePageSizes"
            mobile-breakpoint="md"
            :headers="paymentHeaders"
            :items="detail.payments"
            :hide-default-footer="detail.payments.length <= financeDefaultPageSize"
            density="compact"
            class="mb-4 bordered-table"
          >
            <template #item.date="{ item }">{{ formatDate(item.date) }}</template>
            <template #item.payment_method="{ item }">
              {{ collectionMethodLabel(item.payment_method) }}
              <div v-if="chequeLabel(item)" class="text-caption text-medium-emphasis">{{ chequeLabel(item) }}</div>
              <div v-if="item.remarks" class="text-caption text-medium-emphasis">{{ item.remarks }}</div>
            </template>
            <template #item.actions="{ item }">
              <v-chip v-if="crPending(item.id)" size="x-small" color="warning" variant="tonal" label>change pending</v-chip>
              <v-btn
                v-else
                size="small"
                variant="tonal"
                color="primary"
                class="text-none"
                prepend-icon="mdi-pencil-box-outline"
                title="Request a correction or void of this payment (needs executive approval)"
                @click="requestPaymentChange(item)"
              >
                Request Change
              </v-btn>
            </template>
            <template #item.reference_no="{ item }">{{ item.reference_no ?? '—' }}</template>
            <template #item.amount="{ item }">{{ formatCurrency(item.amount) }}</template>
            <template #no-data>
              <div class="pa-3 text-caption text-medium-emphasis">No payments recorded yet.</div>
            </template>
          </v-data-table>

          <!-- Summary -->
          <v-divider class="mb-3" />
          <div class="summary-row">
            <span class="text-medium-emphasis">Total</span>
            <span class="font-weight-medium">{{ formatCurrency(detail.total_amount) }}</span>
          </div>
          <div class="summary-row">
            <span class="text-medium-emphasis">Paid</span>
            <span class="font-weight-medium">{{ formatCurrency(detail.amount_paid) }}</span>
          </div>
          <div class="summary-row text-h6 font-weight-bold">
            <span>Outstanding Balance</span>
            <span :class="detail.balance > 0.01 ? 'text-error' : 'text-success'">{{ formatCurrency(detail.balance) }}</span>
          </div>
        </template>
      </v-card-text>

      <v-divider />
      <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
        <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">Close</v-btn>
        <v-btn
          v-if="detail && detail.balance > 0.01 && !changePending"
          variant="tonal"
          class="text-none"
          prepend-icon="mdi-file-document-minus-outline"
          @click="emit('issueCreditMemo')"
        >
          Issue Credit Memo
        </v-btn>
        <span v-if="isCharge && changePending" class="text-caption text-warning mr-auto">
          A change request is pending — payments resume once it is decided.
        </span>
        <v-btn
          v-if="detail?.source === 'sale' && detail.balance > 0.01"
          color="primary"
          variant="flat"
          class="text-none font-weight-bold"
          prepend-icon="mdi-cash-plus"
          :disabled="changePending"
          @click="emit('recordPayment')"
        >
          Record payment
        </v-btn>
      </v-card-actions>
    </v-card>

    <ChangeRequestDialog
      v-if="crConfig"
      v-model="crDialog"
      :target-ref="crConfig.ref"
      :fields="crConfig.fields"
      :allow-edit="crConfig.allowEdit"
      :allow-void="crConfig.allowVoid"
      :void-summary="crConfig.voidSummary"
      :loading="crSubmitting"
      @submit="submitChange"
    />
  </v-dialog>
</template>

<style scoped>
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px 20px;
}
.field-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #9e9e9e;
  text-transform: uppercase;
  margin-bottom: 2px;
}
.section-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #424242;
}
.bordered-table {
  border: 1px solid #eeeeee;
  border-radius: 8px;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
}
</style>
