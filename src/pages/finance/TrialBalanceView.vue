<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import TrialBalance from './components/TrialBalance.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <TrialBalance />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
