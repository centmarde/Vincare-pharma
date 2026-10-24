<script setup lang="ts">
import { onMounted } from 'vue'
import MoneyField from '@/components/inputs/MoneyField.vue'
import { useAccountTransfers, transferHeaders } from '../composables/useAccountTransfers'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import { financePageSizes } from '../composables/financeTable'

// Moving money between our own accounts — bank to bank, bank to cash on hand,
// into or out of a time deposit.
const {
  transfers, loading,
  showDialog, fromAccountId, toAccountId, amount, fee, transferDate, confirmationNo, remarks,
  sourceOptions, destinationOptions, available, leaving, remaining, exceedsAvailable,
  blockers, canSubmit, statusMeta,
  init, openDialog, closeDialog, setFromAccount, submit, clearTransfer,
} = useAccountTransfers()

onMounted(init)
</script>

<template>
  <v-card rounded="lg" elevation="1" class="mt-4">
    <v-card-title class="pa-4 pa-sm-5 d-flex justify-space-between align-center flex-wrap ga-2">
      <div>
        <div class="text-h6 font-weight-bold">Transfers Between Accounts</div>
        <div class="text-caption text-medium-emphasis">
          Moves money from one of our accounts to another, e.g. funding a bank account from another bank.
        </div>
      </div>
      <v-btn class="text-none" size="small" color="primary" variant="tonal" prepend-icon="mdi-bank-transfer" @click="openDialog()">
        Transfer Money
      </v-btn>
    </v-card-title>
    <v-divider />

    <v-data-table
      :items-per-page-options="financePageSizes"
      mobile-breakpoint="md"
      :headers="transferHeaders"
      :items="transfers"
      :loading="loading"
      loading-text="Loading transfers..."
      no-data-text="No transfers recorded yet."
      hover
    >
      <template #item.transfer_date="{ item }">
        <span class="text-body-2 text-medium-emphasis">{{ item.transfer_date ? formatDatePR_ISO(item.transfer_date) : '—' }}</span>
      </template>
      <template #item.confirmation_no="{ item }">{{ item.confirmation_no ?? '—' }}</template>
      <template #item.amount="{ item }">
        <span class="font-weight-medium">{{ formatCurrency(item.amount) }}</span>
        <div v-if="item.remarks" class="text-caption text-medium-emphasis">{{ item.remarks }}</div>
      </template>
      <template #item.status="{ item }">
        <v-chip size="small" variant="tonal" label :color="statusMeta(item.status).color" :title="statusMeta(item.status).hint">
          {{ statusMeta(item.status).label }}
        </v-chip>
      </template>
      <template #item.actions="{ item }">
        <v-btn
          v-if="item.status !== 'cleared'"
          size="small"
          color="primary"
          variant="tonal"
          class="text-none"
          :loading="loading"
          title="Confirm this transfer appears on the bank statement"
          @click="clearTransfer(item.id)"
        >
          Mark Cleared
        </v-btn>
        <span v-else class="text-caption text-medium-emphasis">—</span>
      </template>
    </v-data-table>
  </v-card>

  <v-dialog v-model="showDialog" max-width="560" persistent>
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3 text-h6 font-weight-bold">Transfer Money</v-card-title>
      <v-divider />
      <v-card-text class="pa-4 pa-sm-5">
        <label class="field-label">From <span class="text-error">*</span></label>
        <v-select
          :model-value="fromAccountId"
          :items="sourceOptions"
          item-props
          placeholder="Account the money leaves"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          class="mb-4"
          @update:model-value="setFromAccount"
        />

        <label class="field-label">To <span class="text-error">*</span></label>
        <v-select
          v-model="toAccountId"
          :items="destinationOptions"
          item-props
          placeholder="Account receiving it"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          class="mb-4"
        />

        <label class="field-label">Amount <span class="text-error">*</span></label>
        <MoneyField v-model="amount" variant="outlined" density="comfortable" hide-details class="mb-4" />

        <label class="field-label">Bank fee</label>
        <MoneyField v-model="fee" variant="outlined" density="comfortable" hide-details class="mb-1" />
        <div class="text-caption text-medium-emphasis mb-4">
          If the bank charged for the transfer. It comes out of the account sending the money and is booked to
          Service Charges as an expense. Leave at 0 if none.
        </div>

        <div v-if="fromAccountId" class="text-caption text-medium-emphasis mb-4">
          {{ formatCurrency(available) }} available — {{ formatCurrency(leaving) }} leaving —
          {{ formatCurrency(remaining) }} left after this transfer.
        </div>

        <label class="field-label">Date <span class="text-error">*</span></label>
        <v-text-field v-model="transferDate" type="date" variant="outlined" density="comfortable" hide-details="auto" class="mb-1" />
        <div class="text-caption text-medium-emphasis mb-4">
          The date the money moves. Until you mark it cleared it counts as in transit.
        </div>

        <label class="field-label">Bank reference no.</label>
        <v-text-field
          v-model="confirmationNo"
          placeholder="Transfer / confirmation number from the bank"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          class="mb-4"
        />

        <label class="field-label">Remarks</label>
        <v-text-field v-model="remarks" placeholder="Optional" variant="outlined" density="comfortable" hide-details="auto" />

        <v-alert v-if="exceedsAvailable" type="error" variant="tonal" density="compact" class="mt-4 text-body-2">
          The account only holds {{ formatCurrency(available) }}; this transfer needs {{ formatCurrency(leaving) }}.
        </v-alert>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4">
        <span v-if="blockers.length" class="text-caption text-medium-emphasis">Still needed: {{ blockers.join(', ') }}</span>
        <v-spacer />
        <v-btn variant="text" class="text-none" @click="closeDialog">Cancel</v-btn>
        <v-btn color="primary" variant="flat" class="text-none font-weight-bold" :disabled="!canSubmit" :loading="loading" @click="submit">
          Record Transfer
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 4px;
}
:deep(.v-data-table td) {
  text-align: center !important;
}
</style>
