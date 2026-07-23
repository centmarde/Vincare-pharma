<script setup lang="ts">
import { formatCurrency, formatDate } from '@/utils/helpers'
import type { ARReceivableDetail } from '@/stores/financeData'

defineProps<{
  modelValue: boolean
  loading: boolean
  detail: ARReceivableDetail | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const lineHeaders = [
  { title: 'PRODUCT', key: 'product_name', sortable: false, align: 'start' as const },
  { title: 'QTY', key: 'qty', sortable: false, align: 'center' as const },
  { title: 'UNIT PRICE', key: 'unit_price', sortable: false, align: 'end' as const },
  { title: 'LINE TOTAL', key: 'line_total', sortable: false, align: 'end' as const },
]

const paymentHeaders = [
  { title: 'DATE', key: 'date', sortable: false, align: 'start' as const },
  { title: 'METHOD', key: 'payment_method', sortable: false, align: 'center' as const },
  { title: 'REFERENCE #', key: 'reference_no', sortable: false, align: 'center' as const },
  { title: 'AMOUNT', key: 'amount', sortable: false, align: 'end' as const },
]
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="720"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3 d-flex align-center ga-3">
        <div class="flex-grow-1">
          <div class="text-h6 font-weight-bold">
            {{ detail?.reference_no ?? 'Receivable' }}
          </div>
          <div class="text-caption text-medium-emphasis">
            {{ detail?.source === 'ethical_order' ? 'Ethical Order' : 'In-House Order' }}
            <template v-if="detail?.customer_name"> · {{ detail.customer_name }}</template>
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <div v-if="loading" class="pa-6 text-center text-caption text-medium-emphasis">
          Loading receivable...
        </div>
        <div v-else-if="!detail" class="pa-6 text-center text-caption text-medium-emphasis">
          Receivable not found.
        </div>

        <template v-else>
          <!-- Header / trace-back -->
          <div class="detail-grid mb-4">
            <div>
              <div class="field-label">Status</div>
              <v-chip size="small" variant="tonal" class="text-capitalize">{{ detail.status ?? '—' }}</v-chip>
            </div>
            <div>
              <div class="field-label">Invoice Date</div>
              <div class="text-body-2">{{ formatDate(detail.invoice_date ?? undefined) }}</div>
            </div>
            <div v-if="detail.source === 'inhouse_order'">
              <div class="field-label">Company PO</div>
              <div class="text-body-2">{{ detail.po_no ?? '—' }}</div>
            </div>
            <div v-if="detail.source === 'inhouse_order'">
              <div class="field-label">Government PO</div>
              <div class="text-body-2">{{ detail.govt_po_no ?? '—' }}</div>
            </div>
            <div v-if="detail.source === 'ethical_order'">
              <div class="field-label">Terms</div>
              <div class="text-body-2">{{ detail.terms_days != null ? `Net ${detail.terms_days} days` : '—' }}</div>
            </div>
            <div v-if="detail.source === 'ethical_order'">
              <div class="field-label">Due Date</div>
              <div class="text-body-2">{{ detail.due_date ? formatDate(detail.due_date) : '—' }}</div>
            </div>
          </div>

          <!-- Line items -->
          <div class="section-label mb-1">Line Items</div>
          <v-data-table
            :headers="lineHeaders"
            :items="detail.lines"
            hide-default-footer
            density="compact"
            class="mb-4 bordered-table"
          >
            <template #item.qty="{ item }">{{ item.qty }}<span v-if="item.unit" class="text-medium-emphasis"> {{ item.unit }}</span></template>
            <template #item.unit_price="{ item }">{{ formatCurrency(item.unit_price) }}</template>
            <template #item.line_total="{ item }">{{ formatCurrency(item.line_total) }}</template>
            <template #no-data>
              <div class="pa-3 text-caption text-medium-emphasis">No line items.</div>
            </template>
          </v-data-table>

          <!-- Payment history -->
          <div class="section-label mb-1">Payment History</div>
          <v-data-table
            :headers="paymentHeaders"
            :items="detail.payments"
            hide-default-footer
            density="compact"
            class="mb-4 bordered-table"
          >
            <template #item.date="{ item }">{{ formatDate(item.date) }}</template>
            <template #item.payment_method="{ item }">{{ item.payment_method ?? '—' }}</template>
            <template #item.reference_no="{ item }">{{ item.reference_no ?? '—' }}</template>
            <template #item.amount="{ item }">{{ formatCurrency(item.amount) }}</template>
            <template #no-data>
              <div class="pa-3 text-caption text-medium-emphasis">No payments recorded yet.</div>
            </template>
          </v-data-table>

          <!-- Summary -->
          <v-divider class="mb-3" />
          <div class="summary-row">
            <span class="text-medium-emphasis">Total</span>
            <span class="font-weight-medium">{{ formatCurrency(detail.total_amount) }}</span>
          </div>
          <div class="summary-row">
            <span class="text-medium-emphasis">Paid</span>
            <span class="font-weight-medium">{{ formatCurrency(detail.amount_paid) }}</span>
          </div>
          <div class="summary-row text-h6 font-weight-bold">
            <span>Outstanding Balance</span>
            <span :class="detail.balance > 0.01 ? 'text-error' : 'text-success'">{{ formatCurrency(detail.balance) }}</span>
          </div>
        </template>
      </v-card-text>

      <v-divider />
      <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end">
        <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px 20px;
}
.field-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #9e9e9e;
  text-transform: uppercase;
  margin-bottom: 2px;
}
.section-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #424242;
}
.bordered-table {
  border: 1px solid #eeeeee;
  border-radius: 8px;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
}
</style>
