<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import ExpenseReport from './components/ExpenseReport.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <ExpenseReport />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
