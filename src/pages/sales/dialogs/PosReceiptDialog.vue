<script setup lang="ts">
import type { Receipt } from '../composables/usePosCheckout'
import { formatCurrency } from '@/utils/helpers'
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'
import { computed, nextTick, ref } from 'vue'
import { companyFor, companyOptions, defaultCompanyFor } from '@/utils/companyProfiles'
import type { CompanyKey } from '@/utils/companyProfiles'
import html2pdf from 'html2pdf.js'

const { mobile } = useDisplay()
const props = defineProps<{
  modelValue: boolean
  receipt: Receipt | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const toast = useToast()
const printArea = ref<HTMLElement | null>(null)

// Exelmed Pharma Trade — from the official delivery receipt.
const companyKey = ref<CompanyKey>(defaultCompanyFor('pos_receipt'))
const company = computed(() => companyFor(companyKey.value))

function formatReceiptDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function handlePrint() {
  await nextTick()
  const el = printArea.value
  if (!el || !props.receipt) return

  el.querySelectorAll('div, td, th, span, p').forEach((child) => {
    ;(child as HTMLElement).style.color = '#000000'
  })

  await html2pdf()
    .set({
      margin:      10,
      filename:    `${props.receipt.sale_no}.pdf`,
      image:       { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(el)
    .save()

  toast.success(`${props.receipt.sale_no} receipt generated.`)
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="800"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg" v-if="receipt">
      <v-card-text class="pa-4 pa-sm-6">
        <div ref="printArea" class="receipt">
          <!-- Header -->
          <div class="text-center mb-4">
            <div class="text-h5 font-weight-bold" style="letter-spacing: 2px;">{{ company.name }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.line1 }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.line2 }}</div>
            <div v-if="company.license" class="text-caption text-medium-emphasis">{{ company.license }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.contact }}</div>
          </div>

          <div class="text-center text-h6 font-weight-bold mb-4" style="letter-spacing: 2px;">
            DELIVERY RECEIPT
          </div>

          <!-- Meta: SI # + customer | date + prepared by -->
          <v-row class="mb-2" no-gutters>
            <v-col cols="12" sm="7">
              <div class="text-body-2"><span class="font-weight-bold">SI #</span> {{ receipt.sale_no }}</div>
              <div class="text-caption font-weight-bold mt-2">Customer:</div>
              <div class="text-body-2 font-weight-medium">{{ receipt.customer.name || '—' }}</div>
              <div class="text-body-2" v-if="receipt.customer.address">{{ receipt.customer.address }}</div>
              <div class="text-body-2" v-if="receipt.customer.mobile">Mobile: {{ receipt.customer.mobile }}</div>
              <div class="text-body-2 mt-2">
                <span class="font-weight-bold">Prepared By:</span> {{ receipt.cashier }}
              </div>
            </v-col>
            <v-col cols="12" sm="5" class="text-left text-sm-right mt-2 mt-sm-0">
              <div class="text-body-2">Date {{ formatReceiptDate(receipt.date) }}</div>
            </v-col>
          </v-row>

          <v-divider class="my-3" />

          <!-- Line items -->
          <v-table density="compact" class="receipt-table">
            <thead>
              <tr>
                <th class="text-left">Product</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Price</th>
                <th class="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, i) in receipt.lines" :key="i">
                <td>
                  <div class="font-weight-medium">{{ line.product_name }}</div>
                  <div class="text-caption text-medium-emphasis" v-if="line.batch_no || line.expiry_date">
                    <span v-if="line.batch_no">Lot: {{ line.batch_no }}</span>
                    <span v-if="line.batch_no && line.expiry_date"> , </span>
                    <span v-if="line.expiry_date">Expiry: {{ line.expiry_date }}</span>
                  </div>
                </td>
                <td class="text-right">{{ line.quantity }} {{ line.unit ?? '' }}</td>
                <td class="text-right">{{ formatCurrency(line.unit_price) }}</td>
                <td class="text-right">{{ formatCurrency(line.line_total) }}</td>
              </tr>
            </tbody>
          </v-table>

          <v-divider class="my-3" />

          <!-- Totals -->
          <v-row no-gutters>
            <v-col cols="12" sm="7" />
            <v-col cols="12" sm="5">
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span>Subtotal:</span><span>Php {{ formatCurrency(receipt.subtotal).replace('₱', '') }}</span>
              </div>
              <div class="d-flex justify-space-between text-body-1 font-weight-bold mb-1">
                <span>Total:</span><span>Php {{ formatCurrency(receipt.total).replace('₱', '') }}</span>
              </div>
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span>Cash Tendered:</span><span>Php {{ formatCurrency(receipt.tendered).replace('₱', '') }}</span>
              </div>
              <div class="d-flex justify-space-between text-body-2 font-weight-medium">
                <span>Change:</span><span>Php {{ formatCurrency(receipt.change).replace('₱', '') }}</span>
              </div>
            </v-col>
          </v-row>

          <!-- Received by -->
          <div class="mt-8">
            <div style="border-bottom: 1px solid #000; width: 100%; max-width: 260px;" />
            <div class="text-caption mt-1">Received by: Signature Over Printed Name</div>
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-4 px-sm-5 pb-4 pb-sm-5 pt-3 d-flex ga-2" :class="mobile ? 'flex-column-reverse' : 'justify-end'">
        <v-select
          v-model="companyKey"
          :items="companyOptions"
          label="Issuing company"
          variant="outlined"
          density="compact"
          hide-details
          class="flex-grow-0 mr-auto"
          style="max-width: 230px"
        />
        <v-btn variant="text" color="error" class="text-none" prepend-icon="mdi-printer" :block="mobile" @click="handlePrint">
          Print
        </v-btn>
        <v-btn
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          :block="mobile"
          @click="emit('update:modelValue', false)"
        >
          New Sale
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.receipt-table th {
  font-size: 0.8rem !important;
  font-weight: 700 !important;
  border-bottom: 1px solid #ccc;
}
.receipt-table td {
  vertical-align: top;
  padding-top: 6px !important;
  padding-bottom: 6px !important;
}
</style>
