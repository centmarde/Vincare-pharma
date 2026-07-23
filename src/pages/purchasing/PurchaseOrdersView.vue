<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import PurchaseOrderList from './components/PurchaseOrderList.vue';
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <PurchaseOrderList />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
