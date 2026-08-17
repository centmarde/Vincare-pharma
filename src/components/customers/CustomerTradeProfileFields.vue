<script setup lang="ts">
import { computed } from 'vue'
import type { CreateCustomerData } from '@/stores/customersData'

// The trade / rebate profile block, shared by every module's customer form
// (Ethical, In-House, Sales/POS). Extracted rather than copied three times:
// the markup-vs-giveaway rule below is real pricing logic, and three copies of
// it would drift.
//
// `form` is mutated in place — the same contract the module forms already use
// with their own `form` prop. Area and payment terms are deliberately NOT here:
// every form already places those itself, in module-specific positions.

const props = defineProps<{
  form: CreateCustomerData
  /** Hide the rebate payout settings where rebates don't apply (e.g. POS). */
  showRebatePayout?: boolean
}>()

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

// PRICE = SYSTEM PRICE / DIVISOR, DIVISOR = (100 - MARKUP)% — e.g. 20% markup
// -> divisor 80% -> price = system price / 0.80. Shown live as the user types
// so it's clear what the stored number actually drives, not just a label.
const markupDivisorLabel = computed(() => {
  const markup = props.form.markup_percent
  if (markup == null || markup === ('' as unknown)) return null
  return `System Price / ${100 - Number(markup)}%`
})

// The markup is the budget that funds the discount + rebate: what we actually
// realize is system_price * (1-(discount+rebate)/100) / (1-markup/100), which
// lands exactly ON the system price when (discount + rebate) == markup. Past
// that the customer's terms erode system price on every order they place, so
// warn at config time rather than letting it surface one order at a time.
const giveawayRate = computed(() =>
  Number(props.form.discount_rate ?? 0) + Number(props.form.rebate_rate ?? 0))

const giveawayExceedsMarkup = computed(() => {
  if (giveawayRate.value <= 0) return false
  const markup = props.form.markup_percent
  // No markup -> the price IS the system price, so any giveaway erodes it.
  if (markup == null || markup === ('' as unknown)) return true
  return giveawayRate.value > Number(markup)
})
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

  <v-text-field
    v-model.number="form.markup_percent"
    label="Markup %"
    type="number"
    min="0"
    max="99.99"
    :hint="markupDivisorLabel ?? 'e.g. 20 → Price = System Price / 80%'"
    persistent-hint
    variant="outlined"
    density="compact"
    class="mb-3"
  />

  <v-row dense>
    <v-col cols="12" sm="6">
      <v-text-field
        v-model.number="form.discount_rate"
        label="Discount Rate (%)"
        type="number"
        min="0"
        max="100"
        variant="outlined"
        density="compact"
        hide-details
        class="mb-3"
      />
    </v-col>
    <v-col cols="12" sm="6">
      <v-text-field
        v-model.number="form.rebate_rate"
        label="Rebate Rate (%)"
        type="number"
        min="0"
        max="100"
        variant="outlined"
        density="compact"
        hide-details
        class="mb-3"
      />
    </v-col>
  </v-row>

  <v-alert
    v-if="giveawayExceedsMarkup"
    type="warning"
    variant="tonal"
    density="compact"
    class="mb-3"
  >
    Discount + rebate ({{ giveawayRate }}%) exceed the markup
    <span v-if="form.markup_percent">({{ form.markup_percent }}%)</span>
    <span v-else>(none set)</span> — every order for this customer will net below system price.
    The markup should normally cover the discount and rebate.
  </v-alert>

  <template v-if="showRebatePayout !== false">
    <v-text-field
      v-model="form.rebate_ratio_distribution"
      label="Rebate Ratio Distribution"
      hint="e.g. PMR 40% / Owner 60%"
      persistent-hint
      variant="outlined"
      density="compact"
      class="mb-3"
    />

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
