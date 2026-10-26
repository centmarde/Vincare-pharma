<script setup lang="ts">
import { watch } from 'vue'
import MoneyField from '@/components/inputs/MoneyField.vue'
import { useCreditMemoRequest } from '../../composables/useCreditMemos'
import type { CreditMemoTarget } from '../../composables/useCreditMemos'

// Asking for a credit memo on one bill — an allowance: a price correction, a
// short or damaged delivery, an agreed allowance. It goes to an executive; it
// only gets its CM number and comes off the bill once approved.
const props = defineProps<{ modelValue: boolean; target: CreditMemoTarget | null }>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'sent'): void
}>()

const { reasonCode, amount, reason, saving, blockers, canSubmit, open, submit, allowanceReasons, formatCurrency } =
  useCreditMemoRequest(() => {
    emit('sent')
    emit('update:modelValue', false)
  })

watch(() => props.modelValue, (isOpen) => { if (isOpen && props.target) open(props.target) }, { immediate: true })
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="520" persistent @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3">
        <div class="text-h6 font-weight-bold">Issue Credit Memo</div>
        <div class="text-caption text-medium-emphasis">
          {{ target?.reference_no ?? 'Bill' }}<template v-if="target?.customer_name"> · {{ target.customer_name }}</template>
        </div>
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <div class="d-flex justify-space-between align-center mb-4">
          <span class="text-body-2 text-medium-emphasis">Still owed</span>
          <span class="text-h6 font-weight-bold">{{ formatCurrency(target?.balance ?? 0) }}</span>
        </div>

        <v-select
          v-model="reasonCode"
          :items="allowanceReasons"
          label="Reason *"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
        />
        <MoneyField v-model="amount" label="Amount to credit *" prefix="₱" variant="outlined" density="compact" hide-details class="mb-3" />
        <v-textarea
          v-model="reason"
          label="Explanation (printed on the credit memo) *"
          placeholder="e.g. Billed ₱120/box, agreed price ₱110/box — 50 boxes"
          rows="2"
          auto-grow
          variant="outlined"
          density="compact"
          hide-details
        />

        <v-alert type="info" variant="tonal" density="compact" class="mt-4 text-body-2">
          Goes to an executive for approval. Once approved it gets its CM number, comes off this bill, and can be
          printed. For returned goods, issue it from the return (Sales → Returns).
        </v-alert>
        <div v-if="blockers.length" class="text-caption text-error mt-2">Needs {{ blockers.join(', ') }}.</div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="px-4 px-sm-5 pb-4 pt-3 d-flex justify-end ga-2">
        <v-btn variant="outlined" class="text-none" :disabled="saving" @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="primary" variant="flat" class="text-none font-weight-bold" :loading="saving" :disabled="!canSubmit" @click="submit">
          Send for Approval
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
