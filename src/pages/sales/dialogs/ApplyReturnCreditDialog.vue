<script setup lang="ts">
import { watch } from 'vue'
import { useDisplay } from 'vuetify'
import MoneyField from '@/components/inputs/MoneyField.vue'
import type { SalesReturnType } from '@/stores/salesReturnsData'
import { formatDateOnly } from '@/utils/helpers'
import { useApplyReturnCredit } from '../composables/useApplyReturnCredit'

const props = defineProps<{ modelValue: boolean; returnRow: SalesReturnType | null }>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'applied'): void
}>()

const { mobile } = useDisplay()
const {
  source, receivables, loadingBills, saving, selectedKey, amount, note,
  creditLeft, maxAmount, blockers, canSubmit,
  keyOf, open, reset, submit,
  formatCurrency,
} = useApplyReturnCredit(() => emit('applied'))

const sourceLabel: Record<string, string> = { ethical_order: 'Ethical', inhouse_order: 'In-House', sale: 'POS charge' }

function close() {
  reset()
  emit('update:modelValue', false)
}

async function handleSubmit() {
  const result = await submit()
  if (result.success) emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (isOpen) => { if (isOpen && props.returnRow) void open(props.returnRow) },
  { immediate: true },
)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :fullscreen="mobile"
    max-width="760"
    scrollable
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-4 pa-sm-5 text-wrap">
        <v-icon icon="mdi-file-document-minus-outline" class="mr-2 text-primary" size="26" />
        <span class="text-h6 font-weight-bold">Issue Credit Memo</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <v-alert type="info" variant="tonal" density="compact" class="mb-4 text-body-2">
          <strong>{{ source?.return_no }}</strong>
          <span v-if="source?.customer_name"> — {{ source.customer_name }}</span>:
          <strong>{{ formatCurrency(creditLeft) }}</strong> of credit left.
          A credit memo takes the returned goods' value off what they owe — no money changes hands. It goes to an
          executive for approval; once approved it gets its CM number and comes off the bill.
        </v-alert>

        <v-progress-linear v-if="loadingBills" indeterminate class="mb-3" />
        <v-alert v-else-if="receivables === null" type="error" variant="tonal" density="compact" class="text-body-2">
          Could not load this customer's bills. Close and try again.
        </v-alert>
        <div v-else-if="!receivables.length" class="text-center text-body-2 text-medium-emphasis py-6">
          {{ source?.customer_name ?? 'This customer' }} owes nothing right now, so there is no bill to take it off.
          The credit stays on account for replacement goods.
        </div>

        <template v-else>
          <div class="text-subtitle-2 font-weight-bold mb-1">Which bill</div>
          <v-radio-group v-model="selectedKey" hide-details class="mb-3">
            <v-table density="compact" class="border rounded-lg">
              <thead>
                <tr>
                  <th />
                  <th class="text-caption">Document</th>
                  <th class="text-caption">Delivered</th>
                  <th class="text-caption text-right">Still owed</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in receivables" :key="keyOf(r)" class="cursor-pointer" @click="selectedKey = keyOf(r)">
                  <td style="width: 40px"><v-radio :value="keyOf(r)" density="compact" /></td>
                  <td class="text-body-2">
                    {{ r.reference_no ?? `#${r.id}` }}
                    <div class="text-caption text-medium-emphasis">{{ sourceLabel[r.source] }}</div>
                  </td>
                  <td class="text-body-2 text-no-wrap">{{ r.delivered_at ? formatDateOnly(r.delivered_at) : '—' }}</td>
                  <td class="text-right font-weight-bold text-no-wrap">{{ formatCurrency(r.balance) }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-radio-group>

          <div class="text-subtitle-2 font-weight-bold mb-1">Amount</div>
          <MoneyField v-model="amount" variant="outlined" density="comfortable" hide-details />
          <div class="text-caption text-medium-emphasis mt-1">
            Up to {{ formatCurrency(maxAmount) }} — the smaller of the credit left and what this bill still owes.
            Whatever is not used stays on account.
          </div>

          <div class="text-subtitle-2 font-weight-bold mt-4 mb-1">Reason (printed on the credit memo)</div>
          <v-text-field v-model="note" variant="outlined" density="compact" hide-details />
        </template>

        <div v-if="receivables?.length && blockers.length" class="text-caption text-error mt-3">
          Needs {{ blockers.join(', ') }}.
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" :disabled="!canSubmit" @click="handleSubmit">
          Send for Approval
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
