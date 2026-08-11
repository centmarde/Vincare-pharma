<script setup lang="ts">
import { computed } from 'vue'
import type { CustomerType } from '@/stores/customersData'
import type { DiscountProfile } from '@/stores/discountsData'
import CustomerTermsCard from './CustomerTermsCard.vue'
import FieldValue from './FieldValue.vue'

/**
 * Everything about a customer that doesn't earn a column.
 *
 * The list tables carry only what staff scan by — name, contact, area, terms,
 * rates. The compliance and profile fields live here, one click away, so the
 * table stays readable without hiding information.
 */
const props = defineProps<{
  customer: CustomerType & { agent_name?: string }
  profile?: DiscountProfile | null
}>()

const c = computed(() => props.customer)

const regNo = computed(() =>
  c.value.business_structure === 'sole_proprietorship'
    ? c.value.dti_registration_no
    : c.value.sec_registration_no)

const STRUCTURE_LABELS: Record<string, string> = {
  corporation: 'Corporation',
  partnership: 'Partnership',
  sole_proprietorship: 'Sole Proprietorship',
  other: 'Other (govt. agency, cooperative, etc.)',
}
const structure = computed(() => STRUCTURE_LABELS[c.value.business_structure ?? ''] ?? null)

// Grouped so the panel reads as sections rather than one long list.
const groups = computed(() => [
  {
    title: 'Contact',
    items: [
      ['Contact person', c.value.contact_person],
      ['Email', c.value.email],
      ['Address', c.value.address],
      ['Owner', c.value.owner_name],
      ["Owner's contact", c.value.owner_contact_no],
      ['Purchaser', c.value.purchaser_name],
      ["Purchaser's contact", c.value.purchaser_contact_no],
    ] as [string, string | null | undefined][],
  },
  {
    title: 'Business registration',
    items: [
      ['TIN', c.value.tin_number],
      ['VAT status', c.value.is_vat_registered == null ? null : (c.value.is_vat_registered ? 'VAT-registered' : 'Non-VAT')],
      ['Business structure', structure.value],
      ['SEC / DTI number', regNo.value],
      ['Agency type', c.value.agency_type],
    ] as [string, string | null | undefined][],
  },
  {
    title: 'Trade profile',
    items: [
      ['Category', c.value.category],
      ['Products sold', c.value.product_sales_list],
      ['Target sales', c.value.target_sales],
      ['Payment method', c.value.payment_method],
      ['Sales rep (MSR)', c.value.agent_name],
      ['Channel', c.value.department ? c.value.department.toUpperCase() : null],
    ] as [string, string | null | undefined][],
  },
])
</script>

<template>
  <div class="pa-4 detail-panel">
    <CustomerTermsCard :customer="customer" :profile="profile" class="mb-4" />

    <v-row dense>
      <v-col v-for="group in groups" :key="group.title" cols="12" md="4">
        <div class="text-caption font-weight-bold text-medium-emphasis mb-2 text-uppercase">
          {{ group.title }}
        </div>
        <div v-for="[fieldLabel, value] in group.items" :key="fieldLabel" class="d-flex ga-2 mb-1">
          <span class="text-caption text-medium-emphasis flex-shrink-0" style="min-width: 130px">
            {{ fieldLabel }}
          </span>
          <FieldValue :value="value" />
        </div>
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
/* The app's theme is loaded dynamically and its named surface tokens resolve to
   brand colours, so `bg-surface-light` rendered solid red. Tint from the
   foreground colour instead — that works whatever palette is loaded, in light
   and dark. */
.detail-panel {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
