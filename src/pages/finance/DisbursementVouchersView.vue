<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import FinanceSectionTabs from './components/FinanceSectionTabs.vue'
import DisbursementVouchers from './components/DisbursementVouchers.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <FinanceSectionTabs />
        <DisbursementVouchers />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
