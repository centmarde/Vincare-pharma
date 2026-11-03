<script setup lang="ts">
import { onMounted } from 'vue'
import {
  useRebateVouchers, departmentLabels, departmentFilterOptions, voucherStatusOptions,
  voucherHeaders, customerHeaders,
} from '../composables/useRebateVouchers'
import type { RebateCustomerRow } from '../composables/useRebateVouchers'
import { formatCurrency, formatDateOnly } from '@/utils/helpers'
import { financePageSizes } from '@/pages/finance/composables/financeTable'

const {
  loading, search, departmentFilter, statuses, dateFrom, dateTo,
  customerFilter, customerFilterName, showCustomer,
  rows, byCustomer, listTotals, inhouseTotals, ethicalTotals, unlinkedTotals,
  customerOptions,
  showLinkDialog, linkTarget, linkCustomerId, linking, openLink, cancelLink, confirmLink,
  init,
} = useRebateVouchers()

onMounted(() => init())

function pickCustomer(_event: unknown, row: { item: RebateCustomerRow }) {
  showCustomer(row.item.customer_id)
}

const statusColor: Record<string, string> = { draft: 'grey', printed: 'info', recorded: 'green-darken-1' }
</script>

<template>
  <div>
    <div class="text-caption text-medium-emphasis mb-4">
      Rebates paid by disbursement voucher — anything charged to Computed Rebates (6030, earned)
      or Cash Advances – Rebates (1060 / 1070, paid in advance). Pick the customer on the voucher,
      or press <strong>Link</strong> here, and it is counted under that customer.
    </div>

    <!-- What each department's customers were paid, and what nobody claims yet -->
    <v-row dense class="mb-4">
      <v-col cols="12" sm="4" class="d-flex">
        <v-card variant="tonal" color="primary" rounded="lg" class="pa-4 flex-grow-1">
          <div class="text-body-2 font-weight-medium mb-1">In-House customers</div>
          <div class="text-h6 font-weight-bold">{{ formatCurrency(inhouseTotals.total) }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ inhouseTotals.count }} vouchers · advances {{ formatCurrency(inhouseTotals.advance) }}
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4" class="d-flex">
        <v-card variant="tonal" color="info" rounded="lg" class="pa-4 flex-grow-1">
          <div class="text-body-2 font-weight-medium mb-1">Ethical customers</div>
          <div class="text-h6 font-weight-bold">{{ formatCurrency(ethicalTotals.total) }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ ethicalTotals.count }} vouchers · advances {{ formatCurrency(ethicalTotals.advance) }}
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4" class="d-flex">
        <v-card
          variant="tonal" color="warning" rounded="lg" class="pa-4 flex-grow-1"
          style="cursor: pointer"
          @click="departmentFilter = 'unlinked'"
        >
          <div class="text-body-2 font-weight-medium mb-1">Not linked to a customer</div>
          <div class="text-h6 font-weight-bold">{{ formatCurrency(unlinkedTotals.total) }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ unlinkedTotals.count }} vouchers to link · click to show them
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Filters -->
    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-text-field
        v-model="search"
        density="compact" variant="outlined" hide-details clearable
        placeholder="Search DV no., payee, customer, particulars…"
        prepend-inner-icon="mdi-magnify"
        style="max-width: 320px; min-width: 240px"
      />
      <v-select
        v-model="departmentFilter"
        :items="departmentFilterOptions"
        density="compact" variant="outlined" hide-details
        style="max-width: 240px; min-width: 200px"
      />
      <v-select
        v-model="statuses"
        :items="voucherStatusOptions"
        label="Voucher status"
        multiple chips closable-chips
        density="compact" variant="outlined" hide-details
        style="max-width: 360px; min-width: 240px"
      />
      <v-text-field
        v-model="dateFrom" type="date" label="From" :max="dateTo || undefined"
        density="compact" variant="outlined" hide-details clearable
        style="max-width: 180px; min-width: 160px"
      />
      <v-text-field
        v-model="dateTo" type="date" label="To" :min="dateFrom || undefined"
        density="compact" variant="outlined" hide-details clearable
        style="max-width: 180px; min-width: 160px"
      />
    </div>

    <!-- Per customer; a click narrows the voucher list below to that customer -->
    <div v-if="departmentFilter !== 'unlinked'" class="mb-6">
      <div class="text-subtitle-1 font-weight-bold mb-2">By customer</div>
      <v-data-table
        :headers="customerHeaders"
        :items="byCustomer"
        :loading="loading"
        :items-per-page-options="financePageSizes"
        items-per-page="10"
        density="compact"
        mobile-breakpoint="md"
        hover
        no-data-text="No rebate vouchers are linked to a customer yet."
        @click:row="pickCustomer"
      >
        <template #item.customer_name="{ item }">
          <span class="font-weight-medium" :class="{ 'text-primary': customerFilter === item.customer_id }">
            {{ item.customer_name }}
          </span>
        </template>
        <template #item.department="{ item }">
          <v-chip v-if="item.department" size="x-small" label variant="tonal">
            {{ departmentLabels[item.department] }}
          </v-chip>
        </template>
        <template #item.advance="{ item }">{{ formatCurrency(item.advance) }}</template>
        <template #item.earned="{ item }">{{ formatCurrency(item.earned) }}</template>
        <template #item.total="{ item }">
          <span class="font-weight-bold">{{ formatCurrency(item.total) }}</span>
        </template>
      </v-data-table>
    </div>

    <div class="d-flex align-center flex-wrap ga-2 mb-2">
      <span class="text-subtitle-1 font-weight-bold">Vouchers</span>
      <v-chip
        v-if="customerFilter !== null"
        size="small" closable label color="primary" variant="tonal"
        @click:close="showCustomer(null)"
      >
        {{ customerFilterName }}
      </v-chip>
      <v-spacer />
      <span class="text-body-2">
        {{ listTotals.count }} {{ listTotals.count === 1 ? 'voucher' : 'vouchers' }} —
        <strong>{{ formatCurrency(listTotals.total) }}</strong>
      </span>
    </div>

    <v-data-table
      :headers="voucherHeaders"
      :items="rows"
      :loading="loading"
      :items-per-page-options="financePageSizes"
      items-per-page="10"
      density="compact"
      mobile-breakpoint="md"
      hover
      no-data-text="No rebate vouchers match these filters."
    >
      <template #item.dv_no="{ item }">
        <span class="font-weight-medium text-no-wrap">{{ item.dv_no ?? '—' }}</span>
      </template>
      <template #item.date="{ item }">
        <span class="text-no-wrap">{{ formatDateOnly(item.date ? `${item.date}T12:00:00+08:00` : null) }}</span>
      </template>
      <template #item.payee="{ item }">
        <div>{{ item.payee ?? '—' }}</div>
        <div class="text-caption text-medium-emphasis text-truncate" style="max-width: 280px">{{ item.particulars }}</div>
      </template>
      <template #item.customer_name="{ item }">
        <template v-if="item.customer_id !== null">
          <div class="font-weight-medium">{{ item.customer_name }}</div>
          <div v-if="item.department" class="text-caption text-medium-emphasis">{{ departmentLabels[item.department] }}</div>
        </template>
        <v-chip v-else size="x-small" color="warning" variant="tonal" label>Not linked</v-chip>
      </template>
      <template #item.advance="{ item }">{{ item.advance ? formatCurrency(item.advance) : '—' }}</template>
      <template #item.earned="{ item }">{{ item.earned ? formatCurrency(item.earned) : '—' }}</template>
      <template #item.status="{ item }">
        <v-chip size="x-small" label variant="tonal" :color="statusColor[item.status]">
          {{ item.status.toUpperCase() }}
        </v-chip>
      </template>
      <template #item.actions="{ item }">
        <v-btn
          size="small"
          variant="tonal"
          :color="item.customer_id === null ? 'primary' : undefined"
          class="text-none"
          :prepend-icon="item.customer_id === null ? 'mdi-link-variant' : 'mdi-pencil-outline'"
          @click="openLink(item)"
        >
          {{ item.customer_id === null ? 'Link' : 'Change' }}
        </v-btn>
      </template>
    </v-data-table>

    <v-dialog v-model="showLinkDialog" max-width="520" persistent>
      <v-card rounded="lg">
        <v-card-title class="pa-5 text-h6 font-weight-bold">
          Which customer is {{ linkTarget?.dv_no ?? 'this voucher' }} for?
        </v-card-title>
        <v-card-text class="pa-5 pt-0">
          <p class="text-body-2 mb-1">
            Payee: <strong>{{ linkTarget?.payee ?? '—' }}</strong>
          </p>
          <p class="text-body-2 text-medium-emphasis mb-4">{{ linkTarget?.particulars }}</p>
          <v-autocomplete
            v-model="linkCustomerId"
            :items="customerOptions"
            label="Customer"
            placeholder="Type the customer's name"
            variant="outlined"
            density="comfortable"
            clearable
            auto-select-first
            hide-details="auto"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle" />
            </template>
          </v-autocomplete>
          <div class="text-caption text-medium-emphasis mt-2">
            Only a label: it changes no amount or account and posts nothing. Not on the list?
            Add the customer in In-House or Ethical first. Clear it to unlink.
          </div>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="cancelLink">Cancel</v-btn>
          <v-btn
            color="primary" variant="flat" class="text-none font-weight-bold"
            :loading="linking"
            :disabled="linkCustomerId === (linkTarget?.customer_id ?? null)"
            @click="confirmLink"
          >
            {{ linkCustomerId === null ? 'Unlink' : 'Save' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
