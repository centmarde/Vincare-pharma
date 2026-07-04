<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import OutletCRUD from './components/OutletCRUD.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <OutletCRUD />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
