<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import IncomeStatement from './components/IncomeStatement.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <IncomeStatement />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
