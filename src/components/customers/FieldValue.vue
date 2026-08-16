<script setup lang="ts">
import { computed } from 'vue'
import { label, isBlank } from '@/utils/helpers'

/**
 * A customer field that may not have been filled in yet.
 *
 * Most of the real customer file is incomplete, so "not set yet" appears on a
 * lot of rows. Rendering it small and de-emphasised keeps a table readable —
 * the eye skips the gaps and lands on the values that are actually there.
 */
const props = defineProps<{ value?: string | number | null }>()

const blank = computed(() => isBlank(props.value))
const text = computed(() => label(props.value))
</script>

<template>
  <span :class="blank ? 'text-medium-emphasis font-italic' : 'text-body-2'">{{ text }}</span>
</template>
