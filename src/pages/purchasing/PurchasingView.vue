<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import PurchaseRequisition from '@/pages/purchasing/components/PurchaseRequisition.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
         <PurchaseRequisition />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
