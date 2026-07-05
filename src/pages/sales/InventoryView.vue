<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import OutletInventory from './components/OutletInventory.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container>
        <OutletInventory />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
