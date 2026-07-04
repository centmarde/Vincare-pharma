<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import FinanceDashboard from './components/FinanceDashboard.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <FinanceDashboard />
    </template>
  </InnerLayoutWrapper>
</template>
