<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import SalesDashboard from './components/SalesDashboard.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <SalesDashboard />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
