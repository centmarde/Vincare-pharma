<script setup lang="ts">
import { useGeneralJournal } from '../composables/useGeneralJournal'
import ManualEntryDialog from './dialogs/ManualEntryDialog.vue'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

// GL journal entries are deliberately OUT of the change-request workflow: a
// journal_entries row is not a transactions row, so its id can't satisfy
// change_requests.transaction_id (FK → transactions.id). Corrections stay on
// the direct-reversal flow below (reverseEntry → gl.reverseEntry), which posts
// a mirror entry and flips the original to 'reversed'.
const {
  filterFrom, filterTo, filterReferenceType, REFERENCE_TYPE_OPTIONS,
  entries, loading, accountOptions,
  showManualEntryDialog, manualEntryDate, manualDescription, manualLines,
  manualTotalDebit, manualTotalCredit, manualIsBalanced,
  addManualLine, removeManualLine,
  fetchJournal, submitManualEntry, approveEntry, reverseEntry, resyncLedger,
} = useGeneralJournal()

function statusColor(status: string): string {
  if (status === 'posted') return 'success'
  if (status === 'draft') return 'warning'
  return 'grey'
}
</script>

<template>
  <v-container fluid pa-0>
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center gap-2 pb-2 flex-wrap">
        <span>General Journal</span>
        <v-spacer />
        <v-btn size="small" variant="text" color="info" prepend-icon="mdi-sync" @click="resyncLedger">
          Re-sync ledger
        </v-btn>
        <v-btn size="small" color="primary" prepend-icon="mdi-plus" @click="showManualEntryDialog = true">
          Manual Entry
        </v-btn>
      </v-card-title>

      <v-card-text>
        <div class="mb-4 d-flex gap-2 flex-wrap">
          <v-text-field
            v-model="filterFrom" type="date" label="From" density="compact" variant="outlined"
            hide-details style="max-width: 160px" @update:model-value="fetchJournal" />
          <v-text-field
            v-model="filterTo" type="date" label="To" density="compact" variant="outlined"
            hide-details style="max-width: 160px" @update:model-value="fetchJournal" />
          <v-select
            v-model="filterReferenceType" :items="REFERENCE_TYPE_OPTIONS" label="Type" clearable
            density="compact" variant="outlined" hide-details style="max-width: 200px"
            @update:model-value="fetchJournal" />
        </div>

        <v-progress-linear v-if="loading" indeterminate class="mb-2" />

        <v-table density="compact">
          <thead>
            <tr>
              <th class="text-left">Entry No</th>
              <th class="text-left">Date</th>
              <th class="text-left">Type</th>
              <th class="text-left">Description</th>
              <th class="text-right">Debit</th>
              <th class="text-right">Credit</th>
              <th class="text-left">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="entry in entries" :key="entry.id">
              <tr>
                <td>{{ entry.entry_no }}</td>
                <td>{{ formatDatePR_ISO(entry.entry_date) }}</td>
                <td>{{ entry.reference_type }}</td>
                <td>{{ entry.description }}</td>
                <td class="text-right">{{ formatCurrency((entry.lines ?? []).reduce((s, l) => s + l.debit, 0)) }}</td>
                <td class="text-right">{{ formatCurrency((entry.lines ?? []).reduce((s, l) => s + l.credit, 0)) }}</td>
                <td><v-chip :color="statusColor(entry.status)" size="x-small" label>{{ entry.status }}</v-chip></td>
                <td>
                  <v-btn v-if="entry.status === 'draft'" size="x-small" variant="text" color="success"
                    @click="approveEntry(entry.id)">Approve</v-btn>
                  <v-btn v-else-if="entry.status === 'posted'" size="small" variant="tonal" color="error" class="text-none"
                    @click="reverseEntry(entry.id)">Reverse</v-btn>
                </td>
              </tr>
              <tr v-for="line in entry.lines" :key="`${entry.id}-${line.id}`" class="text-caption">
                <td></td>
                <td colspan="2" class="text-medium-emphasis">{{ line.account_code }} — {{ line.account_name }}</td>
                <td class="text-medium-emphasis">{{ line.line_memo }}</td>
                <td class="text-right text-medium-emphasis">{{ line.debit > 0 ? formatCurrency(line.debit) : '' }}</td>
                <td class="text-right text-medium-emphasis">{{ line.credit > 0 ? formatCurrency(line.credit) : '' }}</td>
                <td></td><td></td>
              </tr>
            </template>
            <tr v-if="!entries.length && !loading">
              <td colspan="8" class="text-center text-caption text-medium-emphasis py-4">
                No journal entries in this range.
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>

    <ManualEntryDialog
      v-model="showManualEntryDialog"
      v-model:entry-date="manualEntryDate"
      v-model:description="manualDescription"
      :account-options="accountOptions"
      :lines="manualLines"
      :total-debit="manualTotalDebit"
      :total-credit="manualTotalCredit"
      :is-balanced="manualIsBalanced"
      :loading="loading"
      @add-line="addManualLine"
      @remove-line="removeManualLine"
      @submit="submitManualEntry" />
  </v-container>
</template>
