<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import StockTransferCRUD from './components/StockTransferCRUD.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <v-card>
          <StockTransferCRUD />
        </v-card>
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
