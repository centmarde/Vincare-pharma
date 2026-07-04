<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import StockTransferCRUD from '@/pages/sales/components/StockTransferCRUD.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <v-card>
          <StockTransferCRUD mode="warehouse" />
        </v-card>
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
