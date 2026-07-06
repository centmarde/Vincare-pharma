<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import BalanceSheet from './components/BalanceSheet.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <BalanceSheet />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
