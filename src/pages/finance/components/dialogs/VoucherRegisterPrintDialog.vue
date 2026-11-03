<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { registerColumns, registerStatusOptions, useVoucherRegister } from '../../composables/useVoucherRegister'
import type { RegisterStart } from '../../composables/useVoucherRegister'
import { filterExpenseAccount } from '../../composables/useExpenseAccounts'
import { useVoucherPdf } from '../../composables/useVoucherPdf'
import { companyFor, companyOptions } from '@/utils/companyProfiles'
import { formatCurrency } from '@/utils/helpers'

// The printable register of vouchers — "every voucher from BDO VP 2290 for
// October, and what they came to". The filters sit above a preview that IS
// the printed page, so what is downloaded is what was looked at.

const props = defineProps<{
  modelValue: boolean
  /** What the list was showing when Print List was pressed. */
  start: RegisterStart
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const toast = useToast()
const { generate } = useVoucherPdf()

const {
  dateFrom, dateTo, paidFrom, chargedTo, statuses, columns, companyKey,
  dateRangeError, paidFromOptions, chargedToOptions,
  rows, counted, total, byAccount,
  periodLine, paidFromLine, chargedToLine, filename,
  startFrom, hasColumn, toggleColumn,
  amountFor, isPartial, particularsOf, accountsOf, dateOf,
} = useVoucherRegister()

const company = computed(() => companyFor(companyKey.value))

watch(() => props.modelValue, (open) => { if (open) startFrom(props.start) })

const sheet = ref<HTMLElement | null>(null)
const generating = ref(false)

async function handlePrint() {
  await nextTick()
  if (!sheet.value) return
  generating.value = true
  try {
    await generate(sheet.value, filename.value, { landscape: true })
    toast.success('Register generated.')
  } catch {
    toast.error('Could not generate the register.')
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="1200"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3 d-flex align-center flex-wrap ga-2">
        <span class="text-h6 font-weight-bold">Print Voucher List</span>
        <v-spacer />
        <v-select
          v-model="companyKey"
          :items="companyOptions"
          label="Issued by"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 240px"
        />
      </v-card-title>
      <v-divider />

      <div class="pa-4 pa-sm-5 pb-2">
        <v-row dense>
          <v-col cols="12" sm="6" md="3">
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
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model="dateTo"
              type="date"
              label="To"
              :min="dateFrom || undefined"
              density="compact"
              variant="outlined"
              hide-details
              clearable
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-select
              v-model="statuses"
              :items="registerStatusOptions"
              label="Status"
              multiple
              chips
              closable-chips
              density="compact"
              variant="outlined"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-autocomplete
              v-model="paidFrom"
              :items="paidFromOptions"
              label="Paid from"
              placeholder="All accounts"
              persistent-placeholder
              prepend-inner-icon="mdi-bank-outline"
              multiple
              chips
              closable-chips
              clearable
              density="compact"
              variant="outlined"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="6">
            <!-- Typing filters the list; an accountant can type the code too. -->
            <v-autocomplete
              v-model="chargedTo"
              :items="chargedToOptions"
              :custom-filter="filterExpenseAccount"
              label="Charged to"
              placeholder="All accounts"
              persistent-placeholder
              prepend-inner-icon="mdi-book-outline"
              multiple
              chips
              closable-chips
              clearable
              density="compact"
              variant="outlined"
              hide-details
            />
          </v-col>
        </v-row>

        <div class="d-flex align-center flex-wrap ga-2 mt-3">
          <span class="text-caption text-medium-emphasis mr-1">Columns:</span>
          <v-chip
            v-for="column in registerColumns"
            :key="column.key"
            size="small"
            label
            :variant="hasColumn(column.key) ? 'flat' : 'outlined'"
            :color="hasColumn(column.key) ? 'primary' : undefined"
            :prepend-icon="hasColumn(column.key) ? 'mdi-check' : undefined"
            @click="toggleColumn(column.key)"
          >
            {{ column.title }}
          </v-chip>
          <!-- Always printed: the total is the point of the list. -->
          <v-chip
            size="small"
            label
            variant="flat"
            color="primary"
            prepend-icon="mdi-lock-outline"
            class="pe-none"
            title="Always printed"
          >
            Amount
          </v-chip>
        </div>
      </div>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5" style="background: #ffffff">
        <!-- The preview is the printed page: white, print type sizes, no theme. -->
        <div ref="sheet" class="dvr-sheet">
          <div class="dvr-letterhead">
            <div class="dvr-company">{{ company.name }}</div>
            <div class="dvr-company-line">{{ company.line1 }}</div>
            <div class="dvr-company-line">{{ company.line2 }}</div>
            <div v-if="company.license" class="dvr-company-line">{{ company.license }}</div>
          </div>

          <div class="dvr-title">DISBURSEMENT VOUCHER REGISTER</div>
          <dl class="dvr-meta">
            <div><dt>Period</dt><dd>{{ periodLine }}</dd></div>
            <div><dt>Paid from</dt><dd>{{ paidFromLine }}</dd></div>
            <div><dt>Charged to</dt><dd>{{ chargedToLine }}</dd></div>
          </dl>

          <table class="dvr-table">
            <thead>
              <tr>
                <th v-if="hasColumn('dv_no')">DV No.</th>
                <th v-if="hasColumn('voucher_date')">Date</th>
                <th v-if="hasColumn('payee')">Payee</th>
                <th v-if="hasColumn('check')">Check Details</th>
                <th v-if="hasColumn('particulars')">Particulars</th>
                <th v-if="hasColumn('accounts')">Charged To</th>
                <th v-if="hasColumn('status')">Status</th>
                <th class="dvr-num">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="voucher in rows" :key="voucher.id" :class="{ 'dvr-cancelled': voucher.status === 'cancelled' }">
                <td v-if="hasColumn('dv_no')" class="dvr-nowrap">{{ voucher.dv_no ?? '—' }}</td>
                <td v-if="hasColumn('voucher_date')" class="dvr-nowrap">{{ dateOf(voucher) }}</td>
                <td v-if="hasColumn('payee')">{{ voucher.payee ?? '—' }}</td>
                <td v-if="hasColumn('check')">
                  <div>{{ voucher.check_no || 'No check' }}</div>
                  <div class="dvr-muted">{{ voucher.cash_account_name ?? '' }}</div>
                </td>
                <td v-if="hasColumn('particulars')">{{ particularsOf(voucher) || '—' }}</td>
                <td v-if="hasColumn('accounts')">{{ accountsOf(voucher) }}</td>
                <td v-if="hasColumn('status')" class="dvr-nowrap">{{ voucher.status.toUpperCase() }}</td>
                <td class="dvr-num">
                  <template v-if="voucher.status === 'cancelled'">—</template>
                  <template v-else>
                    {{ formatCurrency(amountFor(voucher)) }}
                    <div v-if="isPartial(voucher)" class="dvr-muted">of {{ formatCurrency(voucher.total_amount) }}</div>
                  </template>
                </td>
              </tr>
              <tr v-if="!rows.length">
                <td :colspan="columns.length + 1" class="dvr-empty">No vouchers match these filters.</td>
              </tr>
            </tbody>
            <tfoot v-if="rows.length">
              <tr class="dvr-total">
                <td v-if="columns.length" :colspan="columns.length">
                  TOTAL — {{ counted.length }} {{ counted.length === 1 ? 'voucher' : 'vouchers' }}
                  <span v-if="rows.length > counted.length" class="dvr-muted">
                    ({{ rows.length - counted.length }} cancelled, not counted)
                  </span>
                </td>
                <td class="dvr-num">{{ formatCurrency(total) }}</td>
              </tr>
            </tfoot>
          </table>

          <!-- One voucher can charge several accounts, so the split by account
               is what ties this list to the ledger. Only when there is a split. -->
          <div v-if="byAccount.length > 1" class="dvr-summary">
            <div class="dvr-summary-title">By account</div>
            <table class="dvr-table">
              <tbody>
                <tr v-for="row in byAccount" :key="row.code">
                  <td>{{ row.label }}</td>
                  <td class="dvr-num">{{ formatCurrency(row.amount) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="dvr-total">
                  <td>TOTAL</td>
                  <td class="dvr-num">{{ formatCurrency(total) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="dvr-footer">
            Generated {{ new Date().toLocaleString('en-PH') }} · This is a computer-generated list.
          </div>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3 d-flex ga-2 justify-end">
        <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">
          Close
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="text-none font-weight-bold"
          prepend-icon="mdi-printer"
          :disabled="!rows.length || !!dateRangeError"
          :loading="generating"
          @click="handlePrint"
        >
          Download PDF
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Rendered through html2canvas, which reads computed styles literally — so
   hard-coded hex, not theme tokens. */
.dvr-sheet {
  background: #ffffff;
  color: #000000;
  padding: 20px 24px;
  font-size: 11px;
  line-height: 1.45;
  font-family: Roboto, Arial, sans-serif;
}
.dvr-letterhead {
  text-align: center;
  border-bottom: 2px solid #000000;
  padding-bottom: 8px;
  margin-bottom: 12px;
}
.dvr-company {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.dvr-company-line {
  font-size: 10px;
}
.dvr-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  margin-bottom: 8px;
}
.dvr-meta {
  margin: 0 0 12px;
  font-size: 10.5px;
}
.dvr-meta > div {
  display: flex;
  gap: 6px;
}
.dvr-meta dt {
  font-weight: 700;
  min-width: 80px;
}
.dvr-meta dd {
  margin: 0;
}
.dvr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10.5px;
}
.dvr-table th,
.dvr-table td {
  border-bottom: 1px solid #d0d0d0;
  padding: 4px 6px;
  text-align: left;
  vertical-align: top;
}
.dvr-table thead th {
  border-bottom: 1.5px solid #000000;
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
/* A row split across two pages puts a payee on one sheet and its amount on
   the next. html2pdf's default page-break mode honours this. */
.dvr-table tr {
  break-inside: avoid;
  page-break-inside: avoid;
}
.dvr-num,
.dvr-table th.dvr-num {
  text-align: right;
  white-space: nowrap;
}
.dvr-nowrap {
  white-space: nowrap;
}
.dvr-muted {
  font-size: 9.5px;
  color: #555555;
}
.dvr-cancelled td {
  text-decoration: line-through;
  color: #777777;
}
.dvr-empty {
  text-align: center !important;
  padding: 16px !important;
  font-style: italic;
}
.dvr-total td {
  border-top: 1.5px solid #000000;
  border-bottom: none;
  font-weight: 700;
  font-size: 11.5px;
}
.dvr-summary {
  margin-top: 16px;
  max-width: 420px;
  margin-left: auto;
  break-inside: avoid;
  page-break-inside: avoid;
}
.dvr-summary-title {
  font-weight: 700;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.dvr-footer {
  border-top: 1px solid #000000;
  padding-top: 6px;
  margin-top: 16px;
  font-size: 9.5px;
  font-style: italic;
}
</style>
