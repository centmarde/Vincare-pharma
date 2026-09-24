<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import BookEntry from './components/BookEntry.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <BookEntry />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
