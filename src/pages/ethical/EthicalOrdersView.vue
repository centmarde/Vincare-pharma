<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <EthicalOrders />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>

<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import EthicalOrders from './components/EthicalOrders.vue'
</script>
