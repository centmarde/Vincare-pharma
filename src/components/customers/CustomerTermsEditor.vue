<script setup lang="ts">
import { computed } from 'vue'
import { summarizeTerms } from '@/stores/discountsData'
import type { CustomerTerms, TermsRecipient } from '@/stores/discountsData'

// The customer's commercial terms: markup, discount, and each person who shares
// a rebate or an ads give, by name and %. Shared by every module's customer
// form. What is entered here is what orders price from (saveCustomerTerms).
//
// `terms` is mutated in place — the same contract CustomerTradeProfileFields
// uses for `form`. Nothing here blocks a loss: discount + rebate + ads beyond
// the markup is allowed (a marketing call) and only warned about.

// withDefaults, not a bare optional: Vue reads an omitted boolean prop as
// false, which hid the rebate and ads lists on every form that didn't pass it.
const props = withDefaults(defineProps<{
  terms: CustomerTerms
  /** Hide the rebate and ads lists where they don't apply (e.g. POS). */
  showRebates?: boolean
}>(), { showRebates: true })

const summary = computed(() => summarizeTerms(props.terms))

const markupHint = computed(() => {
  const markup = summary.value.markup
  return markup == null ? 'e.g. 20 → Price = System Price / 80%' : `Price = System Price / ${100 - markup}%`
})

function addPerson(list: TermsRecipient[]) {
  list.push({ name: '', rate: null })
}

function removePerson(list: TermsRecipient[], index: number) {
  list.splice(index, 1)
}

const sections = computed(() => [
  { key: 'rebates', title: 'Rebates', list: props.terms.rebates, total: summary.value.rebateTotal, hint: 'Paid out separately to each person (Computed Rebates).' },
  { key: 'ads', title: 'Ads', list: props.terms.ads, total: summary.value.adsTotal, hint: 'In-kind marketing give per person (Ads & Promo).' },
])
</script>

<template>
  <div class="terms-editor">
    <v-row dense>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model.number="terms.markupPercent"
          label="Markup %"
          type="number"
          min="0"
          max="99.99"
          :hint="markupHint"
          persistent-hint
          variant="outlined"
          density="compact"
          class="mb-3"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model.number="terms.discountRate"
          label="Discount %"
          type="number"
          min="0"
          max="100"
          hint="Taken off the invoice"
          persistent-hint
          variant="outlined"
          density="compact"
          class="mb-3"
        />
      </v-col>
    </v-row>

    <template v-if="showRebates !== false">
      <div v-for="section in sections" :key="section.key" class="mb-3">
        <div class="d-flex align-center mb-1">
          <span class="text-body-2 font-weight-bold">{{ section.title }}</span>
          <span class="text-caption text-medium-emphasis ms-2">{{ section.hint }}</span>
          <v-spacer />
          <span class="text-body-2">Total <strong>{{ section.total }}%</strong></span>
        </div>
        <div v-for="(person, i) in section.list" :key="i" class="d-flex align-center ga-2 mb-2">
          <v-text-field
            v-model="person.name"
            :label="`Person ${i + 1}`"
            placeholder="Name"
            variant="outlined"
            density="compact"
            hide-details="auto"
            :error-messages="Number(person.rate) > 0 && !person.name.trim() ? 'Enter the name' : undefined"
            class="flex-grow-1"
          />
          <v-text-field
            v-model.number="person.rate"
            label="%"
            type="number"
            min="0"
            max="100"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 110px"
          />
          <v-btn icon="mdi-close" size="small" variant="text" :aria-label="`Remove person ${i + 1}`" @click="removePerson(section.list, i)" />
        </div>
        <v-btn size="small" variant="text" color="primary" class="text-none" prepend-icon="mdi-plus" @click="addPerson(section.list)">
          Add person
        </v-btn>
      </div>
    </template>

    <!-- Imported components the app cannot price (tie-up, cash advance, …).
         Kept as recorded until removed; while any remain, orders do not price
         from these terms. -->
    <v-alert v-if="terms.others.length" type="warning" variant="tonal" density="compact" class="mb-3 text-caption">
      <div class="font-weight-medium mb-1">Recorded terms the system cannot price</div>
      <div v-for="(other, i) in terms.others" :key="i" class="d-flex align-center ga-2">
        <span>{{ other.label || 'Unlabelled' }}{{ other.name ? ` — ${other.name}` : '' }}: {{ other.rate ?? '—' }}%</span>
        <v-btn size="x-small" variant="text" class="text-none" @click="terms.others.splice(i, 1)">Remove</v-btn>
      </div>
      <div class="mt-1">
        While these remain, orders will not use this customer's terms. Re-enter them above as a
        discount, rebate or ads share and remove them here.
      </div>
    </v-alert>

    <!-- The whole deal at a glance. -->
    <v-sheet rounded="lg" border class="pa-3 mb-3 text-body-2 d-flex flex-wrap ga-4">
      <span>Discount <strong>{{ summary.discount }}%</strong></span>
      <span v-if="showRebates !== false">Rebates <strong>{{ summary.rebateTotal }}%</strong></span>
      <span v-if="showRebates !== false">Ads <strong>{{ summary.adsTotal }}%</strong></span>
      <span>Total given <strong>{{ summary.giveaway }}%</strong></span>
      <span>Markup <strong>{{ summary.markup ?? '—' }}{{ summary.markup != null ? '%' : '' }}</strong></span>
    </v-sheet>

    <v-alert v-if="summary.exceedsMarkup" type="warning" variant="tonal" density="compact" class="mb-3 text-caption">
      What this customer gets ({{ summary.giveaway }}%) is more than the markup
      ({{ summary.markup ?? 'none set' }}{{ summary.markup != null ? '%' : '' }}), so their orders sell below
      system price. That is allowed — it is saved as entered.
    </v-alert>
  </div>
</template>
