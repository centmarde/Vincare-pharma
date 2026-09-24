<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import OpeningBalances from './components/OpeningBalances.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <OpeningBalances />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
