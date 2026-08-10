<script setup lang="ts">
import { computed } from 'vue'
import type { DiscountProfile } from '@/stores/discountsData'

/**
 * A customer's agreed rates, compact enough for a table cell.
 *
 * Shows the components that actually price an order — discount, ads, rebate —
 * and warns when they don't reconcile to the agreed total, because those
 * customers are deliberately NOT priced automatically (see discountsData).
 */
const props = defineProps<{ profile?: DiscountProfile | null }>()

const p = computed(() => props.profile ?? null)
const hasRates = computed(() =>
  !!p.value && (p.value.discountRate > 0 || p.value.adsRate > 0 || p.value.rebateRate > 0))
const unreconciled = computed(() => !!p.value && p.value.rows.length > 0 && !p.value.reconciles)
</script>

<template>
  <div v-if="hasRates || unreconciled" class="d-flex align-center flex-wrap ga-1">
    <v-chip v-if="p && p.discountRate > 0" size="x-small" variant="flat" color="primary">
      D {{ p.discountRate }}%
    </v-chip>
    <v-chip v-if="p && p.adsRate > 0" size="x-small" variant="flat" color="teal">
      A {{ p.adsRate }}%
    </v-chip>
    <v-chip v-if="p && p.rebateRate > 0" size="x-small" variant="flat" color="deep-purple">
      R {{ p.rebateRate }}%
    </v-chip>
    <v-tooltip v-if="unreconciled" :text="p?.mismatchReason ?? ''">
      <template #activator="{ props: tip }">
        <v-icon v-bind="tip" icon="mdi-alert-circle-outline" color="warning" size="16" />
      </template>
    </v-tooltip>
  </div>
  <span v-else class="text-medium-emphasis">not set yet</span>
</template>
