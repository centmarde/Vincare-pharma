<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import FinanceSectionTabs from './components/FinanceSectionTabs.vue'
import DiscrepanciesPanel from './components/DiscrepanciesPanel.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <FinanceSectionTabs />
        <DiscrepanciesPanel />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
