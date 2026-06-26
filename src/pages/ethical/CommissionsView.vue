<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <Commissions />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>

<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import Commissions from './components/Commissions.vue'
</script>
