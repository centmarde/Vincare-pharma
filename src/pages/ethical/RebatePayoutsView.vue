<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import RebatePayouts from './components/RebatePayouts.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <RebatePayouts />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
