<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import AccountsReceivable from './components/AccountsReceivable.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <AccountsReceivable />
    </template>
  </InnerLayoutWrapper>
</template>
