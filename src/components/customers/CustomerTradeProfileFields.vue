<script setup lang="ts">
import { productPreferenceOptions } from '@/stores/customersData'
import type { CreateCustomerData } from '@/stores/customersData'
import type { CustomerTerms } from '@/stores/discountsData'
import CustomerTermsEditor from './CustomerTermsEditor.vue'

// The trade / rebate profile block, shared by the In-House and Sales/POS
// customer forms (Ethical lays out the same fields itself).
//
// `form` and `terms` are mutated in place — the same contract the module forms
// already use with their own `form` prop. Area and payment terms are
// deliberately NOT here: every form already places those itself. Markup,
// discount, rebates and ads are in `terms`, saved to the rows orders price
// from (useCustomerTerms) — not on `form`.

// withDefaults, not a bare optional: Vue reads an omitted boolean prop as
// false, so In-House (which doesn't pass it) had its rebate payout settings
// hidden. Rebates show unless a form opts out (POS passes false).
withDefaults(defineProps<{
  form: CreateCustomerData
  terms: CustomerTerms
  /** Why the terms block a save, if they do. */
  termsBlocker?: string
  /** Hide the rebate lists and payout settings where rebates don't apply (e.g. POS). */
  showRebatePayout?: boolean
}>(), { showRebatePayout: true })

const schemeOptions = [
  { title: 'Pushing', value: 'pushing' },
  { title: 'Tie-up', value: 'tie_up' },
  { title: 'Dispensing', value: 'dispensing' },
  { title: 'Trade Discount', value: 'trade_discount' },
  { title: 'Free Goods', value: 'free_goods' },
]

const rebatePaymentModeOptions = [
  { title: 'Cash', value: 'cash' },
  { title: 'GCash', value: 'gcash' },
  { title: 'Bank', value: 'bank' },
  { title: 'Other', value: 'other' },
]

</script>

<template>
  <v-row dense>
    <v-col cols="12" sm="6">
      <v-text-field v-model="form.owner_name" label="Owner's Name" variant="outlined" density="compact" hide-details class="mb-3" />
    </v-col>
    <v-col cols="12" sm="6">
      <v-text-field v-model="form.owner_contact_no" label="Owner's Contact No." variant="outlined" density="compact" hide-details class="mb-3" />
    </v-col>
    <v-col cols="12" sm="6">
      <v-text-field v-model="form.purchaser_name" label="Purchaser" variant="outlined" density="compact" hide-details class="mb-3" />
    </v-col>
    <v-col cols="12" sm="6">
      <v-text-field v-model="form.purchaser_contact_no" label="Purchaser's Contact No." variant="outlined" density="compact" hide-details class="mb-3" />
    </v-col>
  </v-row>

  <v-select
    v-model="form.scheme"
    :items="schemeOptions"
    label="Scheme"
    item-title="title"
    item-value="value"
    multiple
    chips
    closable-chips
    variant="outlined"
    density="compact"
    hide-details
    class="mb-3"
  />

  <v-text-field
    v-model.number="form.target_sales"
    label="Target Sales"
    type="number"
    min="0"
    prefix="₱"
    variant="outlined"
    density="compact"
    hide-details
    class="mb-3"
  />

  <v-select
    v-model="form.product_preference"
    :items="productPreferenceOptions"
    label="Buys branded or generics"
    clearable
    variant="outlined"
    density="compact"
    hide-details
    class="mb-3"
  />

  <v-textarea
    v-model="form.product_sales_list"
    label="Product Sales List"
    hint="e.g. All Generic Meds, Lab & Medical Supplies"
    persistent-hint
    rows="2"
    auto-grow
    variant="outlined"
    density="compact"
    class="mb-3"
  />

  <!-- What orders price from: markup, discount, and each person's rebate /
       ads share by name. Saved as entered — a loss is allowed. -->
  <CustomerTermsEditor :terms="terms" :show-rebates="showRebatePayout !== false" />
  <div v-if="termsBlocker" class="text-caption text-error mb-3">{{ termsBlocker }}</div>

  <template v-if="showRebatePayout !== false">
    <v-select
      v-model="form.rebate_payment_mode"
      :items="rebatePaymentModeOptions"
      label="Rebate Payment Mode"
      item-title="title"
      item-value="value"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-3"
    />
    <v-text-field
      v-if="form.rebate_payment_mode && form.rebate_payment_mode !== 'cash'"
      v-model="form.rebate_payment_account_no"
      label="Account No."
      hint="GCash number or bank account number for rebate payout"
      persistent-hint
      variant="outlined"
      density="compact"
      class="mb-3"
    />
  </template>
</template>
