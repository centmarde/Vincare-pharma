<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import FinanceSectionTabs from './components/FinanceSectionTabs.vue'
import AccountsReceivable from './components/AccountsReceivable.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <FinanceSectionTabs />
        <AccountsReceivable />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
