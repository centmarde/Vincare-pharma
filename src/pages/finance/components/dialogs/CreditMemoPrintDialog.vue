<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import html2pdf from 'html2pdf.js'
import { useToast } from 'vue-toastification'
import { companyFor, companyOptions, defaultCompanyFor } from '@/utils/companyProfiles'
import type { CompanyKey } from '@/utils/companyProfiles'
import type { CreditMemoType } from '@/stores/creditMemosData'
import { creditMemoReasonLabel } from '@/stores/creditMemosData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

// The printed credit memo: the customer's copy of what was taken off their
// account and why. Same letterhead and PDF path as the statement of account.
const props = defineProps<{ modelValue: boolean; memo: CreditMemoType | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()

const toast = useToast()
const printArea = ref<HTMLElement | null>(null)
const companyKey = ref<CompanyKey>(defaultCompanyFor('credit_memo'))
const company = computed(() => companyFor(companyKey.value))

async function handlePrint() {
  await nextTick()
  const el = printArea.value
  if (!el || !props.memo) return
  el.querySelectorAll('div, td, th, span, p').forEach((child) => {
    ;(child as HTMLElement).style.color = '#000000'
  })
  await html2pdf()
    .set({
      margin: 10,
      filename: `${props.memo.cm_no ?? 'credit-memo'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(el)
    .save()
  toast.success('Credit memo generated.')
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="760" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="lg">
      <v-card-text v-if="memo" class="pa-6">
        <div ref="printArea" class="cm">
          <div class="text-center mb-4">
            <div class="text-h5 font-weight-bold" style="letter-spacing: 2px">{{ company.name }}</div>
            <div class="text-caption cm-muted">{{ company.line1 }}</div>
            <div class="text-caption cm-muted">{{ company.line2 }}</div>
            <div v-if="company.license" class="text-caption cm-muted">{{ company.license }}</div>
            <div class="text-caption cm-muted">{{ company.contact }}</div>
          </div>

          <div class="d-flex justify-space-between align-end mb-4">
            <div class="text-h6 font-weight-bold" style="letter-spacing: 3px">CREDIT MEMO</div>
            <div class="text-right">
              <div class="text-body-1 font-weight-bold">{{ memo.cm_no ?? '—' }}</div>
              <div class="text-caption">Date: {{ formatDatePR_ISO(memo.approved_at ?? memo.created_at) }}</div>
            </div>
          </div>

          <table class="cm-table mb-4">
            <tbody>
              <tr><th>Customer</th><td>{{ memo.customer_name ?? '—' }}</td></tr>
              <tr><th>Address</th><td>{{ memo.customer_address ?? '—' }}</td></tr>
              <tr><th>TIN</th><td>{{ memo.customer_tin ?? '—' }}</td></tr>
              <tr><th>Applies to</th><td>{{ memo.applies_to_no ?? '—' }}<template v-if="memo.sales_return_no"> · Return {{ memo.sales_return_no }}</template></td></tr>
            </tbody>
          </table>

          <p class="text-body-2 mb-2">We have credited your account for the following:</p>
          <table class="cm-table cm-lines mb-6">
            <thead>
              <tr><th>Particulars</th><th class="text-right" style="width: 160px">Amount</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div class="font-weight-medium">{{ creditMemoReasonLabel(memo.reason_code) }}</div>
                  <div>{{ memo.reason }}</div>
                </td>
                <td class="text-right">{{ formatCurrency(memo.amount) }}</td>
              </tr>
              <tr class="font-weight-bold">
                <td class="text-right">TOTAL CREDIT</td>
                <td class="text-right">{{ formatCurrency(memo.amount) }}</td>
              </tr>
            </tbody>
          </table>

          <div class="d-flex justify-space-between mt-10 sig">
            <div><div class="sig-line" />Prepared by</div>
            <div><div class="sig-line" />Approved by</div>
            <div><div class="sig-line" />Received by (customer)</div>
          </div>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="px-6 pb-5 pt-3 d-flex flex-wrap ga-2">
        <v-select
          v-model="companyKey"
          :items="companyOptions"
          label="Letterhead"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 220px"
        />
        <v-spacer />
        <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">Close</v-btn>
        <v-btn color="primary" variant="flat" class="text-none font-weight-bold" prepend-icon="mdi-printer" :disabled="!memo?.cm_no" @click="handlePrint">
          Download PDF
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.cm { background: #fff; color: #000; padding: 8px; }
/* the sheet is always white, so theme-relative greys would vanish in dark mode */
.cm-muted { color: #555; }
.cm-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.cm-table th, .cm-table td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; vertical-align: top; }
.cm-table tbody th { width: 120px; background: #f5f5f5; font-weight: 600; }
.cm-lines thead th { background: #f5f5f5; }
.sig { font-size: 0.8rem; text-align: center; gap: 24px; }
.sig > div { flex: 1; }
.sig-line { border-top: 1px solid #000; margin-bottom: 4px; height: 36px; }
</style>
