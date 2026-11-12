<script setup lang="ts">
import { computed } from 'vue'
import { voucherSignatories } from '@/stores/disbursementVouchersData'
import type { VoucherType } from '@/stores/disbursementVouchersData'
import { useExpenseAccounts } from '../composables/useExpenseAccounts'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

// A voucher opened up in the list: everything on it, read-only, so nobody has
// to open Edit (and risk sending a printed voucher back to draft) just to read
// what it says.

const props = defineProps<{
  voucher: VoucherType
  /** The voucher's one particulars, read the same way as the list and print. */
  particulars: string
}>()

const { expenseAccountLabel } = useExpenseAccounts()

/** One department per voucher, stored on every line. */
const department = computed(() => props.voucher.items.find((line) => line.department)?.department ?? null)

/** The header details worth showing, blank ones left out. */
const details = computed(() => {
  const v = props.voucher
  return [
    { label: 'Paying', value: v.supplier_name ? `Supplier — ${v.supplier_name}` : null },
    { label: 'Rebate for', value: v.customer_name },
    { label: 'Address', value: v.payee_address },
    { label: 'TIN', value: v.payee_tin },
    { label: 'OR / SI No.', value: v.or_si_no },
    { label: 'Department', value: department.value },
    { label: 'Reference', value: v.remarks },
  ].filter((d) => d.value)
})

const signatories = computed(() =>
  voucherSignatories
    .map((role) => ({ label: role.label, name: props.voucher.signatories[role.field] }))
    .filter((s) => s.name))

const printedLine = computed(() => {
  const v = props.voucher
  if (!v.print_count) return 'Not printed yet'
  const when = v.printed_at ? ` · last ${formatDatePR_ISO(v.printed_at)}` : ''
  return `Printed ${v.print_count} ${v.print_count === 1 ? 'time' : 'times'}${when}`
})
</script>

<template>
  <div class="dv-detail pa-4">
    <v-row dense>
      <!-- What it is for, and where it is charged -->
      <v-col cols="12" md="7">
        <div class="detail-label">Particulars</div>
        <div class="text-body-2 particulars mb-4">{{ particulars || '—' }}</div>

        <v-table density="compact" class="border rounded">
          <thead>
            <tr>
              <th class="text-left">Account</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in voucher.items" :key="line.id">
              <td>
                {{ expenseAccountLabel(line.category) }}
                <span v-if="line.expense_no" class="text-caption text-medium-emphasis ms-1">· {{ line.expense_no }}</span>
              </td>
              <td class="text-right text-no-wrap">{{ formatCurrency(line.amount) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="font-weight-bold">
              <td>Total</td>
              <td class="text-right text-no-wrap">{{ formatCurrency(voucher.total_amount) }}</td>
            </tr>
          </tfoot>
        </v-table>
      </v-col>

      <!-- The rest of the paper voucher -->
      <v-col cols="12" md="5">
        <dl v-if="details.length" class="details mb-4">
          <template v-for="d in details" :key="d.label">
            <dt>{{ d.label }}</dt>
            <dd>{{ d.value }}</dd>
          </template>
        </dl>

        <template v-if="signatories.length">
          <div class="detail-label">Signatories</div>
          <dl class="details mb-4">
            <template v-for="s in signatories" :key="s.label">
              <dt>{{ s.label }}</dt>
              <dd>{{ s.name }}</dd>
            </template>
          </dl>
        </template>

        <div class="text-caption text-medium-emphasis">
          <v-icon icon="mdi-printer-outline" size="14" class="me-1" />{{ printedLine }}
        </div>
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
.dv-detail {
  background: rgba(var(--v-theme-on-surface), 0.03);
  text-align: left;
}
.detail-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  opacity: 0.6;
  margin-bottom: 4px;
}
/* The particulars are typed with their own line breaks; keep them. */
.particulars {
  white-space: pre-wrap;
}
.details {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 16px;
  row-gap: 4px;
  font-size: 0.875rem;
  margin: 0;
}
.details dt {
  opacity: 0.6;
}
.details dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
