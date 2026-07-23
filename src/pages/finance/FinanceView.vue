<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import FinanceSectionTabs from './components/FinanceSectionTabs.vue'
import FinanceDashboard from './components/FinanceDashboard.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <FinanceSectionTabs />
        <FinanceDashboard />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
