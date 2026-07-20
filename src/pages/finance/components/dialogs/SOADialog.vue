<script setup lang="ts">
import { ref, nextTick } from 'vue'
import html2pdf from 'html2pdf.js'
import { useToast } from 'vue-toastification'
import type { StatementOfAccount } from '@/stores/financeData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const props = defineProps<{
  modelValue: boolean
  loading: boolean
  soa: StatementOfAccount | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const toast = useToast()
const printArea = ref<HTMLElement | null>(null)

// Same legal entity as the POS receipt / Ethical invoice / Delivery Receipt —
// Exelmed is VinCare's printed-document letterhead regardless of department.
const company = {
  name:    'EXELMED PHARMA TRADE',
  line1:   'Ground Floor NB Building, Ochoa Avenue, Butuan City',
  line2:   '8600 Agusan del Norte, Philippines (Tel: 085-3000-460)',
  license: 'License Number: 3000001108883 - VAT Reg: TIN: 178-845-363-000',
  contact: 'Mobile: 09090734525 - Email Address: exelmedshop@gmail.com',
} as const

async function handlePrint() {
  await nextTick()
  const el = printArea.value
  if (!el || !props.soa) return

  el.querySelectorAll('div, td, th, span, p').forEach((child) => {
    ;(child as HTMLElement).style.color = '#000000'
  })

  await html2pdf()
    .set({
      margin:      10,
      filename:    `SOA-${props.soa.customer_name ?? props.soa.customer_id}.pdf`,
      image:       { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(el)
    .save()

  toast.success('Statement of Account generated.')
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="800"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <div v-if="loading" class="pa-6 text-center text-caption text-medium-emphasis">
        Generating statement...
      </div>
      <div v-else-if="!soa" class="pa-6 text-center text-caption text-medium-emphasis">
        Statement not found.
      </div>

      <v-card-text v-else class="pa-6">
        <div ref="printArea" class="soa">
          <!-- Header -->
          <div class="text-center mb-4">
            <div class="text-h5 font-weight-bold" style="letter-spacing: 2px;">{{ company.name }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.line1 }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.line2 }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.license }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.contact }}</div>
          </div>

          <div class="text-center text-h6 font-weight-bold mb-4" style="letter-spacing: 2px;">
            STATEMENT OF ACCOUNT
          </div>

          <!-- Meta -->
          <v-row class="mb-2" no-gutters>
            <v-col cols="7">
              <div class="text-caption font-weight-bold">Customer:</div>
              <div class="text-body-2 font-weight-medium">{{ soa.customer_name ?? '—' }}</div>
              <div class="text-body-2" v-if="soa.customer_address">{{ soa.customer_address }}</div>
              <div class="text-body-2" v-if="soa.customer_contact">Contact: {{ soa.customer_contact }}</div>
              <div class="text-body-2" v-if="soa.customer_tin">TIN: {{ soa.customer_tin }}</div>
            </v-col>
            <v-col cols="5" class="text-right">
              <div class="text-body-2">As of: {{ formatDatePR_ISO(soa.generated_at) }}</div>
              <div class="text-body-2">{{ soa.source === 'ethical_order' ? 'Ethical Department' : 'In-House / Government' }}</div>
            </v-col>
          </v-row>

          <v-divider class="my-3" />

          <!-- Ledger -->
          <v-table density="compact" class="soa-table">
            <thead>
              <tr>
                <th class="text-left">Date</th>
                <th class="text-left">Reference</th>
                <th class="text-left">Description</th>
                <th class="text-right">Charge</th>
                <th class="text-right">Payment</th>
                <th class="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(e, i) in soa.entries" :key="i">
                <td>{{ formatDatePR_ISO(e.date) }}</td>
                <td>{{ e.reference_no ?? '—' }}</td>
                <td>{{ e.description }}</td>
                <td class="text-right">{{ e.charge > 0 ? formatCurrency(e.charge) : '' }}</td>
                <td class="text-right">{{ e.payment > 0 ? formatCurrency(e.payment) : '' }}</td>
                <td class="text-right">{{ formatCurrency(e.running_balance) }}</td>
              </tr>
              <tr v-if="!soa.entries.length">
                <td colspan="6" class="text-center text-caption text-medium-emphasis py-3">No activity on record.</td>
              </tr>
            </tbody>
          </v-table>

          <v-divider class="my-3" />

          <!-- Totals -->
          <v-row no-gutters>
            <v-col cols="7" />
            <v-col cols="5">
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span>Total Charges:</span><span>{{ formatCurrency(soa.totalCharges) }}</span>
              </div>
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span>Total Payments:</span><span>{{ formatCurrency(soa.totalPayments) }}</span>
              </div>
              <div class="d-flex justify-space-between text-body-1 font-weight-bold">
                <span>Ending Balance:</span><span>{{ formatCurrency(soa.endingBalance) }}</span>
              </div>
            </v-col>
          </v-row>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
        <v-btn variant="text" color="error" class="text-none" prepend-icon="mdi-printer" :disabled="!soa" @click="handlePrint">
          Print / Save PDF
        </v-btn>
        <v-btn color="primary" class="text-none font-weight-bold" elevation="0" @click="emit('update:modelValue', false)">
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.soa-table th {
  font-size: 0.8rem !important;
  font-weight: 700 !important;
  border-bottom: 1px solid #ccc;
}
.soa-table td {
  vertical-align: top;
  padding-top: 6px !important;
  padding-bottom: 6px !important;
}
</style>
