<script setup lang="ts">
import { ref, nextTick } from 'vue'
import html2pdf from 'html2pdf.js'
import { useToast } from 'vue-toastification'
import type { EthicalOrderType } from '@/stores/ethicalData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const props = defineProps<{
  modelValue: boolean
  order: EthicalOrderType | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const toast = useToast()
const printArea = ref<HTMLElement | null>(null)

// Same legal entity as the POS receipt (src/pages/sales/dialogs/PosReceiptDialog.vue) —
// Ethical is a department of VinCare/Exelmed, not a separate company.
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
  if (!el || !props.order) return

  el.querySelectorAll('div, td, th, span, p').forEach((child) => {
    ;(child as HTMLElement).style.color = '#000000'
  })

  await html2pdf()
    .set({
      margin:      10,
      filename:    `${props.order.order_no}.pdf`,
      image:       { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(el)
    .save()

  toast.success(`${props.order.order_no} invoice generated.`)
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="800"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg" v-if="order">
      <v-card-text class="pa-6">
        <div ref="printArea" class="invoice">
          <!-- Header -->
          <div class="text-center mb-4">
            <div class="text-h5 font-weight-bold" style="letter-spacing: 2px;">{{ company.name }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.line1 }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.line2 }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.license }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.contact }}</div>
          </div>

          <div class="text-center text-h6 font-weight-bold mb-4" style="letter-spacing: 2px;">
            SALES INVOICE
          </div>

          <!-- Meta: invoice # + customer | date + agent + terms -->
          <v-row class="mb-2" no-gutters>
            <v-col cols="7">
              <div class="text-body-2"><span class="font-weight-bold">Invoice #</span> {{ order.order_no }}</div>
              <div class="text-caption font-weight-bold mt-2">Bill To:</div>
              <div class="text-body-2 font-weight-medium">{{ order.customer?.name || '—' }}</div>
              <div class="text-body-2" v-if="order.customer?.address">{{ order.customer.address }}</div>
              <div class="text-body-2" v-if="order.customer?.contact_no">Contact: {{ order.customer.contact_no }}</div>
              <div class="text-body-2 mt-1">
                <span class="font-weight-bold">TIN:</span> {{ order.customer?.tin_number || '—' }}
                <span class="ml-2">{{ order.customer?.is_vat_registered ? 'VAT-Registered' : 'Non-VAT' }}</span>
              </div>
              <div
                class="text-body-2"
                v-if="order.customer?.business_structure === 'sole_proprietorship' ? order.customer?.dti_registration_no : order.customer?.sec_registration_no"
              >
                <span class="font-weight-bold">{{ order.customer?.business_structure === 'sole_proprietorship' ? 'DTI Reg. No.:' : 'SEC Reg. No.:' }}</span>
                {{ order.customer?.business_structure === 'sole_proprietorship' ? order.customer?.dti_registration_no : order.customer?.sec_registration_no }}
              </div>
            </v-col>
            <v-col cols="5" class="text-right">
              <div class="text-body-2">Date: {{ formatDatePR_ISO(order.created_at) }}</div>
              <div class="text-body-2" v-if="order.agent?.name">Medical Sales Representative: {{ order.agent.name }}</div>
              <div class="text-body-2" v-if="order.terms_days">Terms: Net {{ order.terms_days }} days</div>
              <div class="text-body-2" v-if="order.due_date">Due: {{ formatDatePR_ISO(order.due_date) }}</div>
            </v-col>
          </v-row>

          <v-divider class="my-3" />

          <!-- Line items -->
          <v-table density="compact" class="invoice-table">
            <thead>
              <tr>
                <th class="text-left">Product</th>
                <th class="text-right">Quantity</th>
                <th class="text-right">Unit Price</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in order.items" :key="item.id">
                <td>{{ item.product?.product_name ?? '—' }}</td>
                <td class="text-right">{{ item.quantity }}</td>
                <td class="text-right">{{ formatCurrency(item.unit_price) }}</td>
                <td class="text-right">{{ formatCurrency(item.line_total) }}</td>
              </tr>
            </tbody>
          </v-table>

          <v-divider class="my-3" />

          <!-- Totals -->
          <v-row no-gutters>
            <v-col cols="7" />
            <v-col cols="5">
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span>Subtotal:</span><span>{{ formatCurrency(order.subtotal ?? 0) }}</span>
              </div>
              <div class="d-flex justify-space-between text-body-2 mb-1" v-if="order.discount_amount">
                <span>Discount:</span><span>-{{ formatCurrency(order.discount_amount) }}</span>
              </div>
              <!-- Rebate is a separate deferred payout to the customer/MSR, NOT an
                   invoice deduction, so it is deliberately omitted from the printed
                   invoice — the invoice total is subtotal − discount only. -->
              <div class="d-flex justify-space-between text-body-1 font-weight-bold mb-1">
                <span>Invoice Total:</span><span>{{ formatCurrency(order.total_amount ?? 0) }}</span>
              </div>
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span>Amount Paid:</span><span>{{ formatCurrency(order.amount_paid ?? 0) }}</span>
              </div>
              <div class="d-flex justify-space-between text-body-2 font-weight-medium">
                <span>Balance Due:</span><span>{{ formatCurrency(Math.max(0, (order.total_amount ?? 0) - (order.amount_paid ?? 0))) }}</span>
              </div>
            </v-col>
          </v-row>

          <!-- Signature -->
          <div class="mt-8">
            <div style="border-bottom: 1px solid #000; width: 260px;" />
            <div class="text-caption mt-1">Received by: Signature Over Printed Name</div>
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
        <v-btn variant="text" color="error" class="text-none" prepend-icon="mdi-printer" @click="handlePrint">
          Print
        </v-btn>
        <v-btn
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          @click="emit('update:modelValue', false)"
        >
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.invoice-table th {
  font-size: 0.8rem !important;
  font-weight: 700 !important;
  border-bottom: 1px solid #ccc;
}
.invoice-table td {
  vertical-align: top;
  padding-top: 6px !important;
  padding-bottom: 6px !important;
}
</style>
