<script setup lang="ts">
import { ref, nextTick } from 'vue'
import html2pdf from 'html2pdf.js'
import { useToast } from 'vue-toastification'
import type { DeliveryReceiptType } from '@/stores/deliveryReceiptsData'

const props = defineProps<{
  modelValue: boolean
  receipt: DeliveryReceiptType | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const toast = useToast()
const printArea = ref<HTMLElement | null>(null)

// Issuing-company header. Copied verbatim from the POS delivery receipt
// (src/pages/sales/dialogs/PosReceiptDialog.vue) — real, already-shipped values.
// TODO(confirm): if In-House govt/LGU DRs should carry Vincare Pharma's own
// name / TIN / license instead of Exelmed's, replace these values.
const company = {
  name:    'EXELMED PHARMA TRADE',
  line1:   'Ground Floor NB Building, Ochoa Avenue, Butuan City',
  line2:   '8600 Agusan del Norte, Philippines (Tel: 085-3000-460)',
  license: 'License Number: 3000001108883 - VAT Reg: TIN: 178-845-363-000',
  contact: 'Mobile: 09090734525 - Email Address: exelmedshop@gmail.com',
} as const

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
      filename:    `${props.receipt.dr_no}.pdf`,
      image:       { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(el)
    .save()

  toast.success(`${props.receipt.dr_no} generated.`)
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
      <v-card-text class="pa-6">
        <div ref="printArea" class="receipt">
          <!-- Header -->
          <div class="text-center mb-4">
            <div class="text-h5 font-weight-bold" style="letter-spacing: 2px;">{{ company.name }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.line1 }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.line2 }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.license }}</div>
            <div class="text-caption text-medium-emphasis">{{ company.contact }}</div>
          </div>

          <div class="text-center text-h6 font-weight-bold mb-4" style="letter-spacing: 2px;">
            DELIVERY RECEIPT
          </div>

          <!-- Meta: DR # + order/PO + customer | date -->
          <v-row class="mb-2" no-gutters>
            <v-col cols="7">
              <div class="text-body-2"><span class="font-weight-bold">DR #</span> {{ receipt.dr_no }}</div>
              <div class="text-body-2"><span class="font-weight-bold">Order #</span> {{ receipt.order_no ?? '—' }}</div>
              <div class="text-body-2" v-if="receipt.po_no">
                <span class="font-weight-bold">PO #</span> {{ receipt.po_no }}
              </div>
              <div class="text-caption font-weight-bold mt-2">Deliver to:</div>
              <div class="text-body-2 font-weight-medium">{{ receipt.customer_name || '—' }}</div>
            </v-col>
            <v-col cols="5" class="text-right">
              <div class="text-body-2">Date {{ formatReceiptDate(receipt.created_at) }}</div>
            </v-col>
          </v-row>

          <v-divider class="my-3" />

          <!-- Line items (quantities delivered on this trip) -->
          <v-table density="compact" class="receipt-table">
            <thead>
              <tr>
                <th class="text-left">Product</th>
                <th class="text-left">Lot / Expiry</th>
                <th class="text-right">Quantity</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, i) in receipt.items" :key="i">
                <td>
                  <div class="font-weight-medium">{{ line.product?.product_name ?? `#${line.product_id}` }}</div>
                  <div class="text-caption text-medium-emphasis" v-if="line.product?.generic_name">
                    {{ line.product.generic_name }}
                  </div>
                </td>
                <td class="text-caption">
                  <span v-if="line.product?.batch_no">Lot: {{ line.product.batch_no }}</span>
                  <span v-if="line.product?.batch_no && line.product?.expiry_date"> , </span>
                  <span v-if="line.product?.expiry_date">Exp: {{ line.product.expiry_date }}</span>
                  <span v-if="!line.product?.batch_no && !line.product?.expiry_date">—</span>
                </td>
                <td class="text-right">{{ line.qty }} {{ line.product?.unit ?? '' }}</td>
              </tr>
            </tbody>
          </v-table>

          <!-- Received by -->
          <div class="mt-8">
            <div class="text-body-2 font-weight-medium" style="min-height: 20px;">{{ receipt.received_by ?? '' }}</div>
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
