<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import RemittanceCRUD from './components/RemittanceCRUD.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container>
        <v-card>
          <RemittanceCRUD />
        </v-card>
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
