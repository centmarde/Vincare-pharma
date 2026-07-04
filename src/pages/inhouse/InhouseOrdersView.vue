<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import InhouseOrders from './components/InhouseOrders.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <InhouseOrders />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
