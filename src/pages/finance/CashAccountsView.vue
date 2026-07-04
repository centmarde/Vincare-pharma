<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import CashAccountsPanel from './components/CashAccountsPanel.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <CashAccountsPanel />
    </template>
  </InnerLayoutWrapper>
</template>
