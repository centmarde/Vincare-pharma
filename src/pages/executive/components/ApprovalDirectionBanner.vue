<script setup lang="ts">
import { computed } from 'vue'
import { bannerFor, directionMeta } from '../composables/approvalLabels'
import type { ApprovalKind } from '../composables/approvalLabels'

// The first thing on an approval: BUYING / SELLING / STOCK, and with whom —
// so a purchase requisition and an In-House sale can no longer be mistaken for
// each other (both show PO-2026-### numbers from the same series).
const props = defineProps<{ kind: ApprovalKind; raw: any }>()

const banner = computed(() => bannerFor(props.kind, props.raw))
const meta = computed(() => directionMeta[banner.value.direction])
</script>

<template>
  <!-- v-card, not v-sheet: a sheet has no tonal variant and rendered as a
       solid bar with low-contrast text and a chip lost in it. -->
  <v-card rounded="lg" :color="meta.color" variant="tonal" flat class="pa-2 px-3 mb-3 d-flex align-center ga-2">
    <v-icon :icon="meta.icon" size="18" />
    <v-chip size="x-small" :color="meta.color" variant="flat" label class="flex-shrink-0">{{ meta.label }}</v-chip>
    <span class="text-body-2 text-high-emphasis">{{ banner.text }}</span>
  </v-card>
</template>
