<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import SalesHistory from './components/SalesHistory.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <SalesHistory />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
