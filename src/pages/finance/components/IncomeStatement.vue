<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useIncomeStatement } from '../composables/useIncomeStatement'
import { formatDatePR_ISO } from '@/utils/helpers'
import { useDisplay } from 'vuetify'
import StatementBody from './StatementBody.vue'
import IncomeStatementPrintDialog from './dialogs/IncomeStatementPrintDialog.vue'

const { mobile } = useDisplay()

const {
  dateFrom, dateTo, basis, layout, basisOptions, layoutOptions,
  isCash, isMonthly, monthLabel,
  cashStatement, monthly, monthlyCash, periodRows, monthlyRows,
  loading, error, load, setBasis, setLayout,
} = useIncomeStatement()

const title = computed(() => (isCash.value ? 'CASH RECEIVED & PAID' : 'INCOME STATEMENT'))
const basisLine = computed(() =>
  isCash.value ? 'Cash basis — management view' : 'Accrual basis',
)
const periodLine = computed(
  () => `For the period ${formatDatePR_ISO(dateFrom.value)} to ${formatDatePR_ISO(dateTo.value)}`,
)

const showPrint = ref(false)
</script>

<template>
  <v-container fluid class="pa-2">
    <!-- ── Controls ───────────────────────────────────────────────
         Kept OUT of the statement itself: the sheet below is the document, and
         toolbars inside it are what made this read like a screen instead. -->
    <v-card rounded="lg" class="mx-auto w-100 mb-3">
      <v-card-text class="pa-3 pa-sm-4 d-flex align-center flex-wrap ga-2">
        <v-btn-toggle
          :model-value="layout"
          mandatory
          density="compact"
          color="primary"
          variant="outlined"
          @update:model-value="setLayout"
        >
          <v-btn v-for="l in layoutOptions" :key="l.value" :value="l.value" size="small" class="text-none">
            {{ l.title }}
          </v-btn>
        </v-btn-toggle>

        <v-btn-toggle
          :model-value="basis"
          mandatory
          density="compact"
          color="primary"
          variant="outlined"
          @update:model-value="setBasis"
        >
          <v-btn v-for="b in basisOptions" :key="b.value" :value="b.value" size="small" class="text-none">
            {{ b.title }}
          </v-btn>
        </v-btn-toggle>

        <v-btn
          color="primary"
          variant="flat"
          class="text-none font-weight-bold"
          prepend-icon="mdi-printer"
          size="small"
          @click="showPrint = true"
        >
          Print
        </v-btn>

        <v-spacer v-if="!mobile" />

        <v-text-field
          v-model="dateFrom"
          type="date"
          label="From"
          density="compact"
          variant="outlined"
          hide-details
          :style="mobile ? 'width: 100%' : 'max-width: 165px'"
          @update:model-value="load"
        />
        <v-text-field
          v-model="dateTo"
          type="date"
          label="To"
          density="compact"
          variant="outlined"
          hide-details
          :style="mobile ? 'width: 100%' : 'max-width: 165px'"
          @update:model-value="load"
        />
      </v-card-text>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate class="mb-2" />

    <!-- A failed fetch clears the statement, so without this the sheet would
         read "nothing posted in this period" — which is a claim about the
         business, not about the request that failed. -->
    <v-alert
      v-if="error && !loading"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-3 text-body-2"
    >
      {{ error }} — the figures below are not available for this period. Adjust the
      dates or try again; nothing has been read from the ledger.
    </v-alert>

    <!-- ── The statement sheet ────────────────────────────────────
         Narrow and centred for the single-period view, full width when there
         are month columns to compare. -->
    <v-card rounded="lg" class="mx-auto w-100 statement-sheet">
      <v-card-text class="pa-5 pa-sm-8">
        <StatementBody
          :title="title"
          :period-line="periodLine"
          :basis-line="basisLine"
          :is-cash="isCash"
          :is-monthly="isMonthly"
          :period-rows="periodRows"
          :monthly-rows="monthlyRows"
          :monthly="monthly"
          :cash-statement="cashStatement"
          :monthly-cash="monthlyCash"
          :month-label="monthLabel"
        />
      </v-card-text>
    </v-card>

    <IncomeStatementPrintDialog
      v-model="showPrint"
      :title="title"
      :period-line="periodLine"
      :basis-line="basisLine"
      :is-cash="isCash"
      :is-monthly="isMonthly"
      :period-rows="periodRows"
      :monthly-rows="monthlyRows"
      :monthly="monthly"
      :cash-statement="cashStatement"
      :monthly-cash="monthlyCash"
      :month-label="monthLabel"
    />
  </v-container>
</template>

<style scoped>
.statement-sheet {
  background: rgb(var(--v-theme-surface));
}
</style>
