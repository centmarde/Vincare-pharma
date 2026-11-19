<script setup lang="ts">
import { computed } from 'vue'
import MoneyField from '@/components/inputs/MoneyField.vue'
import { collectionPaymentMethodOptions } from '@/utils/paymentMethods'
import { toLocalISODate } from '@/utils/helpers'

// The fields for collecting a receivable — one layout for Ethical, In-House and
// POS charges, as the staff who collect asked: amount with thousands
// separators, paid by Cash or Cheque, the cheque's details when it is one, and
// a note. State lives in each module's composable; this only renders it.
const props = withDefaults(defineProps<{
  /** What is still owed — an amount above it is flagged. */
  balance: number
  cashAccountOptions: { value: number; title: string }[]
  disabled?: boolean
  /** Two columns on wide screens; one when the form sits in a narrow dialog. */
  narrow?: boolean
}>(), { disabled: false, narrow: false })

const amount = defineModel<number>('amount', { required: true })
const method = defineModel<string>('method', { required: true })
const reference = defineModel<string>('reference', { required: true })
const cashAccountId = defineModel<number | null>('cashAccountId', { required: true })
const chequeBank = defineModel<string>('chequeBank', { required: true })
const chequeNo = defineModel<string>('chequeNo', { required: true })
const chequeDate = defineModel<string>('chequeDate', { required: true })
const remarks = defineModel<string>('remarks', { required: true })
/** A discount given as they pay — taken off the bill, no cash. Optional. */
const discount = defineModel<number>('discount', { default: 0 })
/** The day they paid (YYYY-MM-DD); today by default. */
const paidOn = defineModel<string>('paidOn', { default: '' })

const today = toLocalISODate(new Date())
const isCheque = computed(() => method.value === 'cheque')
// What the payment and the discount settle together.
const settles = computed(() => (amount.value || 0) + (discount.value || 0))
const overpaid = computed(() => settles.value > props.balance + 0.005)
const futureDate = computed(() => !!paidOn.value && paidOn.value > today)
const backDated = computed(() => !!paidOn.value && paidOn.value < today)
const postDated = computed(() => isCheque.value && !!chequeDate.value && chequeDate.value > toLocalISODate(new Date()))
const col = computed(() => (props.narrow ? 12 : 6))
</script>

<template>
  <v-row dense>
    <v-col cols="12" :sm="col">
      <MoneyField
        v-model="amount"
        label="Amount received *"
        prefix="₱"
        variant="outlined"
        density="compact"
        :disabled="disabled"
        :error-messages="overpaid ? 'Amount + discount is more than what is owed' : undefined"
        :hide-details="!overpaid"
      />
    </v-col>
    <v-col cols="12" :sm="col">
      <MoneyField
        v-model="discount"
        label="Discount given"
        prefix="₱"
        variant="outlined"
        density="compact"
        :disabled="disabled"
        hint="Taken off the bill — no cash. Leave 0 if none."
        persistent-hint
      />
    </v-col>
    <v-col cols="12" :sm="col">
      <v-text-field
        v-model="paidOn"
        label="Payment date *"
        type="date"
        :max="today"
        variant="outlined"
        density="compact"
        :disabled="disabled"
        :error-messages="futureDate ? 'Cannot be in the future' : undefined"
        :hint="backDated ? 'Back-dated — recorded on this day.' : undefined"
        :persistent-hint="backDated"
        :hide-details="!futureDate && !backDated"
      />
    </v-col>
    <v-col cols="12" :sm="col">
      <v-select
        v-model="method"
        :items="collectionPaymentMethodOptions"
        label="Payment method *"
        variant="outlined"
        density="compact"
        hide-details
        :disabled="disabled"
      />
    </v-col>

    <template v-if="isCheque">
      <v-col cols="12" :sm="narrow ? 12 : 4">
        <v-text-field
          v-model="chequeBank"
          label="Bank *"
          placeholder="e.g. BDO, Landbank"
          variant="outlined"
          density="compact"
          hide-details
          :disabled="disabled"
        />
      </v-col>
      <v-col cols="12" :sm="narrow ? 12 : 4">
        <v-text-field
          v-model="chequeNo"
          label="Cheque no. *"
          variant="outlined"
          density="compact"
          hide-details
          :disabled="disabled"
        />
      </v-col>
      <v-col cols="12" :sm="narrow ? 12 : 4">
        <v-text-field
          v-model="chequeDate"
          label="Cheque date *"
          type="date"
          variant="outlined"
          density="compact"
          :hint="postDated ? 'Post-dated — recorded as received today; follow it up on its date.' : undefined"
          :persistent-hint="postDated"
          :hide-details="!postDated"
          :disabled="disabled"
        />
      </v-col>
    </template>

    <v-col cols="12" :sm="col">
      <v-select
        v-model="cashAccountId"
        :items="cashAccountOptions"
        label="Deposited to *"
        placeholder="Which of our accounts received it"
        variant="outlined"
        density="compact"
        hide-details
        :disabled="disabled"
      />
    </v-col>
    <v-col cols="12" :sm="col">
      <v-text-field
        v-model="reference"
        label="Reference / OR #"
        variant="outlined"
        density="compact"
        hide-details
        :disabled="disabled"
      />
    </v-col>
    <v-col cols="12">
      <v-textarea
        v-model="remarks"
        label="Payment note"
        placeholder="Anything worth knowing about this payment"
        rows="2"
        auto-grow
        variant="outlined"
        density="compact"
        hide-details
        :disabled="disabled"
      />
    </v-col>
  </v-row>
</template>
