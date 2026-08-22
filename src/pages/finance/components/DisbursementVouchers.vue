<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDisbursementVouchers, headers } from '../composables/useDisbursementVouchers'
import VoucherFormDialog from './dialogs/VoucherFormDialog.vue'
import VoucherPrintDialog from './dialogs/VoucherPrintDialog.vue'
import VoucherStampDialog from './dialogs/VoucherStampDialog.vue'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const {
  vouchers, cashAccounts, loading,
  showFormDialog, editTarget,
  showPrintDialog, printTarget, printCopyNo,
  showCancelDialog, cancelTarget, cancelReason,
  statusMeta, canEdit, canPrint, canRecord, canCancel, recordBlockedReason, particularsSummary,
  init, openCreateDialog, openEditDialog, handleSubmit,
  openPrint, handleRecord, openCancelDialog, closeCancelDialog, handleCancel,
  showStampDialog, stampTarget, openStamp,
} = useDisbursementVouchers()

const route = useRoute()

onMounted(async () => {
  await init()
  // Arriving from the Expenses page's Record Expense button — open straight
  // into the form rather than making the user click New Voucher again.
  if (route.query.new !== undefined) openCreateDialog()
})
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">

      <v-card-title class="d-flex justify-space-between align-center pa-5">
        <div>
          <div class="text-h6 font-weight-bold">Disbursement Vouchers</div>
          <div class="text-caption text-medium-emphasis">
            One payee per voucher. Print and sign it before recording the expenses.
          </div>
        </div>
        <v-btn
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          prepend-icon="mdi-file-document-plus-outline"
          @click="openCreateDialog"
        >
          New Voucher
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-data-table
        mobile-breakpoint="md"
        :headers="headers"
        :items="vouchers"
        :loading="loading"
        loading-text="Loading vouchers..."
        no-data-text="No disbursement vouchers yet."
        hover
      >
        <template #item.dv_no="{ item }">
          <span
            class="font-weight-medium"
            :class="{ 'text-decoration-line-through text-medium-emphasis': item.status === 'cancelled' }"
          >
            {{ item.dv_no ?? '—' }}
          </span>
          <!-- Reprints are visible in the register too, not only on paper -->
          <v-chip
            v-if="item.print_count > 1"
            size="x-small"
            color="warning"
            variant="tonal"
            label
            class="ml-2"
            :title="`Printed ${item.print_count} times — copies after the first are marked REPRINTED`"
          >
            {{ item.print_count }} COPIES
          </v-chip>
        </template>

        <template #item.voucher_date="{ item }">
          <span class="text-body-2 text-medium-emphasis">
            {{ item.voucher_date ? formatDatePR_ISO(item.voucher_date) : formatDatePR_ISO(item.created_at) }}
          </span>
        </template>

        <template #item.payee="{ item }">
          {{ item.payee ?? '—' }}
        </template>

        <template #item.cash_account_name="{ item }">
          {{ item.cash_account_name ?? '—' }}
        </template>

        <template #item.particulars="{ item }">
          <span class="text-truncate d-inline-block" style="max-width: 220px">
            {{ particularsSummary(item) }}
          </span>
        </template>

        <template #item.total_amount="{ item }">
          <span class="font-weight-medium">{{ formatCurrency(item.total_amount) }}</span>
        </template>

        <template #item.status="{ item }">
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="statusMeta(item.status).color"
            :title="statusMeta(item.status).hint"
          >
            {{ statusMeta(item.status).label }}
          </v-chip>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-center ga-2">
            <v-btn
              v-if="canEdit(item)"
              size="small"
              variant="tonal"
              class="text-none"
              prepend-icon="mdi-pencil"
              @click="openEditDialog(item)"
            >
              Edit
            </v-btn>

            <v-btn
              v-if="canPrint(item)"
              size="small"
              variant="tonal"
              color="info"
              class="text-none"
              prepend-icon="mdi-printer"
              :title="item.print_count > 0 ? 'Reprint — the copy will be marked REPRINTED' : 'Print and lock this voucher'"
              @click="openPrint(item)"
            >
              {{ item.print_count > 0 ? 'Reprint' : 'Print' }}
            </v-btn>

            <!-- The gate: disabled until the voucher has been printed -->
            <v-btn
              v-if="item.status !== 'cancelled'"
              size="small"
              variant="tonal"
              color="primary"
              class="text-none"
              prepend-icon="mdi-cash-minus"
              :disabled="!canRecord(item)"
              :loading="loading"
              :title="canRecord(item) ? 'Record each particular as an expense' : recordBlockedReason(item)"
              @click="handleRecord(item)"
            >
              Record Expense
            </v-btn>

            <!-- Only after recording: the mark states that the expenses exist
                 in the ledger, so it must never be printable before they do. -->
            <v-btn
              v-if="item.status === 'recorded'"
              size="small"
              variant="tonal"
              color="error"
              class="text-none"
              prepend-icon="mdi-stamper"
              title="Print the RECORDED mark onto the signed voucher"
              @click="openStamp(item)"
            >
              Mark Recorded
            </v-btn>

            <v-btn
              v-if="canCancel(item)"
              size="small"
              variant="text"
              color="error"
              class="text-none"
              prepend-icon="mdi-close-circle-outline"
              @click="openCancelDialog(item)"
            >
              Cancel
            </v-btn>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <VoucherFormDialog
      v-model="showFormDialog"
      :loading="loading"
      :accounts="cashAccounts"
      :editing="editTarget"
      @submit="handleSubmit"
    />

    <VoucherPrintDialog
      v-model="showPrintDialog"
      :voucher="printTarget"
      :copy-no="printCopyNo"
    />

    <!-- Cancelling is only reachable before recording; after that the expenses
         are real and must be voided through the change-request flow instead. -->
    <VoucherStampDialog v-model="showStampDialog" :voucher="stampTarget" />

    <v-dialog v-model="showCancelDialog" max-width="480">
      <v-card rounded="lg">
        <v-card-title class="text-h6 font-weight-bold pa-5">
          Cancel {{ cancelTarget?.dv_no ?? 'voucher' }}?
        </v-card-title>
        <v-card-text class="pa-5 pt-0">
          <p class="text-body-2 mb-4">
            The voucher number stays on file as cancelled. Any printed copies should be destroyed.
          </p>
          <v-text-field
            v-model="cancelReason"
            label="Reason"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
          />
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="closeCancelDialog">Keep Voucher</v-btn>
          <v-btn
            color="error"
            variant="flat"
            class="text-none font-weight-bold"
            :loading="loading"
            @click="handleCancel"
          >
            Cancel Voucher
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
