<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import ChangeRequests from './components/ChangeRequests.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <ChangeRequests />
    </template>
  </InnerLayoutWrapper>
</template>
