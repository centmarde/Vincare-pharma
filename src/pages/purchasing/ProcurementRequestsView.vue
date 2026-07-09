<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import ProcurementRequests from '@/pages/purchasing/components/ProcurementRequests.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <ProcurementRequests />
    </template>
  </InnerLayoutWrapper>
</template>
