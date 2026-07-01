<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import BalanceSheet from './components/BalanceSheet.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <BalanceSheet />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
