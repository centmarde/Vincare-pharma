<script setup lang="ts">
import { useFinanceDashboard } from '../composables/useFinanceDashboard'
import { formatCurrency } from '@/utils/helpers'

const { pnl, loading, dateFrom, dateTo, applyFilter, clearFilter } = useFinanceDashboard()
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <div class="mx-auto w-100">

      <div class="d-flex align-center gap-2 mb-2">
        <span class="text-h6 font-weight-bold">Cash Flow (management view)</span>
        <v-chip color="grey" size="x-small" label>Cash basis — not the authoritative GL</v-chip>
      </div>
      <div class="text-caption text-medium-emphasis mb-3">
        Revenue recognized when cash is actually received. For accrual-basis financials, see
        Income Statement / Balance Sheet / Trial Balance under Finance Controls.
      </div>

      <!-- Date range filter -->
      <v-row dense class="mb-1">
        <v-col cols="12" sm="4">
          <v-text-field
            v-model="dateFrom"
            type="date"
            label="From"
            density="compact"
            variant="outlined"
            hide-details
            class="date-field-right"
            append-inner-icon="mdi-calendar"
          />
        </v-col>
        <v-col cols="12" sm="4">
          <v-text-field
            v-model="dateTo"
            type="date"
            label="To"
            density="compact"
            variant="outlined"
            hide-details
            class="date-field-right"
            append-inner-icon="mdi-calendar"
          />
        </v-col>
        <v-col cols="12" sm="4" class="d-flex align-center ga-2">
          <v-btn color="primary" variant="flat" :loading="loading" @click="applyFilter">Apply</v-btn>
          <v-btn variant="text" @click="clearFilter">Clear</v-btn>
        </v-col>
      </v-row>

      <!-- P&L cards -->
      <v-row dense class="mb-1">
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Revenue</div>
            <div class="text-h5 font-weight-bold text-success">{{ formatCurrency(pnl?.revenueTotal ?? 0) }}</div>
            <div class="text-caption text-medium-emphasis">POS + Ethical + In-House</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">COGS</div>
            <div class="text-h5 font-weight-bold">{{ formatCurrency(pnl?.cogs ?? 0) }}</div>
            <div class="text-caption text-medium-emphasis">Stock received from suppliers</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Opex</div>
            <div class="text-h5 font-weight-bold">{{ formatCurrency(pnl?.opex ?? 0) }}</div>
            <div class="text-caption text-medium-emphasis">Operational expenses</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card rounded="lg" elevation="1" class="pa-4">
            <div class="text-caption text-medium-emphasis">Net</div>
            <div class="text-h5 font-weight-bold" :class="(pnl?.net ?? 0) >= 0 ? 'text-success' : 'text-error'">
              {{ formatCurrency(pnl?.net ?? 0) }}
            </div>
            <div class="text-caption text-medium-emphasis">Revenue − COGS − Opex</div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Revenue by outlet/department -->
      <v-row dense>
        <v-col cols="12">
          <v-card rounded="lg" elevation="1">
            <v-card-title class="text-subtitle-1 font-weight-bold pa-4">Revenue by Outlet</v-card-title>
            <v-divider />
            <v-table density="compact">
              <thead>
                <tr>
                  <th class="text-left">Outlet</th>
                  <th class="text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in pnl?.byOutlet ?? []" :key="row.outlet">
                  <td>{{ row.outlet }}</td>
                  <td class="text-right">{{ formatCurrency(row.revenue) }}</td>
                </tr>
                <tr v-if="!pnl?.byOutlet?.length">
                  <td colspan="2" class="text-center text-medium-emphasis pa-4">No revenue recorded yet.</td>
                </tr>
              </tbody>
            </v-table>
          </v-card>
        </v-col>
      </v-row>
    </div>
  </v-container>
</template>

<style>
/* ── Date range filter ────────────────────────────────────────────────── */
/* The visible calendar icon is Vuetify's appended mdi-calendar icon, which
   is always pinned to the far right of the field. The native browser icon
   is hidden (opacity 0) but stretched over that same right-side area so
   tapping the icon still opens the native date picker. */
.date-field-right input[type='date'] {
  min-width: 0;
}

.date-field-right input[type='date']::-webkit-calendar-picker-indicator {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 36px; /* roughly the append-icon tap area */
  height: 100%;
  margin: 0;
  padding: 0;
  opacity: 0; /* hide the native icon, keep it clickable */
  cursor: pointer;
}
</style>
