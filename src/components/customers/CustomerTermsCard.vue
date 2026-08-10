<script setup lang="ts">
import { computed } from 'vue'
import type { CustomerType } from '@/stores/customersData'
import type { DiscountProfile } from '@/stores/discountsData'

/**
 * The commercial terms agreed with a customer.
 *
 * Two layers, deliberately shown together:
 *  - the NARRATIVE the business recorded (`price_offered`, `receipt_details`),
 *    which is the authoritative account of what was agreed;
 *  - the PARSED components from the `discounts` table, which is what the app
 *    can actually price from.
 *
 * When the parsed components don't reconcile to the agreed total, the card says
 * so plainly and the order dialogs refuse to price from them. That case is not
 * rare — 126 of the 1,142 customers with parsed terms, usually because a
 * multi-recipient split was only partly captured.
 *
 * `receipt_details` is rendered with `white-space: pre-line`: multi-recipient
 * rebates are genuinely multi-line and collapse into gibberish otherwise.
 */
const props = defineProps<{
  customer?: CustomerType | null
  profile?: DiscountProfile | null
  title?: string
}>()

const pricing = computed(() => props.customer?.price_offered?.trim() || null)
const rebates = computed(() => props.customer?.receipt_details?.trim() || null)
const terms = computed(() => props.customer?.term_days?.trim() || null)

const p = computed(() => props.profile ?? null)
const hasRates = computed(() =>
  !!p.value && (p.value.discountRate > 0 || p.value.adsRate > 0 || p.value.rebateRate > 0))
const unreconciled = computed(() => !!p.value && p.value.rows.length > 0 && !p.value.reconciles)

const hasAny = computed(() =>
  !!(pricing.value || rebates.value || terms.value || hasRates.value || unreconciled.value))
</script>

<template>
  <v-alert
    v-if="customer && hasAny"
    :type="unreconciled ? 'warning' : undefined"
    variant="tonal"
    density="compact"
    class="text-caption"
    :icon="unreconciled ? '$warning' : 'mdi-handshake-outline'"
  >
    <div class="font-weight-medium mb-1">{{ title ?? 'Agreed terms' }}</div>

    <!-- Parsed rates: what an order can actually compute from. -->
    <div v-if="hasRates" class="d-flex flex-wrap ga-2 mb-2">
      <v-chip v-if="p && p.discountRate > 0" size="x-small" variant="flat" color="primary">
        Discount {{ p.discountRate }}%
      </v-chip>
      <v-chip v-if="p && p.rebateRate > 0" size="x-small" variant="flat" color="deep-purple">
        Rebate {{ p.rebateRate }}%
      </v-chip>
      <v-chip v-if="p && p.adsRate > 0" size="x-small" variant="flat" color="teal">
        Ads {{ p.adsRate }}%
      </v-chip>
      <v-chip v-if="p && p.markupPercent != null" size="x-small" variant="tonal">
        Markup {{ p.markupPercent }}%
      </v-chip>
      <v-chip v-if="p && p.totalOffered != null" size="x-small" variant="text">
        Total offered {{ p.totalOffered }}%
      </v-chip>
    </div>

    <div v-if="unreconciled" class="mb-2">
      <strong>These terms don't add up — {{ p?.mismatchReason }}.</strong>
      Orders will not price from them; enter the discount manually against the recorded
      terms below.
    </div>

    <div v-if="pricing" class="d-flex ga-2 mb-1">
      <span class="text-medium-emphasis flex-shrink-0" style="min-width: 68px">Pricing</span>
      <span class="font-weight-medium">{{ pricing }}</span>
    </div>

    <div v-if="terms" class="d-flex ga-2 mb-1">
      <span class="text-medium-emphasis flex-shrink-0" style="min-width: 68px">Terms</span>
      <span class="font-weight-medium">{{ terms }}</span>
    </div>

    <div v-if="rebates" class="d-flex ga-2">
      <span class="text-medium-emphasis flex-shrink-0" style="min-width: 68px">Rebates</span>
      <span class="font-weight-medium terms-multiline">{{ rebates }}</span>
    </div>

    <div v-if="!hasRates && !unreconciled" class="text-medium-emphasis mt-2" style="font-size: 11px">
      Recorded terms, for reference — no parsed rates for this customer, so orders price at 0%.
    </div>
  </v-alert>
</template>

<style scoped>
/* Multi-recipient rebates are stored across several lines; keep them readable. */
.terms-multiline {
  white-space: pre-line;
}
</style>
