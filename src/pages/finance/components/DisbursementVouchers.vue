<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { prefillFromQuery, useDisbursementVouchers } from '../composables/useDisbursementVouchers'
import VoucherFormDialog from './dialogs/VoucherFormDialog.vue'
import VoucherPrintDialog from './dialogs/VoucherPrintDialog.vue'
import VoucherRegisterPrintDialog from './dialogs/VoucherRegisterPrintDialog.vue'
import VoucherDetailPanel from './VoucherDetailPanel.vue'
import VoucherStampDialog from './dialogs/VoucherStampDialog.vue'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import { financePageSizes } from '../composables/financeTable'
import { filterExpenseAccount } from '../composables/useExpenseAccounts'

const {
  vouchers,
  search,
  dateFrom,
  dateTo,
  dateRangeError,
  clearDates,
  accountFilter,
  accountOptions,
  isFiltering,
  matchedAmount,
  isPartialMatch,
  tableHeaders,
  filteredVouchers,
  searchTotals,
  cashAccounts,
  loading,
  showFormDialog,
  editTarget,
  createPrefill,
  showRegisterPrint,
  openRegisterPrint,
  visibleColumns,
  columnOptions,
  isColumnVisible,
  toggleColumn,
  showAllColumns,
  showPrintDialog,
  printTarget,
  printCopyNo,
  stampPrint,
  showCancelDialog,
  cancelTarget,
  cancelReason,
  statusMeta,
  canEdit,
  canPrint,
  canRecord,
  canCancel,
  recordBlockedReason,
  particularsOf,
  accountsSummary,
  expanded,
  init,
  openCreateDialog,
  openEditDialog,
  handleSubmit,
  openPrint,
  handleRecord,
  openCancelDialog,
  closeCancelDialog,
  handleCancel,
  showStampDialog,
  stampTarget,
  openStamp,
} = useDisbursementVouchers()

const route = useRoute()
const router = useRouter()

// What the printed list starts from: the dates, account and columns on screen.
const registerStart = computed(() => ({
  dateFrom: dateFrom.value,
  dateTo: dateTo.value,
  account: accountFilter.value,
  columns: visibleColumns.value,
}))

