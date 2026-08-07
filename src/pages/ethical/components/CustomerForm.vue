<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { CreateCustomerData } from '@/stores/customersData'
import type { AgentType } from '@/stores/agentsData'

interface Props {
  customer?: any
  agentOptions?: any[]
  businessStructureOptions?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  agentOptions: () => [],
  businessStructureOptions: () => [],
})

const emit = defineEmits<{ submit: [CreateCustomerData]; cancel: [] }>()

const required = [(v: any) => !!v || 'Required']
// Legal structure drives which registration number is required — the
// accountant's "avoid ghost transactions" control: every AR balance should
// tie to a verifiably real, registered entity.
const requiredIfSec = [
  (v: any) =>
    (form.business_structure !== 'corporation' && form.business_structure !== 'partnership') ||
    !!v || 'SEC Registration No. is required for this business structure',
]
const requiredIfDti = [
  (v: any) =>
    form.business_structure !== 'sole_proprietorship' ||
    !!v || 'DTI Registration No. is required for this business structure',
]

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

const form = reactive<CreateCustomerData>({
  name: props.customer?.name ?? null,
  agency_type: props.customer?.agency_type ?? 'private',
  contact_person: props.customer?.contact_person ?? null,
  contact_no: props.customer?.contact_no ?? null,
  email: props.customer?.email ?? null,
  address: props.customer?.address ?? null,
  agent_id: props.customer?.agent_id ?? null,
  is_active: props.customer?.is_active ?? true,
  department: 'ethical',
  is_vat_registered: props.customer?.is_vat_registered ?? false,
  tin_number: props.customer?.tin_number ?? null,
  business_structure: props.customer?.business_structure ?? 'other',
  sec_registration_no: props.customer?.sec_registration_no ?? null,
  dti_registration_no: props.customer?.dti_registration_no ?? null,
  area: props.customer?.area ?? null,
  rebate_payment_mode: props.customer?.rebate_payment_mode ?? null,
  rebate_payment_account_no: props.customer?.rebate_payment_account_no ?? null,
  scheme: props.customer?.scheme ?? [],
  term_days: props.customer?.term_days ?? null,
  product_sales_list: props.customer?.product_sales_list ?? null,
  owner_name: props.customer?.owner_name ?? null,
  owner_contact_no: props.customer?.owner_contact_no ?? null,
  purchaser_name: props.customer?.purchaser_name ?? null,
  purchaser_contact_no: props.customer?.purchaser_contact_no ?? null,
  target_sales: props.customer?.target_sales ?? null,
  discount_rate: props.customer?.discount_rate ?? null,
  rebate_rate: props.customer?.rebate_rate ?? null,
  markup_percent: props.customer?.markup_percent ?? null,
  rebate_ratio_distribution: props.customer?.rebate_ratio_distribution ?? null,
})

// PRICE = SYSTEM PRICE / DIVISOR, DIVISOR = (100 - MARKUP)% — e.g. 20% markup
// -> divisor 80% -> price = system price / 0.80. Shown live as the user types
// so it's clear what the stored number actually drives (Ethical order line
// pricing in useCreateOrder.ts), not just a label.
const markupDivisorLabel = computed(() => {
  const markup = form.markup_percent
  if (markup == null || markup === '' as any) return null
  return `System Price / ${100 - Number(markup)}%`
})

// The markup is the budget that funds the discount + rebate: what we actually
// realize is system_price * (1-(discount+rebate)/100) / (1-markup/100), which
// lands exactly ON the system price when (discount + rebate) == markup. Past
// that the customer's terms erode system price on every order they place, so
// warn at config time rather than letting it surface one order at a time.
const giveawayRate = computed(() =>
  Number(form.discount_rate ?? 0) + Number(form.rebate_rate ?? 0))

const giveawayExceedsMarkup = computed(() => {
  if (giveawayRate.value <= 0) return false
  const markup = form.markup_percent
  // No markup -> the price IS the system price, so any giveaway erodes it.
  if (markup == null || markup === '' as any) return true
  return giveawayRate.value > Number(markup)
})

const formRef = ref()

async function submit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return
  emit('submit', form)
}
</script>

