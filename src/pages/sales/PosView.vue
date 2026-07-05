<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import PosTerminal from './components/PosTerminal.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container>
        <PosTerminal />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
