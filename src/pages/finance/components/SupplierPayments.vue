<script setup lang="ts">
import { onMounted } from 'vue'
import {
  useSupplierPayments, apHeaders, agingHeaders, paymentHistoryHeaders, bucketColor,
} from '../composables/useSupplierPayments'
import { apAgeBuckets } from '@/stores/financeData'
import ChangeRequestDialog from '@/components/changeRequests/dialogs/ChangeRequestDialog.vue'
import { useChangeRequestFiling } from '@/composables/useChangeRequestFiling'
import { useFinanceChangeRequestStore } from '../stores/financeChangeRequest'
import { expensePaymentMethods, type SupplierPaymentType } from '@/stores/financeData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import { financePageSizes } from '../composables/financeTable'

const {
  loading,
  bucketTotals, totalOutstanding, oldestDays,
  selectedInvoiceIds, selectedInvoices, selectedTotal, selectionProblem,
  search, dateFrom, dateTo, dateRangeError, isFiltering, clearDates,
  filteredAging, filteredAP, filteredPayments, agingMatched, paymentsMatched,
  dvNoOf, poNumbersOf,
  openVouchersOf, describeOpenVouchers,
  pendingPayment, pendingSupplierName, pendingVouchersText, confirmPendingPayment, cancelPendingPayment,
  init, goToVouchers, payInvoices, paySupplier, openInvoicesOf, paySelected, clearSelection,
} = useSupplierPayments()

// Edit/undo requests on a recorded supplier payment (executive-approved).
const { showDialog, config, isPending, isEdited, editTooltip, loadPending, open, submit, submitting } =
  useChangeRequestFiling(useFinanceChangeRequestStore())

function openChange(p: SupplierPaymentType) {
  open({
    id: p.id,
    ref: p.reference_no,
    fields: [
      { key: 'amount', label: 'Amount', value: p.amount ?? 0, type: 'number' },
      { key: 'payment_method', label: 'Payment Method', value: p.payment_method, type: 'select', items: expensePaymentMethods.map((m) => ({ title: m.title, value: m.value })) },
      { key: 'remarks', label: 'Remarks', value: p.remarks, type: 'text' },
    ],
    voidSummary: `Void ${p.reference_no ?? `payment #${p.id}`} — reverses its ledger entry (DR Accounts Payable / CR cash) and restores ${formatCurrency(p.amount ?? 0)} to ${p.supplier_name ?? 'the supplier'}'s payable balance.`,
    allowEdit: true,
    allowVoid: true,
  })
}

