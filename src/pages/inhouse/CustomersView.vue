<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import CustomerCRUD from './components/CustomerCRUD.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <CustomerCRUD />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
