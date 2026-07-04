<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import GeneralJournal from './components/GeneralJournal.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <GeneralJournal />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
