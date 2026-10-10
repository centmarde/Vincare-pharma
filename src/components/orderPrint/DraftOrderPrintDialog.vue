<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { useDraftOrderPrint } from './useDraftOrderPrint'
import type { DraftPrintDocument } from './useDraftOrderPrint'
import { formatCurrency, formatDatePR_ISO, formatExpiryMonthYear } from '@/utils/helpers'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  document: DraftPrintDocument | null
  /**
   * Offer the "include cost & margin" switch. Only where the screen it is
   * opened from already shows company cost (In-House). Ethical hides cost from
   * selling staff on purpose, so its printout must not reveal it either.
   */
  allowCost?: boolean
}>()

const { mobile } = useDisplay()
const printArea = ref<HTMLElement | null>(null)

const {
  companyKey, company, companyOptions, includeCost, loadingProducts,
  rows, subtotal, discount, total, missingCost, totalCost, margin, marginPct, meta, missingDetails,
  downloadPdf,
} = useDraftOrderPrint(() => props.document, open, () => !!props.allowCost)

const heading = computed(() => (includeCost.value ? 'DRAFT ORDER — INTERNAL COPY' : 'DRAFT ORDER'))
</script>

<template>
  <v-dialog v-model="open" max-width="960" scrollable :fullscreen="mobile">
    <v-card v-if="document" rounded="lg">
      <v-card-title class="d-flex align-center ga-2 flex-wrap pa-4 pb-2">
        <span>Print Draft</span>
        <v-spacer />
        <v-select
          v-model="companyKey"
          :items="companyOptions"
          label="Letterhead"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 240px"
        />
      </v-card-title>
      <v-card-text class="pa-4 pt-0">
        <!-- Off by default and reset on every open, so a customer copy never
             carries our cost by accident. -->
        <v-switch
          v-if="allowCost"
          v-model="includeCost"
          color="warning"
          density="compact"
          hide-details
          inset
          label="Include cost & margin (internal copy — do not give to the customer)"
          class="mb-2"
        />
        <v-alert v-if="document.notice" type="info" variant="tonal" density="compact" class="mb-3 text-body-2">
          {{ document.notice }}
        </v-alert>
        <v-alert v-if="missingDetails" type="warning" variant="tonal" density="compact" class="mb-3 text-body-2">
          Batch and expiry could not be loaded for {{ missingDetails }} line(s). Close and reopen to retry.
        </v-alert>
        <v-progress-linear v-if="loadingProducts" indeterminate class="mb-2" />

        <div ref="printArea" class="draft-print">
          <div class="text-center mb-3">
            <div class="text-h5 font-weight-bold" style="letter-spacing: 2px">{{ company.name }}</div>
            <div class="text-caption">{{ company.line1 }}</div>
            <div class="text-caption">{{ company.line2 }}</div>
            <div v-if="company.license" class="text-caption">{{ company.license }}</div>
            <div class="text-caption">{{ company.contact }}</div>
          </div>

          <div class="text-center text-h6 font-weight-bold" style="letter-spacing: 2px">{{ heading }}</div>
          <div class="draft-stamp text-center mb-3">DRAFT — NOT AN INVOICE · PRICES AND QUANTITIES SUBJECT TO CONFIRMATION</div>

          <v-row no-gutters class="mb-2">
            <v-col cols="12" sm="7">
              <div class="text-body-2"><strong>Draft #</strong> {{ document.docNo ?? 'Not yet numbered' }}</div>
              <div class="text-caption font-weight-bold mt-2">Customer:</div>
              <div class="text-body-2 font-weight-medium">{{ document.customer?.name || '—' }}</div>
              <div v-if="document.customer?.address" class="text-body-2">{{ document.customer.address }}</div>
              <div v-if="document.customer?.contact_no" class="text-body-2">Contact: {{ document.customer.contact_no }}</div>
              <div v-if="document.customer?.tin_number" class="text-body-2">TIN: {{ document.customer.tin_number }}</div>
            </v-col>
            <v-col cols="12" sm="5" class="text-left text-sm-right mt-2 mt-sm-0">
              <div class="text-body-2">Date: {{ formatDatePR_ISO(document.date ?? new Date().toISOString()) }}</div>
              <div v-for="m in meta" :key="m.label" class="text-body-2">{{ m.label }}: {{ m.value }}</div>
            </v-col>
          </v-row>

          <table class="draft-table">
            <thead>
              <tr>
                <th class="text-left">Product</th>
                <th class="text-left">SKU</th>
                <th class="text-left">Batch</th>
                <th class="text-left">Expiry</th>
                <th class="text-left">Unit</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Price</th>
                <th class="text-right">Amount</th>
                <th v-if="includeCost" class="text-right">Cost/Unit</th>
                <th v-if="includeCost" class="text-right">Line Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in rows" :key="`${row.product_id}-${i}`">
                <td>{{ row.product_name || '—' }}</td>
                <td>{{ row.sku ?? '—' }}</td>
                <td>{{ row.batch_no ?? '—' }}</td>
                <td>{{ formatExpiryMonthYear(row.expiry_date) }}</td>
                <td>{{ row.unit ?? '—' }}</td>
                <td class="text-right">{{ row.qty }}</td>
                <td class="text-right">{{ formatCurrency(row.unit_price) }}</td>
                <td class="text-right">{{ formatCurrency(row.amount) }}</td>
                <td v-if="includeCost" class="text-right">
                  {{ row.cost_price != null ? formatCurrency(row.cost_price) : '—' }}
                </td>
                <td v-if="includeCost" class="text-right">
                  {{ row.line_cost != null ? formatCurrency(row.line_cost) : '—' }}
                </td>
              </tr>
              <tr v-if="!rows.length">
                <td :colspan="includeCost ? 10 : 8" class="text-center">No products on this draft yet.</td>
              </tr>
            </tbody>
          </table>

          <div class="d-flex justify-end mt-3">
            <div style="min-width: 260px">
              <div class="d-flex justify-space-between text-body-2"><span>Subtotal:</span><span>{{ formatCurrency(subtotal) }}</span></div>
              <div v-if="discount" class="d-flex justify-space-between text-body-2"><span>Discount:</span><span>-{{ formatCurrency(discount) }}</span></div>
              <div class="d-flex justify-space-between text-body-1 font-weight-bold mt-1"><span>Total:</span><span>{{ formatCurrency(total) }}</span></div>
              <template v-if="includeCost">
                <div class="d-flex justify-space-between text-body-2 mt-2"><span>Total cost:</span><span>{{ formatCurrency(totalCost) }}</span></div>
                <div class="d-flex justify-space-between text-body-2 font-weight-bold">
                  <span>Margin:</span><span>{{ formatCurrency(margin) }} ({{ marginPct.toFixed(1) }}%)</span>
                </div>
                <div v-if="missingCost" class="text-caption">Lines with no recorded cost are left out of the margin.</div>
              </template>
            </div>
          </div>

          <div v-if="document.remarks" class="text-body-2 mt-3"><strong>Remarks:</strong> {{ document.remarks }}</div>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" class="text-none" @click="open = false">Close</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="text-none"
          prepend-icon="mdi-printer"
          :disabled="loadingProducts || !rows.length"
          @click="downloadPdf(printArea)"
        >
          Download PDF
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.draft-print {
  background: #ffffff;
  color: #000000;
  padding: 16px;
}
.draft-stamp {
  border: 2px solid #000000;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 4px;
}
.draft-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.draft-table th,
.draft-table td {
  border-bottom: 1px solid #cccccc;
  padding: 4px 6px;
}
.draft-table th {
  border-bottom: 2px solid #000000;
}
</style>
