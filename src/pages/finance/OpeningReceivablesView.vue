<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import OpeningReceivables from './components/OpeningReceivables.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <OpeningReceivables />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
