<script setup lang="ts">
import { watch } from 'vue'
import { useOpeningReceivables, termPresets } from '../composables/useOpeningReceivables'
import { formatCurrency } from '@/utils/helpers'
import MoneyField from '@/components/inputs/MoneyField.vue'
import ChangeRequestDialog from '@/components/changeRequests/ChangeRequestDialog.vue'
import { useChangeRequestFiling } from '@/composables/useChangeRequestFiling'
import { useChangeRequestsDataStore } from '@/stores/changeRequestsData'
import type { OpeningReceivableRow } from '@/stores/openingReceivablesData'

const {
  loading,
  department, customerId, originalNo, invoiceDate, termDays, termLabel,
  originalAmount, alreadyPaid, cutoverDate, remarks,
  customerSearch, customerOptions, outstanding, termSummary, isOverdue,
  blockers, canSubmit,
  setDaysElapsed, applyTermPreset, clearTerm, submit,
  recorded, recordedLoading, reloadRecorded, changeConfigFor, recordedSearch, recordedFiltered,
} = useOpeningReceivables()

// Correcting or backing out one already recorded needs an executive's approval.
const { showDialog: crDialog, config: crConfig, isPending: crPending, loadPending: crLoad, open: crOpen, submit: crSubmit, submitting: crSubmitting } =
  useChangeRequestFiling(useChangeRequestsDataStore())
watch(recorded, () => { void crLoad() }, { immediate: true })

function requestChange(row: OpeningReceivableRow) {
  crOpen(changeConfigFor(row))
}

async function submitChange(payload: Parameters<typeof crSubmit>[0]) {
  await crSubmit(payload)
  if (!crDialog.value) await reloadRecorded()
}

