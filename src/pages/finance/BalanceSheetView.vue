<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import FinanceSectionTabs from './components/FinanceSectionTabs.vue'
import BalanceSheet from './components/BalanceSheet.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <FinanceSectionTabs />
        <BalanceSheet />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
