<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import SupplierPayments from './components/SupplierPayments.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container>
        <SupplierPayments />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
