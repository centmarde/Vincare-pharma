<script setup lang="ts">
import { computed } from 'vue'
import { productPreferenceLabel } from '@/stores/customersData'

// Whether a customer buys branded, generics or both — shown next to the
// customer wherever they are listed or picked. Renders nothing when unset.

const props = defineProps<{ value?: string | null }>()

const label = computed(() => productPreferenceLabel(props.value))
const color = computed(() => ({ branded: 'indigo', generics: 'teal', both: 'blue-grey' } as Record<string, string>)[props.value ?? ''] ?? 'grey')
</script>

<template>
  <v-chip v-if="label" size="x-small" variant="tonal" label :color="color" class="flex-shrink-0">
    {{ label }}
  </v-chip>
</template>
