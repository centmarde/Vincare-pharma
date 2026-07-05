<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import FinanceDashboard from './components/FinanceDashboard.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container>
        <FinanceDashboard />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
