<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import AccountsReceivable from './components/AccountsReceivable.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid>
        <AccountsReceivable />
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