<template>
  <v-form ref="formRef" @submit.prevent="submit">
    <v-text-field v-model="form.name" label="Name" :rules="required" />
    <v-select
      v-model="form.agency_type"
      :items="[{ title: 'Government', value: 'government' }, { title: 'LGU', value: 'lgu' }, { title: 'Private', value: 'private' }]"
      label="Type"
    />
    <v-text-field v-model="form.contact_person" label="Contact Person" />
    <v-text-field v-model="form.contact_no" label="Phone" />
    <v-text-field v-model="form.email" label="Email" type="email" />
    <v-text-field v-model="form.address" label="Address" />
    <v-text-field
      v-model="form.tin_number"
      label="TIN"
      hint="BIR Tax Identification Number, e.g. 123-456-789-000"
      persistent-hint
      class="mb-2"
    />
    <v-radio-group v-model="form.is_vat_registered" label="VAT classification" inline hide-details class="mt-1 mb-2">
      <v-radio label="VAT-registered" :value="true" />
      <v-radio label="Non-VAT" :value="false" />
    </v-radio-group>

    <v-select
      v-model="form.business_structure"
      :items="businessStructureOptions"
      label="Business Structure"
      class="mb-2"
    />
    <v-text-field
      v-if="form.business_structure === 'corporation' || form.business_structure === 'partnership'"
      v-model="form.sec_registration_no"
      label="SEC Registration No."
      hint="Securities and Exchange Commission registration number"
      persistent-hint
      :rules="requiredIfSec"
      class="mb-2"
    />
    <v-text-field
      v-if="form.business_structure === 'sole_proprietorship'"
      v-model="form.dti_registration_no"
      label="DTI Registration No."
      hint="DTI Certificate of Business Name Registration number"
      persistent-hint
      :rules="requiredIfDti"
      class="mb-2"
    />

    <v-select v-model="form.agent_id" :items="agentOptions" label="Medical Sales Representative" item-title="title" item-value="value" class="mt-2" />
    <v-checkbox v-model="form.is_active" label="Active" />

    <div class="text-subtitle-2 font-weight-bold mt-2 mb-1">Trade / Rebate Profile</div>
    <v-divider class="mb-3" />

    <v-text-field v-model="form.area" label="Area" class="mb-2" />

    <v-row dense>
      <v-col cols="12" sm="6">
        <v-text-field v-model="form.owner_name" label="Owner's Name" />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field v-model="form.owner_contact_no" label="Owner's Contact No." />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field v-model="form.purchaser_name" label="Purchaser" />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field v-model="form.purchaser_contact_no" label="Purchaser's Contact No." />
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
      class="mb-2"
    />

    <v-row dense>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="form.term_days"
          label="Payment terms"
          placeholder="e.g. 60 Days, COD, Consignment"
          hint="Free text. A leading number sets the due date; COD means due on invoice. Arrangements with no day count (e.g. Consignment) leave the receivable un-aged."
          persistent-hint
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field v-model.number="form.target_sales" label="Target Sales" type="number" min="0" prefix="₱" />
      </v-col>
    </v-row>

    <v-textarea
      v-model="form.product_sales_list"
      label="Product Sales List"
      hint="e.g. All Generic Meds, Lab & Medical Supplies"
      persistent-hint
      rows="2"
      auto-grow
      class="mb-2"
    />

    <v-text-field
      v-model.number="form.markup_percent"
      label="Markup %"
      type="number"
      min="0"
      max="99.99"
      :hint="markupDivisorLabel ?? 'e.g. 20 → Price = System Price / 80%'"
      persistent-hint
      class="mb-2"
    />

    <v-row dense>
      <v-col cols="12" sm="6">
        <v-text-field v-model.number="form.discount_rate" label="Discount Rate (%)" type="number" min="0" max="100" />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field v-model.number="form.rebate_rate" label="Rebate Rate (%)" type="number" min="0" max="100" />
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

    <v-text-field
      v-model="form.rebate_ratio_distribution"
      label="Rebate Ratio Distribution"
      hint="e.g. PMR 40% / Owner 60%"
      persistent-hint
      class="mb-2"
    />

    <v-select
      v-model="form.rebate_payment_mode"
      :items="rebatePaymentModeOptions"
      label="Rebate Payment Mode"
      item-title="title"
      item-value="value"
      class="mb-2"
    />
    <v-text-field
      v-if="form.rebate_payment_mode && form.rebate_payment_mode !== 'cash'"
      v-model="form.rebate_payment_account_no"
      label="Account No."
      hint="GCash number or bank account number for rebate payout"
      persistent-hint
      class="mb-2"
    />

    <div class="d-flex gap-2 mt-4">
      <v-btn color="primary" type="submit">Save</v-btn>
      <v-btn @click="$emit('cancel')">Cancel</v-btn>
    </div>
  </v-form>
</template>
