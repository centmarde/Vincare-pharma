<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import FinanceSectionTabs from './components/FinanceSectionTabs.vue'
import IncomeStatement from './components/IncomeStatement.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <FinanceSectionTabs />
        <IncomeStatement />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
