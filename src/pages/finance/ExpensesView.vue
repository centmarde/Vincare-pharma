<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import ExpensesCRUD from './components/ExpensesCRUD.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container>
        <ExpensesCRUD />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
