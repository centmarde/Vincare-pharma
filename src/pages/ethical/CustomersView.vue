<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <EthicalCustomersCRUD />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>

<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import EthicalCustomersCRUD from './components/EthicalCustomersCRUD.vue'
</script>
