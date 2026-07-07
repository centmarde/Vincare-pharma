<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import FinanceSectionTabs from './components/FinanceSectionTabs.vue'
import ExpensesCRUD from './components/ExpensesCRUD.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <FinanceSectionTabs />
        <ExpensesCRUD />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
