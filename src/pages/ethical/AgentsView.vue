<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <AgentCRUD />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>

<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import AgentCRUD from './components/AgentCRUD.vue'
</script>
