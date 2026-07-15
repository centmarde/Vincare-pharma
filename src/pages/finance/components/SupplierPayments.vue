<script setup lang="ts">
import { onMounted } from 'vue'
import { useSupplierPayments, apHeaders, paymentHistoryHeaders } from '../composables/useSupplierPayments'
import SupplierPaymentDialog from './dialogs/SupplierPaymentDialog.vue'
import ChangeRequestDialog from '@/components/changeRequests/ChangeRequestDialog.vue'
import { useChangeRequestFiling } from '@/composables/useChangeRequestFiling'
import { EXPENSE_PAYMENT_METHODS, type SupplierPaymentType } from '@/stores/financeData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const {
  supplierAP, supplierPayments, loading,
  showPaymentDialog, targetOutstanding, amount, paymentMethod, referenceNo, valueDate, remarks, canSubmit,
  init, openPaymentDialog, handleSubmit,
} = useSupplierPayments()

// Edit/undo requests on a recorded supplier payment (executive-approved).
const { showDialog, config, isPending, loadPending, open, submit, submitting } =
  useChangeRequestFiling('finance', 'supplier_payment')

function openChange(p: SupplierPaymentType) {
  open({
    id: p.id,
    ref: p.reference_no,
    fields: [
      { key: 'amount', label: 'Amount', value: p.amount ?? 0, type: 'number' },
      { key: 'payment_method', label: 'Payment Method', value: p.payment_method, type: 'select', items: EXPENSE_PAYMENT_METHODS.map((m) => ({ title: m.title, value: m.value })) },
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

      <v-card rounded="lg" elevation="1" class="mb-3">
        <v-card-title class="pa-4 pa-sm-5 text-h6 font-weight-bold">Accounts Payable</v-card-title>
        <v-divider />

        <v-data-table
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

          <template #item.actions="{ item }">
            <v-btn
              color="primary"
              size="small"
              variant="tonal"
              :disabled="item.outstanding <= 0.01"
              @click="openPaymentDialog(item.supplier_id, item.outstanding)"
            >
              Pay
            </v-btn>
          </template>
        </v-data-table>
      </v-card>

      <v-card rounded="lg" elevation="1">
        <v-card-title class="pa-4 pa-sm-5 text-h6 font-weight-bold">Payment History</v-card-title>
        <v-divider />

        <v-data-table
          :headers="paymentHistoryHeaders"
          :items="supplierPayments"
          :loading="loading"
          loading-text="Loading payments..."
          no-data-text="No supplier payments recorded yet."
          hover
        >
          <template #item.reference_no="{ item }">
            <span class="font-weight-medium">{{ item.reference_no }}</span>
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
            <v-chip v-if="isPending(item.id)" size="x-small" color="warning" variant="tonal" label>Change pending</v-chip>
            <v-btn
              v-else icon="mdi-pencil-box-outline" size="small" variant="text" color="primary"
              title="Request edit or undo (needs executive approval)"
              @click="openChange(item)"
            />
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

    <SupplierPaymentDialog
      v-model="showPaymentDialog"
      :outstanding="targetOutstanding"
      :amount="amount"
      :payment-method="paymentMethod"
      :reference-no="referenceNo"
      :value-date="valueDate"
      :remarks="remarks"
      :can-submit="canSubmit"
      :loading="loading"
      @update:amount="amount = $event"
      @update:payment-method="paymentMethod = $event"
      @update:reference-no="referenceNo = $event"
      @update:value-date="valueDate = $event"
      @update:remarks="remarks = $event"
      @submit="handleSubmit"
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
