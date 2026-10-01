<script setup lang="ts">
import { onMounted } from 'vue'
import {
  useSupplierPayments, apHeaders, agingHeaders, paymentHistoryHeaders, bucketColor,
} from '../composables/useSupplierPayments'
import { apAgeBuckets } from '@/stores/financeData'
import ChangeRequestDialog from '@/components/changeRequests/ChangeRequestDialog.vue'
import { useChangeRequestFiling } from '@/composables/useChangeRequestFiling'
import { useFinanceChangeRequestStore } from '../stores/financeChangeRequest'
import { expensePaymentMethods, type SupplierPaymentType } from '@/stores/financeData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const {
  supplierAP, apAging, supplierPayments, loading,
  bucketTotals, totalOutstanding, oldestDays,
  init, goToVouchers,
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
            vouchers — set <strong>Paying: A supplier</strong> on the voucher and
            recording it settles the balance here.
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

          <v-data-table
            mobile-breakpoint="md"
            :headers="agingHeaders"
            :items="apAging"
            :loading="loading"
            density="compact"
            items-per-page="10"
          >
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
          mobile-breakpoint="md"
          :headers="apHeaders"
          :items="supplierAP"
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

        </v-data-table>
      </v-card>

      <v-card rounded="lg" elevation="1">
        <v-card-title class="pa-4 pa-sm-5 text-h6 font-weight-bold">Payment History</v-card-title>
        <v-divider />

        <v-data-table
          mobile-breakpoint="md"
          :headers="paymentHistoryHeaders"
          :items="supplierPayments"
          :loading="loading"
          loading-text="Loading payments..."
          no-data-text="No supplier payments recorded yet."
          hover
        >
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
