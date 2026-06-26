<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import SupplierPayments from './components/SupplierPayments.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <SupplierPayments />
    </template>
  </InnerLayoutWrapper>
</template>
