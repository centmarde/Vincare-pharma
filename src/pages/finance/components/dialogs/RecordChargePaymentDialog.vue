<script setup lang="ts">
import CollectionPaymentFields from '@/components/collections/CollectionPaymentFields.vue'
import { formatCurrency } from '@/utils/helpers'

// A payment on a POS sale charged to a customer account, received at the
// office. Form state lives in useAccountsReceivable; the fields are the same
// ones Ethical and In-House collect with.
const props = defineProps<{
  saleNo: string | null
  customerName: string | null
  balance: number
  cashAccountOptions: { value: number; title: string }[]
  canConfirm: boolean
  loading: boolean
  /** Why Record is greyed out. */
  problem?: string | null
}>()

const open = defineModel<boolean>({ required: true })
const amount = defineModel<number>('amount', { required: true })
const method = defineModel<string>('method', { required: true })
const reference = defineModel<string>('reference', { required: true })
const remarks = defineModel<string>('remarks', { required: true })
const cashAccountId = defineModel<number | null>('cashAccountId', { required: true })
const chequeBank = defineModel<string>('chequeBank', { required: true })
const chequeNo = defineModel<string>('chequeNo', { required: true })
const chequeDate = defineModel<string>('chequeDate', { required: true })
const discount = defineModel<number>('discount', { required: true })
const paidOn = defineModel<string>('paidOn', { required: true })

const emit = defineEmits<{
  (e: 'confirm'): void
}>()

const remaining = () => Math.max(0, props.balance - (amount.value || 0) - (discount.value || 0))
</script>

<template>
  <v-dialog v-model="open" max-width="520" persistent>
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3">
        <div class="text-h6 font-weight-bold">Record payment</div>
        <div class="text-caption text-medium-emphasis">
          {{ saleNo ?? 'Charged sale' }}<template v-if="customerName"> · {{ customerName }}</template>
        </div>
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <div class="d-flex justify-space-between align-center mb-4">
          <span class="text-body-2 text-medium-emphasis">Owed</span>
          <span class="text-h6 font-weight-bold">{{ formatCurrency(balance) }}</span>
        </div>

        <CollectionPaymentFields
          v-model:amount="amount"
          v-model:method="method"
          v-model:reference="reference"
          v-model:cash-account-id="cashAccountId"
          v-model:cheque-bank="chequeBank"
          v-model:cheque-no="chequeNo"
          v-model:cheque-date="chequeDate"
          v-model:remarks="remarks"
          v-model:discount="discount"
          v-model:paid-on="paidOn"
          :balance="balance"
          :cash-account-options="cashAccountOptions"
          narrow
        />

        <div class="d-flex justify-space-between text-body-2 mt-4">
          <span class="text-medium-emphasis">Still owed after this</span>
          <span class="font-weight-bold">{{ formatCurrency(remaining()) }}</span>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="px-4 px-sm-5 pb-4 pb-sm-5 pt-3 d-flex justify-end align-center flex-wrap ga-2">
        <span v-if="problem" class="text-caption text-medium-emphasis flex-grow-1">{{ problem }}</span>
        <v-btn variant="outlined" class="text-none" :disabled="loading" @click="open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="text-none font-weight-bold"
          :loading="loading"
          :disabled="!canConfirm"
          @click="emit('confirm')"
        >
          Record payment
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
