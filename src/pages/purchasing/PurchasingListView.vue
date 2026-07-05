<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import PurchaseRequisitionList from '@/pages/purchasing/components/PurchaseRequisitionList.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <PurchaseRequisitionList />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
