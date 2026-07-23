<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import DeliveryReceipts from './components/DeliveryReceipts.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <DeliveryReceipts />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