onMounted(async () => {
  await init()
  // Arriving from the Expenses page's Record Expense button, or from Supplier
  // Payments with the bill to pay — open straight into the form rather than
  // making the user click New Voucher again.
  if (route.query.new !== undefined) {
    openCreateDialog(prefillFromQuery(route.query))
    // Dropped from the address so a refresh does not raise the form again.
    void router.replace({ query: {} })
  }
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
        <div class="d-flex align-center ga-2 flex-wrap">
          <v-btn
            variant="tonal"
            color="primary"
            class="text-none font-weight-bold"
            prepend-icon="mdi-printer-outline"
            @click="openRegisterPrint"
          >
            Print List
          </v-btn>
          <v-btn
            color="primary"
            class="text-none font-weight-bold"
            elevation="0"
            prepend-icon="mdi-file-document-plus-outline"
            @click="openCreateDialog()"
          >
            New Voucher
          </v-btn>
        </div>
      </v-card-title>

      <v-divider />

      <div class="px-4 px-sm-5 py-3 d-flex align-center ga-3 flex-wrap">
        <v-text-field
          v-model="search"
          placeholder="Search voucher no., payee, particulars, amount…"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          style="max-width: 440px; min-width: 260px"
        />
        <!-- A date range, both days included: the same day in both is that
             one day; leave either end empty for "from this day on" / "up to
             this day". -->
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
        <v-btn
          v-if="dateFrom || dateTo"
          variant="text"
          size="small"
          class="text-none"
          @click="clearDates"
        >
          All dates
        </v-btn>
        <!-- Typing filters the list; an accountant can type the code too. -->
        <v-autocomplete
          v-model="accountFilter"
          :items="accountOptions"
          :custom-filter="filterExpenseAccount"
          label="Account"
          prepend-inner-icon="mdi-book-outline"
          density="compact"
          variant="outlined"
          hide-details
          auto-select-first
          style="max-width: 300px; min-width: 220px"
        />
        <v-spacer />
        <!-- Which columns the table shows; remembered in this browser. -->
        <v-menu :close-on-content-click="false" location="bottom end">
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              variant="outlined"
              class="text-none"
              prepend-icon="mdi-view-column-outline"
            >
              Columns
              <span v-if="visibleColumns.length < columnOptions.length" class="text-medium-emphasis ml-1">
                ({{ visibleColumns.length }}/{{ columnOptions.length }})
              </span>
            </v-btn>
          </template>
          <v-card min-width="220" rounded="lg">
            <v-list density="compact">
              <v-list-item
                v-for="column in columnOptions"
                :key="column.key"
                :title="column.title"
                :disabled="isColumnVisible(column.key) && visibleColumns.length === 1"
                @click="toggleColumn(column.key)"
              >
                <template #prepend>
                  <v-checkbox-btn :model-value="isColumnVisible(column.key)" density="compact" readonly />
                </template>
              </v-list-item>
            </v-list>
            <v-divider />
            <v-card-actions class="pa-2">
              <v-btn
                size="small"
                variant="text"
                class="text-none"
                :disabled="visibleColumns.length === columnOptions.length"
                @click="showAllColumns"
              >
                Show all
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-menu>
      </div>

      <!-- The figure their old system showed: what the vouchers add up to,
           across every match rather than the page on screen. Always shown —
           with nothing filtered it is the whole register. Under an account
           filter it adds only that account's lines. -->
      <div class="px-4 px-sm-5 pb-3">
        <v-sheet rounded="lg" border class="d-inline-block px-4 py-2">
          <span class="text-caption text-medium-emphasis">
            {{ searchTotals.counted }}
            {{ searchTotals.counted === 1 ? 'voucher' : 'vouchers' }}
            {{ isFiltering ? 'matched' : 'in total' }} —
          </span>
          <span class="text-subtitle-1 font-weight-bold ml-1">
            {{ formatCurrency(searchTotals.total) }}
          </span>
          <span v-if="accountFilter" class="text-caption text-medium-emphasis ml-2">
            (lines in this account only)
          </span>
          <span v-if="searchTotals.cancelled" class="text-caption text-medium-emphasis ml-2">
            ({{ searchTotals.cancelled }} cancelled, not counted)
          </span>
        </v-sheet>
      </div>

      <v-divider />

      <v-data-table
        :items-per-page-options="financePageSizes"
        mobile-breakpoint="md"
        v-model:expanded="expanded"
        :headers="tableHeaders"
        :items="filteredVouchers"
        :loading="loading"
        loading-text="Loading vouchers..."
        :no-data-text="isFiltering ? 'No vouchers match these filters.' : 'No disbursement vouchers yet.'"
        item-value="id"
        show-expand
        expand-on-click
        class="dv-table"
        hover
      >
        <!-- Click a row to read the whole voucher, without opening Edit. -->
        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length" class="pa-0">
              <VoucherDetailPanel :voucher="item" :particulars="particularsOf(item)" />
            </td>
          </tr>
        </template>

        <template #item.dv_no="{ item }">
          <!-- The full number, "DV-2026-131", as stored and printed. The
               "DV-" was briefly dropped because the header says DV NO.; staff
               asked for it back so the list reads like the paper voucher. -->
          <span
            class="font-weight-medium text-no-wrap"
            :class="{
              'text-decoration-line-through text-medium-emphasis': item.status === 'cancelled',
            }"
          >
            {{ item.dv_no ?? '—' }}
          </span>
        </template>

        <template #item.voucher_date="{ item }">
          <span class="text-body-2 text-medium-emphasis">
            {{
              item.voucher_date
                ? formatDatePR_ISO(item.voucher_date)
                : formatDatePR_ISO(item.created_at)
            }}
          </span>
        </template>

        <template #item.payee="{ item }">
          {{ item.payee ?? '—' }}
        </template>

        <template #item.cash_account_name="{ item }">
          <!-- Shown as typed: staff put the bank and date in the check no.
               itself ("BDO 1130222 10/10/26"), so a "Check No." prefix only
               doubled up and made the column wrap. -->
          <div class="py-1 text-no-wrap">
            <div :class="item.check_no ? 'font-weight-medium' : 'text-medium-emphasis'">
              {{ item.check_no || 'No check' }}
            </div>
            <div class="text-caption text-medium-emphasis">{{ item.cash_account_name ?? '—' }}</div>
          </div>
        </template>

        <!-- The whole description, up to two lines, with what it is charged to
             beneath. Longer ones read in full when the row is opened. -->
        <template #item.particulars="{ item }">
          <div class="py-2 particulars-cell">
            <div class="particulars-text" :title="particularsOf(item)">
              {{ particularsOf(item) || '—' }}
            </div>
            <div class="text-caption text-medium-emphasis text-truncate">
              {{ accountsSummary(item) }}
            </div>
          </div>
        </template>

        <template #item.total_amount="{ item }">
          <!-- Under an account filter a mixed voucher shows the part in that
               account, with the voucher's full total beneath it. -->
          <template v-if="isPartialMatch(item)">
            <div class="font-weight-medium">{{ formatCurrency(matchedAmount(item)) }}</div>
            <div class="text-caption text-medium-emphasis text-no-wrap">of {{ formatCurrency(item.total_amount) }}</div>
          </template>
          <span v-else class="font-weight-medium">{{ formatCurrency(item.total_amount) }}</span>
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
          <!-- Reprints are visible in the register too, not only on paper.
               Sits under the status because how many copies exist is part of
               the document's state, not its number. -->
          <div v-if="item.print_count > 1" class="mt-1">
            <v-chip
              size="x-small"
              color="warning"
              variant="tonal"
              label
              :title="`Printed ${item.print_count} times — copies after the first are marked REPRINTED`"
            >
              {{ item.print_count }} COPIES
            </v-chip>
          </div>
        </template>

        <!-- One labelled button for the voucher's NEXT step, and the occasional
             actions as icons. Five full-size buttons in a row ran out of room
             and cut "Record Expense" off. Record Expense is no longer shown
             (disabled) on a draft: the gate is still enforced, and Print being
             the only labelled button already says what comes first. -->
        <template #item.actions="{ item }">
          <!-- .stop: a button press must not also open/close the row. -->
          <div class="d-flex justify-center align-center ga-1 text-no-wrap" @click.stop>
            <v-btn
              v-if="item.status === 'draft'"
              size="small"
              variant="tonal"
              color="info"
              class="text-none"
              prepend-icon="mdi-printer"
              title="Print and lock this voucher"
              @click="openPrint(item)"
            >
              Print
            </v-btn>
            <v-btn
              v-else-if="item.status === 'printed'"
              size="small"
              variant="tonal"
              color="primary"
              class="text-none"
              prepend-icon="mdi-cash-minus"
              :disabled="!canRecord(item)"
              :loading="loading"
              :title="
                canRecord(item) ? 'Record each particular as an expense' : recordBlockedReason(item)
              "
              @click="handleRecord(item)"
            >
              Record Expense
            </v-btn>
            <!-- Only after recording: the mark states that the expenses exist
                 in the ledger, so it must never be printable before they do. -->
            <v-btn
              v-else-if="item.status === 'recorded'"
              size="small"
              variant="tonal"
              color="error"
              class="text-none"
              prepend-icon="mdi-stamper"
              title="Print the POSTED mark onto the signed voucher"
              @click="openStamp(item)"
            >
              Mark Recorded
            </v-btn>
            <span v-else class="text-medium-emphasis">—</span>

            <v-btn
              v-if="canPrint(item) && item.status !== 'draft'"
              icon="mdi-printer"
              size="small"
              variant="text"
              color="info"
              title="Reprint — the copy will be marked REPRINTED"
              aria-label="Reprint"
              @click="openPrint(item)"
            />
            <v-btn
              v-if="canEdit(item)"
              icon="mdi-pencil"
              size="small"
              variant="text"
              title="Edit"
              aria-label="Edit"
              @click="openEditDialog(item)"
            />
            <v-btn
              v-if="canCancel(item)"
              icon="mdi-close-circle-outline"
              size="small"
              variant="text"
              color="error"
              title="Cancel this voucher"
              aria-label="Cancel voucher"
              @click="openCancelDialog(item)"
            />
          </div>
        </template>
      </v-data-table>
    </v-card>

    <VoucherFormDialog
      v-model="showFormDialog"
      :loading="loading"
      :accounts="cashAccounts"
      :editing="editTarget"
      :prefill="createPrefill"
      @submit="handleSubmit"
    />

    <VoucherRegisterPrintDialog v-model="showRegisterPrint" :start="registerStart" />

    <VoucherPrintDialog
      v-model="showPrintDialog"
      :voucher="printTarget"
      :copy-no="printCopyNo"
      @printed="stampPrint"
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

<style scoped>
/* Rows open to show the whole voucher, so they read as clickable. */
.dv-table :deep(tbody tr.v-data-table__tr) {
  cursor: pointer;
}

.particulars-cell {
  min-width: 220px;
  max-width: 340px;
  text-align: left;
}

/* Two lines, then an ellipsis: enough for almost every description (the
   longest are ~130 characters) without the row growing tall. */
.particulars-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.35;
}
</style>
