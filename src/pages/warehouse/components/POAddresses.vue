<script setup lang="ts">
import { company } from '@/pages/purchasing/composables/usePODetailModal'

// Supplier / Ship To address cards.
defineProps<{ mobile: boolean }>()
</script>

<template>
  <v-row class="mb-4" align="stretch">
    <v-col :cols="mobile ? 12 : 6" class="d-flex flex-column">
      <div
        :class="
          mobile
            ? 'text-caption font-weight-bold text-medium-emphasis mb-1'
            : 'text-caption font-weight-bold text-medium-emphasis mb-2'
        "
      >
        SUPPLIER
      </div>
      <v-card flat border rounded="lg" class="pa-3 flex-grow-1 d-flex align-center justify-center">
        <span class="text-body-2 text-medium-emphasis">—</span>
      </v-card>
    </v-col>

    <v-col :cols="mobile ? 12 : 6" class="d-flex flex-column">
      <div
        :class="
          mobile
            ? 'text-caption font-weight-bold text-medium-emphasis mb-1'
            : 'text-caption font-weight-bold text-medium-emphasis mb-2'
        "
      >
        SHIP TO
      </div>
      <v-card flat border rounded="lg" class="pa-3 flex-grow-1">
        <div class="text-body-1 font-weight-medium mb-1">{{ company.name }}</div>
        <div class="text-body-2">{{ company.address }}</div>
        <div class="text-body-2">{{ company.contact }}</div>
        <div class="text-body-2">{{ company.email }}</div>
      </v-card>
    </v-col>
  </v-row>
</template>
