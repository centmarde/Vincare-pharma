<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import InhouseOrders from './components/InhouseOrders.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <InhouseOrders />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
