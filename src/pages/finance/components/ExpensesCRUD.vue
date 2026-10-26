<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useExpenses, headers } from '../composables/useExpenses'
import ChangeRequestDialog from '@/components/changeRequests/dialogs/ChangeRequestDialog.vue'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import { financePageSizes } from '../composables/financeTable'

const {
  loading,
  search,
  filteredExpenses,
  showChangeDialog,
  changeTarget,
  changeFields,
  voidSummary,
  isPending,
  isEdited,
  editTooltip,
  voucherFor,
  init,
  openChangeDialog,
  submitChangeRequest,
  expenseAccountLabel,
} = useExpenses()

const router = useRouter()

// Recording an expense now starts as a disbursement voucher: the accountant's
// rule is that the voucher is printed and signed BEFORE anything is expensed,
// so this page is the register of what has already been recorded, not the
// entry point. (The old direct-entry dialog is still in the repo — see
// AddExpenseDialog.vue — if the bypass is ever wanted back.)
function startVoucher() {
  router.push('/finance/disbursement-vouchers?new=1')
}

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">
      <v-card-title class="d-flex flex-wrap align-center ga-3 pa-5">
        <span class="text-h6 font-weight-bold">Operational Expenses</span>
        <v-spacer />
        <v-text-field
          v-model="search"
          placeholder="Search EXP no., paid to, account, amount…"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="min-width: 260px; max-width: 400px"
        />
        <v-btn
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          prepend-icon="mdi-file-document-plus-outline"
          @click="startVoucher"
        >
          Record Expense
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-data-table
        :items-per-page-options="financePageSizes"
        mobile-breakpoint="md"
        :headers="headers"
        :items="filteredExpenses"
        :loading="loading"
        loading-text="Loading expenses..."
        :no-data-text="search ? 'No expense matches that search.' : 'No expenses recorded yet.'"
        hover
      >
        <template #item.reference_no="{ item }">
          <span
            class="font-weight-medium"
            :class="{
              'text-decoration-line-through text-medium-emphasis': item.status === 'voided',
            }"
          >
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

        <template #item.department="{ item }">
          {{ item.department ?? '—' }}
        </template>

        <template #item.category="{ item }">
          <v-chip size="small" variant="tonal" color="primary">{{ expenseAccountLabel(item.category) }}</v-chip>
        </template>

        <template #item.remarks="{ item }">
          <span class="text-truncate d-inline-block" style="max-width: 200px">{{
            item.remarks ?? '—'
          }}</span>
        </template>

        <!-- Blank is a valid state: an expense entered directly here has no
             voucher behind it. -->
        <template #item.voucher="{ item }">
          <v-chip
            v-if="voucherFor(item.id)"
            size="x-small"
            variant="tonal"
            color="info"
            label
            title="Recorded from this disbursement voucher"
          >
            {{ voucherFor(item.id) }}
          </v-chip>
          <span v-else class="text-medium-emphasis">—</span>
        </template>

        <template #item.or_si_no="{ item }">
          {{ item.or_si_no ?? '—' }}
        </template>

        <template #item.paid_to="{ item }">
          {{ item.paid_to ?? '—' }}
        </template>

        <template #item.cash_account_name="{ item }">
          {{ item.cash_account_name ?? '—' }}
        </template>

        <template #item.amount="{ item }">
          {{ formatCurrency(item.amount ?? 0) }}
        </template>

        <template #item.actions="{ item }">
          <span v-if="item.status === 'voided'" class="text-caption text-medium-emphasis">—</span>
          <v-chip
            v-else-if="isPending(item.id)"
            size="x-small"
            color="warning"
            variant="tonal"
            label
          >
            Change pending
          </v-chip>
          <v-btn
            v-else
            prepend-icon="mdi-pencil-box-outline"
            size="small"
            variant="tonal"
            color="primary"
            class="text-none"
            title="Request edit or undo (needs executive approval)"
            @click="openChangeDialog(item.id)"
          >
            Request Change
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <ChangeRequestDialog
      v-model="showChangeDialog"
      :target-ref="changeTarget?.reference_no ?? null"
      :fields="changeFields"
      :allow-edit="true"
      :allow-void="true"
      :void-summary="voidSummary"
      :loading="loading"
      @submit="submitChangeRequest"
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