const recordedHeaders = [
  { title: 'No.', key: 'docNo', sortable: true },
  { title: 'Customer', key: 'customerName', sortable: true },
  { title: 'Their invoice', key: 'originalNo', sortable: false },
  { title: 'Invoice date', key: 'invoiceDate', sortable: true },
  { title: 'Original', key: 'originalAmount', sortable: true, align: 'end' as const },
  { title: 'Outstanding', key: 'outstanding', sortable: true, align: 'end' as const },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

// Bound to its own field so typing a position rewrites the invoice date without
// the date immediately rewriting what is being typed.
function onDaysElapsed(value: string) {
  const days = Number(value)
  if (Number.isFinite(days)) setDaysElapsed(days)
}
</script>

<template>
  <v-container fluid class="pa-0">
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center ga-2 pb-2 flex-wrap">
        <span>Opening Receivables</span>
        <v-chip color="warning" size="small" label>Migration tool</v-chip>
      </v-card-title>

      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Record invoices raised <strong>before</strong> the switch to this system that a customer
          still owes on. Each one becomes a real receivable, so it ages, appears on the customer's
          statement, and can be collected against exactly like a new order. The ledger entry is
          <strong>DR Accounts Receivable / CR Opening Balance Equity</strong> — never revenue,
          because these sales were earned before the books opened here.
        </p>

        <v-row dense>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="department"
              :items="[{ title: 'In-House', value: 'inhouse' }, { title: 'Ethical', value: 'ethical' }]"
              label="Department" density="compact" variant="outlined" hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="5">
            <!-- Server-side search across every customer, the same picker the
                 order dialogs use. autocomplete="off" stops Chrome laying its
                 own saved-form suggestions over the results. -->
            <v-autocomplete
              v-model="customerId"
              v-model:search="customerSearch"
              :items="customerOptions"
              item-props
              no-filter
              autocomplete="off"
              label="Customer" placeholder="Search by name or contact"
              no-data-text="No customer matches that search"
              density="compact" variant="outlined" hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <v-text-field
              v-model="originalNo" label="Their invoice number"
              placeholder="As printed on the old invoice"
              hint="Kept on the record so it can be matched to your files"
              persistent-hint density="compact" variant="outlined"
            />
          </v-col>
        </v-row>

        <v-divider class="my-4" />

        <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">
          Terms
        </div>
        <v-row dense>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model="invoiceDate" type="date" label="Invoice date"
              hint="Aging counts from here" persistent-hint
              density="compact" variant="outlined"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              :model-value="termDays"
              :items="termPresets.map((t) => ({ title: t.label, value: t.days }))"
              label="Credit term" density="compact" variant="outlined"
              hint="Or clear it for consignment / no agreed term" persistent-hint
              @update:model-value="applyTermPreset($event)"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              :model-value="termLabel" label="Term as they word it"
              placeholder="e.g. Consignment, 30 Days PDC"
              density="compact" variant="outlined" hide-details
              @update:model-value="termLabel = $event"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              type="number" label="Or: days already elapsed"
              placeholder="e.g. 45"
              hint="Sets the invoice date backwards from today"
              persistent-hint density="compact" variant="outlined"
              @update:model-value="onDaysElapsed"
            />
          </v-col>
        </v-row>

        <v-alert
          v-if="termSummary"
          :type="isOverdue ? 'warning' : 'info'"
          variant="tonal" density="compact" class="mt-2"
        >
          {{ termSummary }}
          <v-btn
            v-if="termDays !== null"
            size="x-small" variant="text" class="text-none ml-2" @click="clearTerm"
          >
            No agreed term
          </v-btn>
        </v-alert>

        <v-divider class="my-4" />

        <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">
          Amounts
        </div>
        <v-row dense>
          <v-col cols="12" sm="4">
            <MoneyField
              v-model="originalAmount" label="Original invoice amount" prefix="₱"
              density="compact" variant="outlined" hide-details
            />
          </v-col>
          <v-col cols="12" sm="4">
            <MoneyField
              v-model="alreadyPaid" label="Already collected" prefix="₱"
              density="compact" variant="outlined"
              hint="Anything paid before cutover" persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-sheet rounded="lg" border class="pa-3 h-100 d-flex flex-column justify-center">
              <div class="text-caption text-medium-emphasis">Still outstanding</div>
              <div class="text-h6 font-weight-bold">{{ formatCurrency(outstanding) }}</div>
              <div class="text-caption text-medium-emphasis">this is what reaches the ledger</div>
            </v-sheet>
          </v-col>
        </v-row>

        <v-row dense class="mt-2">
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="cutoverDate" type="date" label="Cutover date"
              hint="The journal entry is dated here, not at the invoice date"
              persistent-hint density="compact" variant="outlined"
            />
          </v-col>
          <v-col cols="12" sm="8">
            <v-text-field
              v-model="remarks" label="Notes" placeholder="Optional"
              density="compact" variant="outlined" hide-details
            />
          </v-col>
        </v-row>
      </v-card-text>

      <v-card-actions class="px-4 pb-4 flex-wrap ga-2">
        <v-spacer />
        <span v-if="blockers.length" class="text-caption text-medium-emphasis mr-2">
          Needs {{ blockers.join(', ') }}
        </span>
        <v-btn
          color="primary" variant="flat" class="text-none"
          :disabled="!canSubmit" :loading="loading" @click="submit"
        >
          Record Receivable
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-card class="elevation-0 mt-4">
      <v-card-title class="d-flex align-center ga-2 pb-1 flex-wrap">
        <span>Recorded opening receivables</span>
        <v-spacer />
        <v-text-field
          v-model="recordedSearch"
          placeholder="Search no., customer, their invoice, amount…"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="min-width: 240px; max-width: 360px"
          class="flex-grow-1"
        />
        <v-btn variant="text" size="small" class="text-none" prepend-icon="mdi-refresh" :loading="recordedLoading" @click="reloadRecorded">
          Refresh
        </v-btn>
      </v-card-title>
      <v-card-text>
        <p class="text-caption text-medium-emphasis mb-2">
          Entered one wrongly? Request a change: an executive approves it, then it is corrected — or voided — in the
          ledger as well. A wrong amount is voided and recorded again under a new number; one with payments
          collected against it has to have those voided first.
        </p>
        <v-data-table
          :headers="recordedHeaders"
          :items="recordedFiltered"
          :loading="recordedLoading"
          item-value="id"
          density="compact"
          mobile-breakpoint="md"
          :items-per-page="10"
        >
          <template #item.customerName="{ item }">
            {{ item.customerName ?? '—' }}
            <div class="text-caption text-medium-emphasis">{{ item.department === 'inhouse' ? 'In-House' : 'Ethical' }}</div>
          </template>
          <template #item.originalNo="{ item }">
            {{ item.originalNo || '—' }}
            <div v-if="item.termLabel" class="text-caption text-medium-emphasis">{{ item.termLabel }}</div>
          </template>
          <template #item.originalAmount="{ item }">{{ formatCurrency(item.originalAmount) }}</template>
          <template #item.outstanding="{ item }">
            <span class="font-weight-bold">{{ formatCurrency(item.outstanding) }}</span>
            <div v-if="item.collectedSince > 0" class="text-caption text-medium-emphasis">
              {{ formatCurrency(item.collectedSince) }} collected since
            </div>
          </template>
          <template #item.actions="{ item }">
            <v-chip v-if="crPending(item.id) || item.status === 'change_request'" size="x-small" color="warning" variant="tonal" label>
              change pending
            </v-chip>
            <v-btn
              v-else
              size="small"
              variant="tonal"
              color="primary"
              class="text-none"
              prepend-icon="mdi-pencil-box-outline"
              @click="requestChange(item)"
            >
              Request Change
            </v-btn>
          </template>
          <template #no-data>
            <div class="text-center pa-4 text-caption text-medium-emphasis">
              {{ recordedSearch && recorded.length ? 'Nothing matches that search.' : 'No opening receivables recorded yet.' }}
            </div>
          </template>
        </v-data-table>
      </v-card-text>
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
  </v-container>
</template>
