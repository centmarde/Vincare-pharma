<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import SalesCustomers from './components/SalesCustomers.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <SalesCustomers />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
