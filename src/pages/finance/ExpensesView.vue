<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import ExpensesCRUD from './components/ExpensesCRUD.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <ExpensesCRUD />
    </template>
  </InnerLayoutWrapper>
</template>
