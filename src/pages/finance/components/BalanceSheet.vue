<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useBalanceSheet } from '../composables/useBalanceSheet'
import { formatCurrency } from '@/utils/helpers'

const { asOf, sheet, loading, tiesOut, load } = useBalanceSheet()

const assetSections = computed(() => sheet.value?.sections.filter((s) => s.class === 'asset') ?? [])
const liabilitySections = computed(() => sheet.value?.sections.filter((s) => s.class === 'liability') ?? [])
const equitySections = computed(() => sheet.value?.sections.filter((s) => s.class === 'equity') ?? [])

onMounted(load)
</script>

<template>
  <v-container fluid pa-0>
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center gap-2 pb-2 flex-wrap">
        <span>Balance Sheet</span>
        <v-chip v-if="sheet" :color="tiesOut ? 'success' : 'error'" size="small" label class="ml-2">
          {{ tiesOut ? 'Balanced ✓' : 'OUT OF BALANCE' }}
        </v-chip>
        <v-spacer />
        <v-text-field
          v-model="asOf" type="date" label="As of" density="compact" variant="outlined"
          hide-details style="max-width: 180px" @update:model-value="load" />
      </v-card-title>

      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate class="mb-2" />

        <template v-if="sheet">
          <div class="text-subtitle-1 font-weight-bold mb-2">Assets</div>
          <div v-for="section in assetSections" :key="section.subsection" class="mb-3">
            <div class="text-body-2 font-weight-medium text-medium-emphasis mb-1">{{ section.subsection }}</div>
            <v-table density="compact">
              <tbody>
                <tr v-for="a in section.accounts" :key="a.code">
                  <td>{{ a.name }}</td>
                  <td class="text-right" style="width: 160px">{{ formatCurrency(a.amount) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="font-weight-medium" style="border-top: 1px solid #ccc">
                  <td>Total {{ section.subsection }}</td>
                  <td class="text-right">{{ formatCurrency(section.subtotal) }}</td>
                </tr>
              </tfoot>
            </v-table>
          </div>
          <div class="d-flex justify-space-between font-weight-bold text-h6 mb-4" style="border-top: 2px solid currentColor">
            <span>Total Assets</span><span>{{ formatCurrency(sheet.totalAssets) }}</span>
          </div>

          <div class="text-subtitle-1 font-weight-bold mb-2">Liabilities</div>
          <div v-for="section in liabilitySections" :key="section.subsection" class="mb-3">
            <div class="text-body-2 font-weight-medium text-medium-emphasis mb-1">{{ section.subsection }}</div>
            <v-table density="compact">
              <tbody>
                <tr v-for="a in section.accounts" :key="a.code">
                  <td>{{ a.name }}</td>
                  <td class="text-right" style="width: 160px">{{ formatCurrency(a.amount) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="font-weight-medium" style="border-top: 1px solid #ccc">
                  <td>Total {{ section.subsection }}</td>
                  <td class="text-right">{{ formatCurrency(section.subtotal) }}</td>
                </tr>
              </tfoot>
            </v-table>
          </div>
          <div class="d-flex justify-space-between font-weight-bold mb-4">
            <span>Total Liabilities</span><span>{{ formatCurrency(sheet.totalLiabilities) }}</span>
          </div>

          <div class="text-subtitle-1 font-weight-bold mb-2">Equity</div>
          <div v-for="section in equitySections" :key="section.subsection" class="mb-2">
            <v-table density="compact">
              <tbody>
                <tr v-for="a in section.accounts" :key="a.code">
                  <td>{{ a.name }}</td>
                  <td class="text-right" style="width: 160px">{{ formatCurrency(a.amount) }}</td>
                </tr>
                <tr>
                  <td>Current Year Earnings</td>
                  <td class="text-right">{{ formatCurrency(sheet.currentYearEarnings) }}</td>
                </tr>
              </tbody>
            </v-table>
          </div>
          <div class="d-flex justify-space-between font-weight-bold mb-2" style="border-top: 1px solid #ccc">
            <span>Total Equity</span><span>{{ formatCurrency(sheet.totalEquity) }}</span>
          </div>

          <v-divider class="my-3" />
          <div class="d-flex justify-space-between font-weight-bold text-h6">
            <span>Total Liabilities + Equity</span>
            <span>{{ formatCurrency(sheet.totalLiabilities + sheet.totalEquity) }}</span>
          </div>
        </template>

        <div v-else-if="!loading" class="text-center text-caption text-medium-emphasis py-4">
          No data as of this date.
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>