onMounted(async () => { await init(); await loadPending() })
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <div class="mx-auto w-100">

      <!-- One search and date range for the whole page, the same as
           Disbursement Vouchers. Dates are each invoice's / payment's own;
           the AP-by-supplier balances have no date, so only the search
           narrows them. -->
      <v-card rounded="lg" elevation="1" class="mb-3">
        <div class="px-4 px-sm-5 py-3 d-flex align-center ga-3 flex-wrap">
          <v-text-field
            v-model="search"
            placeholder="Search invoice, PO, DV no., supplier, amount…"
            prepend-inner-icon="mdi-magnify"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            style="max-width: 440px; min-width: 260px"
          />
          <v-text-field
            v-model="dateFrom"
            type="date"
            label="From"
            :max="dateTo || undefined"
            density="compact"
            variant="outlined"
            :error-messages="dateRangeError || undefined"
            :hide-details="!dateRangeError"
            clearable
            style="max-width: 200px; min-width: 170px"
          />
          <v-text-field
            v-model="dateTo"
            type="date"
            label="To"
            :min="dateFrom || undefined"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            style="max-width: 200px; min-width: 170px"
          />
          <v-btn v-if="dateFrom || dateTo" variant="text" size="small" class="text-none" @click="clearDates">
            All dates
          </v-btn>
        </div>
      </v-card>

      <!-- Payments are raised as disbursement vouchers, so the page says where
           to go rather than leaving the reader hunting for a missing button. -->
      <v-card rounded="lg" elevation="1" class="mb-3">
        <v-card-title class="pa-4 pa-sm-5 d-flex align-center ga-2 flex-wrap">
          <span class="text-h6 font-weight-bold">Supplier Aging</span>
          <v-chip v-if="oldestDays" :color="oldestDays > 90 ? 'error' : 'warning'" size="small" label>
            Oldest {{ oldestDays }} days
          </v-chip>
          <v-spacer />
          <v-btn color="primary" variant="tonal" size="small" class="text-none" @click="goToVouchers">
            Pay via Disbursement Voucher
          </v-btn>
        </v-card-title>
        <v-divider />

        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-3">
            This page monitors what is owed. Payments are recorded as disbursement
            vouchers — press <strong>Pay</strong> on an invoice (or tick several from
            one supplier) and the voucher opens already filled in. Recording it
            settles the balance here.
          </p>

          <!-- Bucket strip -->
          <div class="d-flex flex-wrap ga-2 mb-4">
            <v-sheet
              v-for="bucket in apAgeBuckets" :key="bucket"
              rounded="lg" border class="pa-3 flex-grow-1" style="min-width: 130px"
            >
              <div class="text-caption text-medium-emphasis">{{ bucket }} days</div>
              <div class="text-subtitle-1 font-weight-bold" :class="`text-${bucketColor[bucket]}`">
                {{ formatCurrency(bucketTotals[bucket]) }}
              </div>
            </v-sheet>
            <v-sheet rounded="lg" border class="pa-3 flex-grow-1" style="min-width: 130px">
              <div class="text-caption text-medium-emphasis">Total owed</div>
              <div class="text-subtitle-1 font-weight-bold">{{ formatCurrency(totalOutstanding) }}</div>
            </v-sheet>
          </div>

          <!-- Several invoices on one voucher: tick them, then pay together. -->
          <v-sheet
            v-if="selectedInvoices.length"
            rounded="lg"
            border
            class="pa-3 mb-3 d-flex align-center flex-wrap ga-3"
          >
            <span class="text-body-2">
              {{ selectedInvoices.length }}
              {{ selectedInvoices.length === 1 ? 'invoice' : 'invoices' }} selected —
              <strong>{{ formatCurrency(selectedTotal) }}</strong>
            </span>
            <span v-if="selectionProblem" class="text-caption text-error">{{ selectionProblem }}</span>
            <v-spacer />
            <v-btn size="small" variant="text" class="text-none" @click="clearSelection">Clear</v-btn>
            <v-btn
              size="small"
              color="primary"
              variant="flat"
              class="text-none font-weight-bold"
              prepend-icon="mdi-file-document-plus-outline"
              :disabled="!!selectionProblem"
              @click="paySelected"
            >
              Pay selected
            </v-btn>
          </v-sheet>

          <div v-if="isFiltering" class="mb-2">
            <v-sheet rounded="lg" border class="d-inline-block px-4 py-2">
              <span class="text-caption text-medium-emphasis">
                {{ agingMatched.count }} {{ agingMatched.count === 1 ? 'invoice' : 'invoices' }} matched —
              </span>
              <span class="text-subtitle-1 font-weight-bold ml-1">{{ formatCurrency(agingMatched.total) }}</span>
              <span class="text-caption text-medium-emphasis ml-1">owed</span>
            </v-sheet>
          </div>

          <v-data-table
            v-model="selectedInvoiceIds"
            :items-per-page-options="financePageSizes"
            mobile-breakpoint="md"
            :headers="agingHeaders"
            :items="filteredAging"
            :loading="loading"
            :no-data-text="isFiltering ? 'No invoices match these filters.' : 'Nothing outstanding.'"
            item-value="transaction_id"
            show-select
            density="compact"
            items-per-page="10"
          >
            <template #item.po_no="{ item }">
              <span class="text-no-wrap">{{ item.po_no || '—' }}</span>
            </template>
            <template #item.invoice_date="{ item }">
              {{ item.invoice_date ? formatDatePR_ISO(item.invoice_date) : '—' }}
            </template>
            <template #item.total_amount="{ item }">{{ formatCurrency(item.total_amount) }}</template>
            <template #item.paid="{ item }">
              {{ item.paid ? formatCurrency(item.paid) : '—' }}
            </template>
            <template #item.balance="{ item }">
              <span class="font-weight-bold">{{ formatCurrency(item.balance) }}</span>
            </template>
            <template #item.days_outstanding="{ item }">
              <v-chip :color="bucketColor[item.bucket]" size="small" label>
                {{ item.days_outstanding }}d · {{ item.bucket }}
              </v-chip>
            </template>
            <template #item.pay="{ item }">
              <v-chip
                v-if="openVouchersOf(item.supplier_id).length"
                size="x-small"
                variant="tonal"
                color="warning"
                label
                class="mr-1"
                :title="`Not yet recorded: ${describeOpenVouchers(item.supplier_id)}`"
              >
                Voucher pending
              </v-chip>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                class="text-none"
                title="Open a voucher already filled in for this invoice"
                @click="payInvoices([item])"
              >
                Pay
              </v-btn>
            </template>
            <template #no-data>
              <div class="text-center text-caption text-medium-emphasis py-6">
                Nothing outstanding — every received invoice is fully paid.
              </div>
            </template>
          </v-data-table>

          <!-- The allocation is a convention, not a recorded fact. Saying so on
               the page is the same disclosure the AR Statement of Accounts makes. -->
          <p class="text-caption text-medium-emphasis mt-3 mb-0">
            Payments are recorded against a supplier, not against a specific invoice, so
            the <strong>Paid</strong> and <strong>Balance</strong> columns apply each
            supplier's payments to their oldest invoice first. Supplier totals always tie
            exactly; a single invoice's split can shift if an older invoice is added or
            back-dated later.
          </p>
        </v-card-text>
      </v-card>

      <v-card rounded="lg" elevation="1" class="mb-3">
        <v-card-title class="pa-4 pa-sm-5 text-h6 font-weight-bold">Accounts Payable by Supplier</v-card-title>
        <v-divider />

        <v-data-table
          :items-per-page-options="financePageSizes"
          mobile-breakpoint="md"
          :headers="apHeaders"
          :items="filteredAP"
          :loading="loading"
          loading-text="Loading accounts payable..."
          no-data-text="No outstanding balances."
          hover
        >
          <template #item.supplier_name="{ item }">
            <span class="font-weight-medium">{{ item.supplier_name ?? '—' }}</span>
          </template>

          <template #item.total_received="{ item }">
            {{ formatCurrency(item.total_received) }}
          </template>

          <template #item.total_paid="{ item }">
            {{ formatCurrency(item.total_paid) }}
          </template>

          <template #item.outstanding="{ item }">
            <span class="font-weight-bold">{{ formatCurrency(item.outstanding) }}</span>
          </template>

          <template #item.has_drift="{ item }">
            <v-chip v-if="item.has_drift" color="warning" size="small" variant="tonal">
              Cache drift
            </v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </template>

          <template #item.pay="{ item }">
            <v-chip
              v-if="openVouchersOf(item.supplier_id).length"
              size="x-small"
              variant="tonal"
              color="warning"
              label
              class="mr-1"
              :title="`Not yet recorded: ${describeOpenVouchers(item.supplier_id)}`"
            >
              Voucher pending
            </v-chip>
            <v-btn
              size="small"
              variant="tonal"
              color="primary"
              class="text-none"
              :disabled="!openInvoicesOf(item.supplier_id).length"
              title="Open a voucher for everything owed to this supplier"
              @click="paySupplier(item)"
            >
              Pay all
            </v-btn>
          </template>
        </v-data-table>
      </v-card>

      <!-- A voucher raised but not recorded has not lowered the balance yet, so
           the invoices it pays still look unpaid. Asked before a second one. -->
      <v-dialog :model-value="!!pendingPayment" max-width="520" @update:model-value="cancelPendingPayment">
        <v-card rounded="lg">
          <v-card-title class="pa-4 text-h6 font-weight-bold">This supplier already has a voucher</v-card-title>
          <v-card-text class="pt-0 text-body-2">
            <p class="mb-2">
              {{ pendingSupplierName }} has a voucher that is not recorded yet:
              <strong>{{ pendingVouchersText }}</strong>.
            </p>
            <p class="mb-0">
              Until it is recorded, the invoices it pays still show as unpaid here. Check that it
              is not for these same invoices before raising another one.
            </p>
          </v-card-text>
          <v-card-actions class="pa-4 pt-0">
            <v-spacer />
            <v-btn variant="text" class="text-none" @click="cancelPendingPayment">Cancel</v-btn>
            <v-btn color="primary" variant="flat" class="text-none font-weight-bold" @click="confirmPendingPayment">
              Raise another voucher
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <v-card rounded="lg" elevation="1">
        <v-card-title class="pa-4 pa-sm-5 d-flex align-center flex-wrap ga-2">
          <span class="text-h6 font-weight-bold">Payment History</span>
          <v-spacer />
          <span v-if="isFiltering" class="text-body-2">
            {{ paymentsMatched.count }} {{ paymentsMatched.count === 1 ? 'payment' : 'payments' }} matched —
            <strong>{{ formatCurrency(paymentsMatched.total) }}</strong>
          </span>
        </v-card-title>
        <v-divider />

        <v-data-table
          :items-per-page-options="financePageSizes"
          mobile-breakpoint="md"
          :headers="paymentHistoryHeaders"
          :items="filteredPayments"
          :loading="loading"
          loading-text="Loading payments..."
          :no-data-text="isFiltering ? 'No payments match these filters.' : 'No supplier payments recorded yet.'"
          hover
        >
          <template #item.dv_no="{ item }">
            <span class="text-no-wrap">{{ dvNoOf(item) ?? '—' }}</span>
          </template>
          <template #item.po_no="{ item }">
            <span class="text-no-wrap">{{ poNumbersOf(item) ?? '—' }}</span>
          </template>
          <template #item.reference_no="{ item }">
            <span class="font-weight-medium" :class="{ 'text-decoration-line-through text-medium-emphasis': item.status === 'voided' }">
              {{ item.reference_no }}
            </span>
            <v-chip
              v-if="item.status === 'voided'"
              size="x-small"
              color="error"
              variant="tonal"
              label
              class="ml-2"
              title="Reversed via an approved change request"
            >
              VOIDED
            </v-chip>
            <v-chip
              v-else-if="isEdited(item.id)"
              size="x-small"
              color="info"
              variant="tonal"
              label
              class="ml-2"
              :title="editTooltip(item.id)"
            >
              EDITED
            </v-chip>
          </template>

          <template #item.paid_at="{ item }">
            <span class="text-body-2 text-medium-emphasis">
              {{ item.paid_at ? formatDatePR_ISO(item.paid_at) : formatDatePR_ISO(item.created_at) }}
            </span>
          </template>

          <template #item.supplier_name="{ item }">
            {{ item.supplier_name ?? '—' }}
          </template>

          <template #item.amount="{ item }">
            {{ formatCurrency(item.amount ?? 0) }}
          </template>

          <template #item.payment_method="{ item }">
            {{ item.payment_method ?? '—' }}
          </template>

          <template #item.cr_actions="{ item }">
            <span v-if="item.status === 'voided'" class="text-caption text-medium-emphasis">—</span>
            <v-chip v-else-if="isPending(item.id)" size="x-small" color="warning" variant="tonal" label>Change pending</v-chip>
            <v-btn
              v-else prepend-icon="mdi-pencil-box-outline" size="small" variant="tonal" color="primary" class="text-none"
              title="Request edit or undo (needs executive approval)"
              @click="openChange(item)"
            >
              Request Change
            </v-btn>
          </template>
        </v-data-table>
      </v-card>

    </div>

    <ChangeRequestDialog
      v-if="config"
      v-model="showDialog"
      :target-ref="config.ref"
      :fields="config.fields"
      :allow-edit="config.allowEdit"
      :allow-void="config.allowVoid"
      :void-summary="config.voidSummary"
      :loading="submitting"
      @submit="submit"
    />

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
