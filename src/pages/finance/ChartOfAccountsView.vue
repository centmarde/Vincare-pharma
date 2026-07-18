<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import ChartOfAccounts from './components/ChartOfAccounts.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <ChartOfAccounts />
    </template>
  </InnerLayoutWrapper>
</template>
