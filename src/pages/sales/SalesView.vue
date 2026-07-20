<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import SalesDashboard from './components/SalesDashboard.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <SalesDashboard />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
